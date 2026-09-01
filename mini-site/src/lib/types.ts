export enum WizardStep {
  Connect = 0,
  Configure = 1,
  Provision = 2,
  Complete = 3
}

export type ConfigureView = 'idle' | 'applying' | 'success' | 'failed'
export type TokenStatus = 'issued' | 'in_progress' | 'completed' | 'failed' | 'expired'

export type OnboardTokenPayload = {
  tokenStatus: TokenStatus
  mspName: string
  customerName?: string
  organizationName?: string
  hostProjectId?: string
  integrationName?: string
  errorMessage?: string
  errorPhase?: string
  step?: 'connect' | 'configure' | 'provision' | 'complete'
  isTerminal: boolean
}

export type OnboardSession = {
  organizationId: string
  organizationName: string
  hostProjectId: string
  integrationName: string
  mspName: string
}

export type ProvisionPhaseId =
  | 'scope'
  | 'hostProject'
  | 'apis'
  | 'serviceAccount'
  | 'roleGrants'
  | 'impersonation'
  | 'verification'

export type ProvisionPhaseStatus = 'pending' | 'running' | 'completed' | 'failed'

export type ProvisionPhase = {
  id: ProvisionPhaseId
  status: ProvisionPhaseStatus
  statusLabel?: string
  error?: string
}

export type ProvisionStatus = {
  status: 'running' | 'completed' | 'failed'
  phases: ProvisionPhase[]
  errorMessage?: string
  errorPhase?: string
}
