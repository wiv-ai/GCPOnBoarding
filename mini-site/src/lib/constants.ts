import { copy } from './copy'
import { ProvisionPhaseId, WizardStep } from './types'

export const REPORT_FILENAME = 'gcp-onboard-report.csv'
export const PROVISION_POLL_MS = 2000
export const CONFIGURE_APPLY_TIMEOUT_MS = 60_000

export const WIZARD_STEPS = [
  { id: WizardStep.Connect, label: copy.steps.connect },
  { id: WizardStep.Configure, label: copy.steps.configure },
  { id: WizardStep.Provision, label: copy.steps.provision },
  { id: WizardStep.Complete, label: copy.steps.complete }
] as const

export const PROVISION_PHASES: Array<{ id: ProvisionPhaseId; label: string }> = [
  { id: 'scope', label: copy.provision.phases.scope },
  { id: 'hostProject', label: copy.provision.phases.hostProject },
  { id: 'apis', label: copy.provision.phases.apis },
  { id: 'serviceAccount', label: copy.provision.phases.serviceAccount },
  { id: 'roleGrants', label: copy.provision.phases.roleGrants },
  { id: 'impersonation', label: copy.provision.phases.impersonation },
  { id: 'verification', label: copy.provision.phases.verification }
]
