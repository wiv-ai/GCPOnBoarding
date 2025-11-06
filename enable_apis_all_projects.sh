#!/bin/bash

# Script to enable required APIs on all projects in an organization
# APIs enabled: iam.googleapis.com, recommender.googleapis.com, 
#               cloudresourcemanager.googleapis.com, compute.googleapis.com

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
# Returns 0 on success, non-zero on failure
enable_service_api() {
  local project_id="$1"
  local api_name="$2"

  # Check if the API is enabled, and enable it if not
  if ! gcloud services list --project="$project_id" --enabled 2>/dev/null | grep -q "$api_name"; then
    echo "  Enabling $api_name on project $project_id..."
    if gcloud services enable "$api_name" --project="$project_id" --quiet 2>/dev/null; then
      return 0
    else
      echo "  Warning: Failed to enable $api_name on project $project_id."
      return 1
    fi
  else
    echo "  $api_name is already enabled on project $project_id."
    return 0
  fi
}

# Main script
echo "=== GCP API Enabler for Organization ==="
echo "This script will enable the following APIs on all projects in your organization:"
echo "  - iam.googleapis.com"
echo "  - recommender.googleapis.com"
echo "  - cloudresourcemanager.googleapis.com"
echo "  - compute.googleapis.com"
echo ""

gcloud_login

# Get organization information
echo "Checking for organizations..."
ORGANIZATIONS=$(gcloud organizations list --format="value(displayName,name)" 2>/dev/null)
ORG_PERMISSIONS=$?

if [ "$ORG_PERMISSIONS" -ne 0 ] || [ -z "$ORGANIZATIONS" ]; then
  echo "Error: No organizations found or insufficient permissions to list organizations."
  echo "This script requires organization-level access."
  exit 1
fi

# Handle multiple organizations
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

if [ -z "$ORGANIZATION_ID" ]; then
  echo "Error: No organization ID found."
  exit 1
fi

echo ""
echo "Selected organization: $ORGANIZATION_NAME ($ORGANIZATION_ID)"
echo ""

# Function to get all projects in a folder (recursively)
get_projects_in_folder() {
  local folder_id="$1"
  local projects=""
  
  # Get projects directly in this folder
  local folder_projects=$(gcloud projects list --filter="parent.id:$folder_id" --format="value(projectId)" 2>/dev/null)
  if [ -n "$folder_projects" ]; then
    projects="$folder_projects"
  fi
  
  # Get subfolders and recurse
  local subfolders=$(gcloud resource-manager folders list --folder="$folder_id" --format="value(name)" 2>/dev/null | sed 's|folders/||')
  if [ -n "$subfolders" ]; then
    while IFS= read -r subfolder_id; do
      if [ -n "$subfolder_id" ]; then
        local subfolder_projects=$(get_projects_in_folder "$subfolder_id")
        if [ -n "$subfolder_projects" ]; then
          if [ -n "$projects" ]; then
            projects="$projects"$'\n'"$subfolder_projects"
          else
            projects="$subfolder_projects"
          fi
        fi
      fi
    done <<< "$subfolders"
  fi
  
  echo "$projects"
}

# List all projects in the organization
echo "Fetching all projects in the organization..."
echo "  - Checking for projects directly under organization..."
PROJECTS=""

# Get projects directly under the organization
ORG_PROJECTS=$(gcloud projects list --filter="parent.id:$ORGANIZATION_ID" --format="value(projectId)" 2>/dev/null)
if [ -n "$ORG_PROJECTS" ]; then
  PROJECTS="$ORG_PROJECTS"
  echo "  - Found projects directly under organization"
fi

# Get all folders in the organization
echo "  - Checking for projects in folders..."
FOLDERS=$(gcloud resource-manager folders list --organization="$ORGANIZATION_ID" --format="value(name)" 2>/dev/null | sed 's|folders/||')

if [ -n "$FOLDERS" ]; then
  echo "  - Found folders, searching for projects in folders..."
  while IFS= read -r folder_id; do
    if [ -n "$folder_id" ]; then
      FOLDER_PROJECTS=$(get_projects_in_folder "$folder_id")
      if [ -n "$FOLDER_PROJECTS" ]; then
        if [ -n "$PROJECTS" ]; then
          PROJECTS="$PROJECTS"$'\n'"$FOLDER_PROJECTS"
        else
          PROJECTS="$FOLDER_PROJECTS"
        fi
      fi
    fi
  done <<< "$FOLDERS"
fi

# Remove duplicates and sort
if [ -n "$PROJECTS" ]; then
  PROJECTS=$(echo "$PROJECTS" | sort -u)
fi

if [ -z "$PROJECTS" ]; then
  echo "Error: No projects found in this organization."
  echo "This could be due to:"
  echo "  1. Insufficient permissions to list projects/folders"
  echo "  2. No projects exist in the organization"
  exit 1
fi

# Count projects
PROJECT_COUNT=$(echo "$PROJECTS" | grep -v '^$' | wc -l | tr -d ' ')
if [ "$PROJECT_COUNT" -eq 0 ]; then
  echo "Error: No projects found."
  exit 1
fi

echo "Found $PROJECT_COUNT project(s) in the organization."
echo ""

# Confirm before proceeding
read -p "Do you want to enable APIs on all $PROJECT_COUNT project(s)? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Operation cancelled."
  exit 0
fi

echo ""
echo "Starting API enablement process..."
echo ""

# Define APIs to enable
APIS=(
  "iam.googleapis.com"
  "recommender.googleapis.com"
  "cloudresourcemanager.googleapis.com"
  "compute.googleapis.com"
)

# Process each project
SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_PROJECTS=()

while IFS= read -r PROJECT_ID; do
  if [ -z "$PROJECT_ID" ]; then
    continue
  fi
  
  echo "Processing project: $PROJECT_ID"
  
  # Enable each API
  PROJECT_SUCCESS=true
  for API in "${APIS[@]}"; do
    if ! enable_service_api "$PROJECT_ID" "$API"; then
      PROJECT_SUCCESS=false
    fi
  done
  
  if [ "$PROJECT_SUCCESS" = true ]; then
    echo "  ✓ Successfully enabled all APIs on project $PROJECT_ID"
    ((SUCCESS_COUNT++))
  else
    echo "  ✗ Failed to enable some APIs on project $PROJECT_ID"
    FAILED_PROJECTS+=("$PROJECT_ID")
    ((FAILED_COUNT++))
  fi
  
  echo ""
done <<< "$PROJECTS"

# Summary
echo "=== Summary ==="
echo "Total projects processed: $PROJECT_COUNT"
echo "Successful: $SUCCESS_COUNT"
echo "Failed: $FAILED_COUNT"

if [ $FAILED_COUNT -gt 0 ]; then
  echo ""
  echo "Failed projects:"
  for project in "${FAILED_PROJECTS[@]}"; do
    echo "  - $project"
  done
  echo ""
  echo "Note: Some projects may have failed due to insufficient permissions or project status."
fi

echo ""
echo "=== Process Complete ==="

