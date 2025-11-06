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

# Function to enable a service API on a project
enable_service_api() {
  local project_id="$1"
  local api_name="$2"

  # Check if the API is enabled, and enable it if not
  if ! gcloud services list --project="$project_id" | grep -q "$api_name"; then
    gcloud services enable "$api_name" --project="$project_id" --quiet
    check_error $? "Failed to enable $api_name on project $project_id."
  else
    echo "$api_name is already enabled on project $project_id."
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

# Function to add IAM policy binding
add_iam_binding() {
  local target="$1"
  local member="$2"
  local role="$3"
  local level="$4"

  if [ "$level" == "organization" ]; then
    gcloud organizations add-iam-policy-binding "$target" --member="$member" --role="$role" --condition=None --quiet
  elif [ "$level" == "project" ]; then
    gcloud projects add-iam-policy-binding "$target" --member="$member" --role="$role" --condition=None --quiet
  fi

  check_error $? "Failed to add IAM policy binding for $member with role $role at $level level $target."
}

# Function to generate a service account key and export it
generate_service_account_key() {
  local service_account_email="$1"
  local key_file="$2"

  gcloud iam service-accounts keys create "$key_file" --iam-account="$service_account_email" --quiet
  check_error $? "Failed to generate service account key for $service_account_email."
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
          ORGANIZATION_NAME=$(echo "$ORGANIZATIONS" | awk '{print $1}')
          ORGANIZATION_ID=$(echo "$ORGANIZATIONS" | awk '{print $2}')
        fi
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

echo "Enter the project ID to create the service account wiv-sa (usually project that contains the billing dataset):"
read PROJECT_ID

# Enable necessary APIs on the specified project
enable_service_api "$PROJECT_ID" "iam.googleapis.com"
enable_service_api "$PROJECT_ID" "recommender.googleapis.com"
enable_service_api "$PROJECT_ID" "cloudresourcemanager.googleapis.com"
enable_service_api "$PROJECT_ID" "compute.googleapis.com"

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
else
  TARGET_ID="$PROJECT_ID"
fi

add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/recommender.computeViewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/recommender.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/monitoring.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/compute.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/bigquery.jobUser" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/recommender.bigQueryCapacityCommitmentsViewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/container.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/bigquery.dataViewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/cloudsql.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/run.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/cloudfunctions.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/pubsub.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/spanner.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/logging.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/iam.securityReviewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/compute.networkViewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/cloudbuild.builds.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/dataflow.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/redis.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/securitycenter.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/cloudkms.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/artifactregistry.reader" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/gkebackup.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/cloudasset.viewer" "$ORG_LEVEL"
add_iam_binding "$TARGET_ID" "serviceAccount:wiv-sa@$PROJECT_ID.iam.gserviceaccount.com" "roles/bigquery.resourceViewer" "$ORG_LEVEL"

echo "Service account key has been exported to the current directory."
echo "IAM policy bindings added successfully at $ORG_LEVEL level ($TARGET_ID)."

echo -e "\n=== Onboarding Complete ==="
echo "Service account wiv-sa@$PROJECT_ID.iam.gserviceaccount.com has been created and configured."
echo "All necessary permissions have been granted at $ORG_LEVEL level for $TARGET_ID."
echo "Key file has been saved as key.json in the current directory."

echo -e "\n=== Configuration Summary ==="
echo "Service Account Project: $PROJECT_ID"
echo "Key File Name: key.json"