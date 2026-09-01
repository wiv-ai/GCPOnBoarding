export const copy = {
  brand: 'Wiv',
  defaultMspName: 'your partner',
  steps: {
    connect: 'Connect',
    configure: 'Configure',
    provision: 'Provision',
    complete: 'Complete'
  },
  connect: {
    title: (mspName: string) => `${mspName} is requesting access to your GCP`,
    subtitle: 'Continue by granting access',
    whoIsAsking: (mspName: string) => `${mspName} asked you to connect your GCP environment.`,
    grantAccess: 'Connect to Google Cloud',
    failureTitle: 'Read access failed',
    failureBody: 'Download the report and share it with the sender of this link.',
    permissions: [
      { title: 'Read cloud metadata', description: 'Organizations, folders, and projects' },
      { title: 'Least-privilege roles only', description: 'No broad permissions granted' },
      { title: 'No service account keys', description: 'Nothing sensitive is downloaded' }
    ]
  },
  configure: {
    title: 'Confirm your GCP scope',
    organization: 'Organization',
    hostProject: 'Host project',
    integrationName: 'Integration name',
    integrationNameHelper: 'Generated automatically for this connection.',
    apply: 'Apply',
    applyToContinue: 'Apply to continue',
    applyingTitle: 'Configuring host project',
    applyingBody: 'Setting things up now',
    successTitle: 'Configuration confirmed',
    failureTitle: 'Configuring host project failed',
    failureBody: 'Download the report and share it with the sender of this link.',
    timeoutBody:
      'Host project setup timed out. Download the report and share it with the sender of this link.',
    retry: 'Try again'
  },
  provision: {
    title: 'Setting up your integration',
    phases: {
      scope: 'Verifying granted scope',
      hostProject: 'Host project setup',
      apis: 'API enablement',
      serviceAccount: 'Service account creation',
      roleGrants: 'Organization role grants',
      impersonation: 'Impersonation grant',
      verification: 'Verification'
    },
    status: { completed: 'Completed', failed: 'Failed' },
    phaseFailedTitle: (phase: string) => `${phase} failed`,
    failureBody: 'Download the report and share it with the sender of this link.'
  },
  complete: {
    successTitle: 'Your GCP environment is connected',
    successSubtitle: "You're connected. Wiv is now analyzing your GCP configuration.",
    failureTitle: "We couldn't connect your GCP environment",
    failureBody: 'Download the report and share it with the sender of this link.'
  },
  actions: {
    next: 'Next',
    downloadReport: 'Download report',
    closeTab: 'Close tab'
  },
  terminal: {
    expiredTitle: 'This link has expired',
    expiredBody: 'Ask the sender for a new integration link.',
    usedTitle: 'This link has already been used',
    usedBody: 'Ask the sender for a new integration link.',
    failedTitle: "We couldn't open this link",
    failedBody: 'Ask the sender for a new integration link.'
  },
  loading: 'Loading…',
  somethingWentWrong: 'Something went wrong. Please try again.'
} as const
