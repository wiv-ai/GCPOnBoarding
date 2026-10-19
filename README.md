
```markdown
# # GCP Onboarding Script to Wiv Platform

This script automates the setup of a Google Cloud service account and the enabling of necessary APIs. The script performs the following tasks:
1. Authenticates with Google Cloud.
2. Enables required service APIs for a specified project.
3. Creates a service account.
4. Generates a key for the service account.
5. Adds IAM policy bindings for the service account at the organization level.

## Prerequisites

- Google Cloud SDK installed on your machine.
- Access to a Google Cloud account with appropriate permissions to perform the actions in the script.
- The ability to log in to Google Cloud and select an organization.

## Steps to Run the Script

1. **Open a Terminal**: Open your terminal or command prompt.

2. **Save the Script**: Save the provided script as a `.sh` file, for example, `setup_gcloud.sh`.

3. **Make the Script Executable**:
   ```bash
   chmod +x setup_gcloud.sh
   ```

4. **Run the Script**:
   ```bash
   ./setup_gcloud.sh
   ```

5. **Login to Google Cloud**:
   The script will prompt you to log in to your Google Cloud account:
   ```bash
   gcloud auth login
   ```
   Follow the on-screen instructions to complete the login process.

6. **Select an Organization**:
   If you have multiple organizations, the script will list them and ask you to select one:
   ```bash
   Multiple organizations found. Please choose one:
   1) Organization 1
   2) Organization 2
   ```
   Enter the number corresponding to your desired organization.

7. **Enter the Project ID**:
   The script will prompt you to enter the project ID where you want to create the service account:
   ```bash
   Enter the project ID to create the service account wiv-sa (usually project that contains the billing dataset):
   ```
   Enter the project ID and press Enter.

8. **Script Execution**:
   The script will perform the following actions:
    - Enable the necessary APIs (`recommender.googleapis.com`, `cloudresourcemanager.googleapis.com`, `compute.googleapis.com`) on the specified project.
    - Create a service account named `wiv-sa` with the display name "Wiv Service Account".
    - Generate a key for the service account and save it as `key.json` in the current directory.
    - Add IAM policy bindings for the service account at the organization level with roles: `roles/recommender.computeViewer`, `roles/monitoring.viewer`, `roles/compute.viewer`, and `roles/bigquery.jobUser`.

9. **Completion**:
   Upon successful completion, the script will output:
   ```bash
   Service account key has been exported to the current directory.
   IAM policy binding added successfully at organization level.
   ```

## Permissions Needed

The user running this script must have the following permissions in Google Cloud:

- **Project Level**:
    - `resourcemanager.projects.setIamPolicy`
    - `iam.serviceAccounts.create`
    - `iam.serviceAccounts.getIamPolicy`
    - `iam.serviceAccounts.setIamPolicy`
    - `iam.serviceAccountKeys.create`
    - `serviceusage.services.enable`

- **Organization Level**:
    - `resourcemanager.organizations.setIamPolicy`

These permissions are typically associated with roles such as `Project Owner`, `Organization Admin`, or custom roles that include the necessary permissions.

## Domain Restricted Sharing (organization policy)

This script grants roles only to `wiv-sa@<your-project>.iam.gserviceaccount.com`, a service account inside your own organization, so it is **not** affected by the `constraints/iam.allowedPolicyMemberDomains` organization policy.

The in-app keyless wizard is different: it grants `roles/iam.serviceAccountTokenCreator` to Wiv's platform service account (`wiv-gcp-platform@wiv-prod-1.iam.gserviceaccount.com`), which lives in Wiv's organization. If Domain Restricted Sharing is enforced, that step fails with:

```
One or more users named in the policy do not belong to a permitted customer.
User wiv-gcp-platform@wiv-prod-1.iam.gserviceaccount.com is not in permitted organization.
```

To allow it, an Organization Policy Administrator adds Wiv's organization principal set to the allowed values (scoped to the Wiv host project is enough):

```
principalSet://cloudresourcemanager.googleapis.com/organizations/809599052593
```

**Console:** IAM & Admin → Organization Policies → select the host project → **Domain restricted sharing** → **Manage policy** → **Override parent's policy** → **Add a rule** → **Custom** / **Allow** → add the value above alongside your own customer ID → **Set policy**.

**gcloud:**

```bash
cat > wiv-domain-policy.yaml <<'EOF'
name: projects/HOST_PROJECT_ID/policies/iam.allowedPolicyMemberDomains
spec:
  inheritFromParent: false
  rules:
    - values:
        allowedValues:
          - is:YOUR_CUSTOMER_ID
          - is:principalSet://cloudresourcemanager.googleapis.com/organizations/809599052593
EOF
gcloud org-policies set-policy wiv-domain-policy.yaml
```

Full guide: [GCP Onboarding Process](https://docs.wiv.ai/onboarding/cloud-integrations/gcp/gcp-onboarding-process) in the Wiv docs. If you cannot change organization policy, use this script instead.

By following these steps and ensuring you have the required permissions, you can successfully run the script to set up the necessary Google Cloud resources and configurations.
```

