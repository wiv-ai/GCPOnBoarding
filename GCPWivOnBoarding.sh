#!/bin/bash

# Function to login to gcloud
gcloud_login() {
  gcloud auth login
}

# Set to disable all interactive prompts
gcloud config set disable_prompts true

# Function to check if a command executed successfully
check_error() {
  local exit_code="$1"
  local error_message="$2"

  if [ "$exit_code" -ne 0 ]; then
    echo "Error: $error_message"
    exit "$exit_code"
  fi
}

# Function to check if billing is enabled for a project
check_billing_enabled() {
  local project_id="$1"
  gcloud billing projects describe "$project_id" &>/dev/null
  return $?
}

# Function to enable a service API on a project
# Returns 0 on success, 1 on failure (non-fatal for billing-related errors)
enable_service_api() {
  local project_id="$1"
  local api_name="$2"
  local require_billing="${3:-false}"  # Optional parameter to indicate if billing is required

  # Check if the API is enabled, and enable it if not
  if ! gcloud services list --project="$project_id" --enabled 2>/dev/null | grep -q "$api_name"; then
    echo "Enabling $api_name on project $project_id..."
    local output
    output=$(gcloud services enable "$api_name" --project="$project_id" --quiet 2>&1)
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
      echo "$api_name enabled successfully."
      return 0
    else
      # Check if error is billing-related
      if echo "$output" | grep -qi "billing"; then
        echo "Warning: Failed to enable $api_name - billing account is not linked to this project."
        echo "  Some APIs require billing to be enabled. You can enable billing later and retry."
        if [ "$require_billing" == "true" ]; then
          echo "  This API is required for full functionality."
          return 1
        else
          echo "  Continuing without this API..."
          return 0  # Non-fatal, continue
        fi
      else
        echo "Error: Failed to enable $api_name on project $project_id."
        echo "$output"
        if [ "$require_billing" == "true" ]; then
          return 1
        else
          return 0  # Non-fatal, continue
        fi
      fi
    fi
  else
    echo "$api_name is already enabled on project $project_id."
    return 0
  fi
}

# Function to create a service account
create_service_account() {
  local service_account_name="$1"
  local display_name="$2"
  local project_id="$3"

  gcloud iam service-accounts create "$service_account_name" --project="$project_id" --display-name="$display_name" --quiet
  check_error $? "Failed to create service account $service_account_name in project $project_id."
}

# Roles granted to the Wiv service account at org or project level
WIV_SA_ROLES=(
  "roles/recommender.computeViewer"
  "roles/recommender.viewer"
  "roles/monitoring.viewer"
  "roles/compute.viewer"
  "roles/bigquery.jobUser"
  "roles/recommender.bigQueryCapacityCommitmentsViewer"
  "roles/container.viewer"
  "roles/bigquery.dataViewer"
  "roles/cloudsql.viewer"
  "roles/run.viewer"
  "roles/cloudfunctions.viewer"
  "roles/pubsub.viewer"
  "roles/spanner.viewer"
  "roles/logging.viewer"
  "roles/iam.securityReviewer"
  "roles/compute.networkViewer"
  "roles/cloudbuild.builds.viewer"
  "roles/dataflow.viewer"
  "roles/redis.viewer"
  "roles/securitycenter.viewer"
  "roles/cloudkms.viewer"
  "roles/artifactregistry.reader"
  "roles/gkebackup.viewer"
  "roles/cloudasset.viewer"
  "roles/bigquery.resourceViewer"
  "roles/billing.viewer"
)

# Apply all IAM bindings in a single set-iam-policy call to avoid CRM write rate limits
add_iam_bindings_batch() {
  local target="$1"
  local member="$2"
  local level="$3"
  shift 3
  local roles=("$@")

  if ! command -v jq &>/dev/null; then
    echo "Error: jq is required for batch IAM binding. Install jq and retry."
    exit 1
  fi

  local policy_file updated_policy_file
  policy_file=$(mktemp)
  updated_policy_file=$(mktemp)

  local max_attempts=5
  local attempt=1
  local wait_seconds=30

  while [ "$attempt" -le "$max_attempts" ]; do
    echo "Applying IAM policy bindings (${#roles[@]} roles, attempt $attempt/$max_attempts)..."

    local get_output
    if [ "$level" == "organization" ]; then
      get_output=$(gcloud organizations get-iam-policy "$target" --format=json 2>&1)
    else
      get_output=$(gcloud projects get-iam-policy "$target" --format=json 2>&1)
    fi

    if [ $? -ne 0 ]; then
      echo "$get_output"
      rm -f "$policy_file" "$updated_policy_file"
      exit 1
    fi

    echo "$get_output" > "$policy_file"
    cp "$policy_file" "$updated_policy_file"

    for role in "${roles[@]}"; do
      jq --arg role "$role" --arg member "$member" '
        .bindings = (
          (.bindings // []) |
          if map(.role) | index($role) then
            map(if .role == $role then .members = ((.members // []) + [$member] | unique) else . end)
          else
            . + [{"role": $role, "members": [$member]}]
          end
        )
      ' "$updated_policy_file" > "${updated_policy_file}.tmp" && mv "${updated_policy_file}.tmp" "$updated_policy_file"
    done

    local set_output
    if [ "$level" == "organization" ]; then
      set_output=$(gcloud organizations set-iam-policy "$target" "$updated_policy_file" --quiet 2>&1)
    else
      set_output=$(gcloud projects set-iam-policy "$target" "$updated_policy_file" --quiet 2>&1)
    fi
    local set_exit=$?

    if [ $set_exit -eq 0 ]; then
      echo "IAM policy bindings applied successfully."
      rm -f "$policy_file" "$updated_policy_file"
      return 0
    fi

    if echo "$set_output" | grep -qiE '429|RESOURCE_EXHAUSTED|RATE_LIMIT|rate limit|quota exceeded'; then
      echo "Rate limit hit, waiting ${wait_seconds}s before retry..."
      echo "$set_output"
      sleep "$wait_seconds"
      wait_seconds=$((wait_seconds * 2))
      attempt=$((attempt + 1))
    elif echo "$set_output" | grep -qiE '409|ABORTED|concurrent|etag'; then
      echo "Policy conflict detected, re-fetching policy in 5s..."
      echo "$set_output"
      sleep 5
      attempt=$((attempt + 1))
    else
      echo "Error: Failed to set IAM policy at $level level $target."
      echo "$set_output"
      rm -f "$policy_file" "$updated_policy_file"
      exit 1
    fi
  done

  echo "Error: Failed to set IAM policy after $max_attempts attempts."
  rm -f "$policy_file" "$updated_policy_file"
  exit 1
}

# Function to generate a service account key and export it
generate_service_account_key() {
  local service_account_email="$1"
  local key_file="$2"

  gcloud iam service-accounts keys create "$key_file" --iam-account="$service_account_email" --quiet
  check_error $? "Failed to generate service account key for $service_account_email."
}

# Function to create a GCP project
# Optional 3rd arg: organization ID so the project is created under the selected org
create_project() {
  local project_id="$1"
  local project_name="$2"
  local organization_id="${3:-}"
  local numeric_org="${organization_id##*/}"

  # Check if project already exists
  if gcloud projects describe "$project_id" &>/dev/null; then
    echo "Project $project_id already exists. Using existing project."
    if [ -n "$numeric_org" ]; then
      local parent_id parent_type
      parent_id=$(gcloud projects describe "$project_id" --format="value(parent.id)" 2>/dev/null)
      parent_type=$(gcloud projects describe "$project_id" --format="value(parent.type)" 2>/dev/null)
      if [ "$parent_type" = "organization" ] && [ "$parent_id" != "$numeric_org" ]; then
        echo "Warning: Existing project $project_id is under organization $parent_id, not the selected organization $numeric_org."
      fi
    fi
    return 0
  fi

  # Create the project under the selected organization when provided.
  # Without --organization, disable_prompts makes gcloud pick a default (often the root org).
  echo "Creating project $project_id..."
  if [ -n "$numeric_org" ]; then
    echo "Creating project under organization $numeric_org..."
    gcloud projects create "$project_id" --name="$project_name" --organization="$numeric_org" --quiet
  else
    gcloud projects create "$project_id" --name="$project_name" --quiet
  fi
  check_error $? "Failed to create project $project_id."
  
  # Wait for project to be fully available
  echo "Waiting for project to be fully available..."
  for i in {1..30}; do
    if gcloud projects describe "$project_id" &>/dev/null; then
      break
    fi
    sleep 2
  done
}

# Function to set BigQuery daily quota limit
set_bigquery_daily_quota() {
  local project_id="$1"
  local max_bytes_per_day="$2"

  local tb_per_day=$((max_bytes_per_day / 1099511627776))
  
  # Convert daily bytes to MiB for quota API (quotas are specified in MiB)
  # 1 MiB = 1,048,576 bytes
  local max_mib_per_day=$((max_bytes_per_day / 1048576))
  
  echo "Setting BigQuery daily quota limit for project $project_id..."
  echo "  - Maximum bytes billed per day: ${tb_per_day} TB (${max_mib_per_day} MiB)"
  
  # Enable BigQuery API first if not already enabled (non-fatal if billing not enabled)
  if ! enable_service_api "$project_id" "bigquery.googleapis.com"; then
    echo "Warning: BigQuery API could not be enabled. BigQuery cost limits cannot be set at this time."
    echo "Please enable billing and retry, or set the limits manually later."
    return 0  # Non-fatal, continue with script
  fi
  
  # Enable Service Usage API for quota management
  enable_service_api "$project_id" "serviceusage.googleapis.com"
  
  # Configure BigQuery daily quota
  gcloud config set project "$project_id" --quiet
  
  # Get access token for API calls
  local access_token=$(gcloud auth print-access-token 2>/dev/null)
  
  # Set daily quota limit using Service Usage API
  echo "Setting BigQuery daily quota limit to ${tb_per_day} TB (${max_mib_per_day} MiB)..."
  
  local quota_set=false
  
  # Method 1: Try using gcloud alpha services quota create with --force flag
  echo "  Attempting Method 1: gcloud alpha services quota create..."
  local quota_output1
  quota_output1=$(gcloud alpha services quota create \
    --service=bigquery.googleapis.com \
    --consumer="projects/$project_id" \
    --metric=bigquery.googleapis.com/quota/query/usage \
    --unit=1/d/{project} \
    --value="${max_mib_per_day}" \
    --force \
    --quiet 2>&1)
  local quota_exit1=$?
  
  if [ $quota_exit1 -eq 0 ]; then
    echo "  ✓ Successfully set daily quota limit via gcloud."
    quota_set=true
  else
    # Method 2: Try with explicit dimensions and --force
    echo "  Attempting Method 2: With explicit dimensions..."
    local quota_output2
    quota_output2=$(gcloud alpha services quota create \
      --service=bigquery.googleapis.com \
      --consumer="projects/$project_id" \
      --metric=bigquery.googleapis.com/quota/query/usage \
      --unit=1/d/{project} \
      --value="${max_mib_per_day}" \
      --dimensions=project="$project_id" \
      --force \
      --quiet 2>&1)
    local quota_exit2=$?
    
    if [ $quota_exit2 -eq 0 ]; then
      echo "  ✓ Successfully set daily quota limit with dimensions."
      quota_set=true
    else
      # Method 2b: Try updating existing override if create failed
      echo "  Attempting Method 2b: Update existing quota override..."
      local quota_output2b
      quota_output2b=$(gcloud alpha services quota update \
        --service=bigquery.googleapis.com \
        --consumer="projects/$project_id" \
        --metric=bigquery.googleapis.com/quota/query/usage \
        --unit=1/d/{project} \
        --value="${max_mib_per_day}" \
        --force \
        --quiet 2>&1)
      local quota_exit2b=$?
      
      if [ $quota_exit2b -eq 0 ]; then
        echo "  ✓ Successfully updated daily quota limit."
        quota_set=true
      else
        # Method 3: Try via Service Usage API REST call
        echo "  Attempting Method 3: Service Usage API REST call..."
        if [ -n "$access_token" ]; then
        # Get the parent name for the quota override
        local parent="projects/$project_id"
        
        # Create quota override via REST API
        local override_id="override-$(date +%s)-$$"
        local quota_api_url="https://serviceusage.googleapis.com/v1beta1/$parent/services/bigquery.googleapis.com/consumerQuotaMetrics/quota%2Fquery%2Fusage/limits/%2Fd%2Fproject/consumerOverrides/$override_id"
        
        local temp_file3=$(mktemp)
        cat > "$temp_file3" <<EOF
{
  "overrideValue": "${max_mib_per_day}"
}
EOF
        
        local response3=$(curl -s -w "\n%{http_code}" -X PUT \
          -H "Authorization: Bearer $access_token" \
          -H "Content-Type: application/json" \
          -d @"$temp_file3" \
          "$quota_api_url" 2>/dev/null)
        
        local http_code3=$(echo "$response3" | tail -n1)
        rm -f "$temp_file3"
        
        if [ "$http_code3" = "200" ] || [ "$http_code3" = "201" ]; then
          echo "  ✓ Successfully set daily quota limit via Service Usage API."
          quota_set=true
        else
          # Method 4: Try alternative API endpoint format
          echo "  Attempting Method 4: Alternative API endpoint..."
          local alt_quota_url="https://serviceusage.googleapis.com/v1/$parent/services/bigquery.googleapis.com/consumerQuotaMetrics/quota%2Fquery%2Fusage/limits/%2Fd%2Fproject/consumerOverrides"
          
          local temp_file4=$(mktemp)
          cat > "$temp_file4" <<EOF
{
  "name": "$parent/services/bigquery.googleapis.com/consumerQuotaMetrics/quota%2Fquery%2Fusage/limits/%2Fd%2Fproject/consumerOverrides/$override_id",
  "overrideValue": "${max_mib_per_day}"
}
EOF
          
          local response4=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Authorization: Bearer $access_token" \
            -H "Content-Type: application/json" \
            -d @"$temp_file4" \
            "$alt_quota_url?overrideId=$override_id" 2>/dev/null)
          
          local http_code4=$(echo "$response4" | tail -n1)
          rm -f "$temp_file4"
          
          if [ "$http_code4" = "200" ] || [ "$http_code4" = "201" ]; then
            echo "  ✓ Successfully set daily quota limit via alternative API endpoint."
            quota_set=true
          else
            # If all methods failed, provide error details
            if [ $quota_exit1 -ne 0 ] && [ $quota_exit2 -ne 0 ]; then
              echo "  Note: gcloud quota create attempts failed."
              if echo "$quota_output1$quota_output2" | grep -qi "COMMON_QUOTA_UNSAFE_OVERRIDE"; then
                echo "  Error: Quota decrease requires --force flag (already attempted)."
              fi
            fi
            if [ "$http_code3" != "200" ] && [ "$http_code3" != "201" ] && [ "$http_code4" != "200" ] && [ "$http_code4" != "201" ]; then
              echo "  Note: API attempts returned HTTP codes $http_code3/$http_code4."
            fi
            echo "  Quota may require 'Quota Administrator' role or may need to be set via Console."
          fi
        fi
        fi
      fi
    fi
  fi
  
  echo ""
  if [ "$quota_set" = true ]; then
    echo "✓ BigQuery daily quota successfully configured: ${tb_per_day} TB (${max_mib_per_day} MiB)"
  else
    echo "BigQuery daily quota configuration attempted: ${tb_per_day} TB (${max_mib_per_day} MiB)"
    echo "  Note: Quota may require 'Quota Administrator' role to be set programmatically"
  fi
}

# Main script
gcloud_login

# Prompt user for standalone or organization configuration
echo "Is this for a standalone project or an entire organization?"
select choice in "Standalone Project" "Entire Organization"; do
  case $choice in
    "Standalone Project")
      ORG_LEVEL="project"
      break
      ;;
    "Entire Organization")
      # Check if the user has organization-level permissions
      ORGANIZATIONS=$(gcloud organizations list --format="value(displayName,name)" 2>/dev/null)
      ORG_PERMISSIONS=$?

      if [ "$ORG_PERMISSIONS" -ne 0 ] || [ -z "$ORGANIZATIONS" ]; then
        echo "No organizations found or insufficient permissions to list organizations."
        echo "Defaulting to standalone project."
        ORG_LEVEL="project"
      else
        ORG_LEVEL="organization"
        IFS=$'\n' read -r -d '' -a org_array <<< "$ORGANIZATIONS"
        if [ ${#org_array[@]} -gt 1 ]; then
          echo "Multiple organizations found. Please choose one:"
          select org in "${org_array[@]}"; do
            ORGANIZATION_ID=$(echo "$org" | awk '{print $NF}')
            ORGANIZATION_NAME=$(echo "$org" | sed "s/ $ORGANIZATION_ID$//")
            break
          done
        else
          ORGANIZATION_ID=$(echo "$ORGANIZATIONS" | awk '{print $NF}')
          ORGANIZATION_NAME=$(echo "$ORGANIZATIONS" | sed "s/[[:space:]]$ORGANIZATION_ID$//")
        fi
        echo "Selected organization: $ORGANIZATION_NAME ($ORGANIZATION_ID)"
      fi

      if [ -z "$ORGANIZATION_ID" ]; then
        echo "Error: No organization ID found."
        exit 1
      fi
      break
      ;;
    *)
      echo "Invalid choice. Please choose either 'Standalone Project' or 'Entire Organization'."
      ;;
  esac
done

# Build the default project ID from the organization name
if [ "$ORG_LEVEL" = "organization" ]; then
  ORGANIZATION_SLUG=$(printf '%s' "$ORGANIZATION_NAME" |
    tr '[:upper:]' '[:lower:]' |
    sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' |
    cut -c1-22 |
    sed 's/-$//')

  if [ -z "$ORGANIZATION_SLUG" ]; then
    ORGANIZATION_SLUG="org-${ORGANIZATION_ID##*/}"
  fi

  DEFAULT_PROJECT_ID="wiv-gcp-$ORGANIZATION_SLUG"
else
  DEFAULT_PROJECT_ID="wiv-gcp-project"
fi
echo ""
echo "Enter the project ID for the Wiv service account project."
echo "The script will create a new project if it doesn't exist."
echo "Default project ID: $DEFAULT_PROJECT_ID"
echo "Press Enter to use default, or enter a custom project ID:"
read -r USER_PROJECT_ID

# Use default if user didn't provide input
if [ -z "$USER_PROJECT_ID" ]; then
  PROJECT_ID="$DEFAULT_PROJECT_ID"
else
  PROJECT_ID="$USER_PROJECT_ID"
fi

# Validate project ID format (lowercase letters, numbers, hyphens, 6-30 chars)
if ! [[ "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "Error: Invalid project ID format. Project IDs must be 6-30 characters, start with a lowercase letter, and contain only lowercase letters, numbers, and hyphens."
  echo "Project ID cannot start or end with a hyphen."
  exit 1
fi

# Create the project if it doesn't exist (under the selected org when onboarding an organization)
if [ "$ORG_LEVEL" = "organization" ]; then
  create_project "$PROJECT_ID" "Wiv GCP Project" "$ORGANIZATION_ID"
else
  create_project "$PROJECT_ID" "Wiv GCP Project"
fi

# Check if billing is enabled
echo "Checking billing status for project $PROJECT_ID..."
if ! check_billing_enabled "$PROJECT_ID"; then
  echo ""
  echo "Warning: No billing account is linked to project $PROJECT_ID."
  echo "Some APIs require billing to be enabled. The script will continue but some APIs may fail."
  echo "To enable billing, run:"
  echo "  gcloud billing projects link $PROJECT_ID --billing-account=BILLING_ACCOUNT_ID"
  echo ""
fi

# Enable necessary APIs on the specified project
# APIs that typically don't require billing
enable_service_api "$PROJECT_ID" "iam.googleapis.com"
enable_service_api "$PROJECT_ID" "cloudresourcemanager.googleapis.com"

# APIs that may require billing (non-fatal if they fail)
enable_service_api "$PROJECT_ID" "recommender.googleapis.com"
enable_service_api "$PROJECT_ID" "compute.googleapis.com"
enable_service_api "$PROJECT_ID" "bigquery.googleapis.com"

# Set BigQuery daily quota limit: 1TB per day
MAX_BYTES_1TB=1099511627776  # 1 TB = 1 * 1024 * 1024 * 1024 * 1024
set_bigquery_daily_quota "$PROJECT_ID" "$MAX_BYTES_1TB"

# Create service account "wiv-sa" with display name "Wiv Service Account" in the specified project
create_service_account "wiv-sa" "Wiv Service Account" "$PROJECT_ID"

# Wait for the service account to be fully available
SERVICE_ACCOUNT_EMAIL="wiv-sa@$PROJECT_ID.iam.gserviceaccount.com"
for i in {1..10}; do
  if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
    break
  fi
  echo "Waiting for service account to be available..."
  sleep 2
done

# Generate a service account key and export it to the current directory
generate_service_account_key "$SERVICE_ACCOUNT_EMAIL" "key.json"

# Add IAM policy bindings
if [ "$ORG_LEVEL" == "organization" ]; then
  TARGET_ID="$ORGANIZATION_ID"
  ROLES_TO_APPLY=("${WIV_SA_ROLES[@]}")
else
  TARGET_ID="$PROJECT_ID"
  # Skip org-scoped roles that are not applicable (or commonly fail) on a standalone project
  ROLES_TO_APPLY=()
  for role in "${WIV_SA_ROLES[@]}"; do
    case "$role" in
      "roles/billing.viewer"|"roles/securitycenter.viewer")
        echo "Skipping $role for standalone project (org-scoped / not applicable)."
        ;;
      *)
        ROLES_TO_APPLY+=("$role")
        ;;
    esac
  done
fi

WIV_SA_MEMBER="serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com"
add_iam_bindings_batch "$TARGET_ID" "$WIV_SA_MEMBER" "$ORG_LEVEL" "${ROLES_TO_APPLY[@]}"


echo "Service account key has been exported to the current directory."
echo "IAM policy bindings added successfully at $ORG_LEVEL level ($TARGET_ID)."

echo -e "\n=== Onboarding Complete ==="
echo "Project $PROJECT_ID has been created/configured."
echo "Service account wiv-sa@$PROJECT_ID.iam.gserviceaccount.com has been created and configured."
echo "All necessary permissions have been granted at $ORG_LEVEL level for $TARGET_ID."

# Check billing status for final summary
if ! check_billing_enabled "$PROJECT_ID"; then
  echo ""
  echo "⚠️  Note: Billing is not enabled for this project."
  echo "Some APIs may not be enabled. Enable billing to activate all features."
else
  echo "BigQuery daily quota has been configured automatically:"
  echo "  - Maximum bytes billed per day: 1 TB"
fi

echo "Key file has been saved as key.json in the current directory."

echo -e "\n=== Configuration Summary ==="
echo "Project ID: $PROJECT_ID"
echo "Service Account: wiv-sa@$PROJECT_ID.iam.gserviceaccount.com"
echo "Key File Name: key.json"
echo "BigQuery Daily Quota (configured automatically):"
echo "  - Max bytes billed per day: 1 TB (1,099,511,627,776 bytes)"
if check_billing_enabled "$PROJECT_ID"; then
  echo "Billing Status: Enabled"
else
  echo "Billing Status: Not Enabled (some features may require billing)"
fi