import { copy } from './copy'
import { PROVISION_PHASES } from './constants'
import {
  OnboardSession,
  OnboardTokenPayload,
  ProvisionPhase,
  ProvisionPhaseId,
  ProvisionPhaseStatus,
  ProvisionStatus,
  TokenStatus,
  WizardStep
} from './types'

type LoosePayload = Record<string, unknown>

const read = (source: LoosePayload | undefined, ...keys: string[]) =>
  keys.map(key => source?.[key]).find(value => value !== undefined && value !== null)

const readString = (source: LoosePayload | undefined, ...keys: string[]) => {
  const value = read(source, ...keys)
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

const flatten = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const TERMINAL_STATUSES: TokenStatus[] = ['completed', 'failed', 'expired']

const toTokenStatus = (raw: string): TokenStatus => {
  const flat = flatten(raw)
  if (flat === 'expired') return 'expired'
  if (flat === 'completed' || flat === 'complete' || flat === 'success') return 'completed'
  if (flat === 'failed' || flat === 'failure' || flat === 'error') return 'failed'
  if (flat === 'inprogress' || flat === 'active' || flat === 'started') return 'in_progress'
  if (flat === 'issued' || flat === 'pending') return 'issued'
  return 'issued'
}

export const toOnboardTokenPayload = (payload: LoosePayload): OnboardTokenPayload => {
  const data = (read(payload, 'data') as LoosePayload | undefined) ?? payload
  const tokenStatus = toTokenStatus(readString(data, 'tokenStatus', 'status', 'state', 'linkStatus'))
  const errorCode = readString(data, 'errorCode', 'error_code', 'code')
  const isTerminalByCode = [
    'invalid_onboard_token',
    'onboard_link_expired',
    'onboard_link_consumed',
    'onboard_link_terminal',
    'installation_not_found'
  ].includes(errorCode)
  const isTerminal =
    isTerminalByCode ||
    TERMINAL_STATUSES.includes(tokenStatus) ||
    (Boolean(read(data, 'error', 'errorMessage', 'error_message')) && tokenStatus !== 'in_progress')

  const rawStep = readString(data, 'step', 'wizardStep', 'currentStep', 'onboardStep')
  const step =
    rawStep === 'configure' || rawStep === 'provision' || rawStep === 'complete' || rawStep === 'connect'
      ? rawStep
      : undefined

  return {
    tokenStatus: isTerminal && tokenStatus === 'issued' ? 'failed' : tokenStatus,
    mspName: readString(
      data,
      'mspDisplayName',
      'msp_display_name',
      'mspName',
      'msp_name',
      'orgName',
      'organizationName',
      'requesterName'
    ),
    customerName:
      readString(data, 'customerDisplayName', 'customer_display_name', 'customerName', 'customer_name') ||
      undefined,
    organizationName: readString(data, 'organizationName', 'gcpOrganizationName', 'orgDisplayName') || undefined,
    hostProjectId: readString(data, 'hostProjectId', 'host_project_id', 'hostProject') || undefined,
    integrationName: readString(data, 'integrationName', 'integration_name') || undefined,
    errorMessage: readString(data, 'errorMessage', 'error_message', 'error', 'message') || undefined,
    errorPhase: readString(data, 'errorPhase', 'error_phase', 'failedPhase', 'phase') || undefined,
    step,
    isTerminal
  }
}

export const toOnboardSession = (payload: LoosePayload): OnboardSession => {
  const data = (read(payload, 'data') as LoosePayload | undefined) ?? payload
  const onboard = (read(data, 'onboard') as LoosePayload | undefined) ?? {}
  const organizations = Array.isArray(data.organizations) ? (data.organizations as LoosePayload[]) : []
  const firstOrg = organizations[0]
  const selectedId = readString(data, 'selectedOrganizationId', 'selected_organization_id')
  const selectedOrg =
    organizations.find(
      org => readString(org, 'id', 'organizationId', 'organization_id', 'name') === selectedId
    ) || firstOrg

  return {
    organizationId:
      readString(selectedOrg, 'id', 'organizationId', 'organization_id', 'orgId', 'name') ||
      readString(data, 'organizationId', 'selectedOrganizationId', 'selected_organization_id'),
    organizationName:
      readString(selectedOrg, 'displayName', 'display_name', 'name', 'organizationName') ||
      readString(data, 'organizationName'),
    hostProjectId:
      readString(
        data,
        'computedHostProjectId',
        'computed_host_project_id',
        'hostProjectId',
        'host_project_id',
        'selectedHostProjectId',
        'selected_host_project_id'
      ) || readString(selectedOrg, 'computedHostProjectId', 'computed_host_project_id'),
    integrationName: readString(
      data,
      'computedIntegrationName',
      'computed_integration_name',
      'integrationName',
      'integration_name'
    ),
    mspName: readString(onboard, 'mspDisplayName', 'msp_display_name', 'mspName', 'msp_name')
  }
}

const PHASE_KEYWORDS: Array<{ id: ProvisionPhaseId; keywords: string[] }> = [
  { id: 'serviceAccount', keywords: ['serviceaccount'] },
  { id: 'scope', keywords: ['organizationdiscovery', 'verifyingscope', 'scop', 'verifyinggrant'] },
  {
    id: 'hostProject',
    keywords: ['hostprojectcreation', 'hostprojectbilling', 'hostprojectvalidation', 'hostproject']
  },
  { id: 'verification', keywords: ['verification', 'verify'] },
  { id: 'impersonation', keywords: ['impersonat'] },
  {
    id: 'roleGrants',
    keywords: [
      'organizationrolegrants',
      'organizationrolegrant',
      'orgrolegrants',
      'rolegrants',
      'organizationrole',
      'rolegrant'
    ]
  },
  { id: 'apis', keywords: ['api'] }
]

const toPhaseId = (rawId: string): ProvisionPhaseId | undefined => {
  const flat = flatten(rawId)
  return PHASE_KEYWORDS.find(({ keywords }) => keywords.some(keyword => flat.includes(keyword)))?.id
}

const toPhaseStatus = (rawStatus: string): ProvisionPhaseStatus => {
  const flat = flatten(rawStatus)
  if (['completed', 'complete', 'success', 'succeeded', 'done', 'ok', 'finished', 'skipped', 'skip'].includes(flat)) {
    return 'completed'
  }
  if (['failed', 'failure', 'error', 'errored'].includes(flat)) return 'failed'
  if (['running', 'inprogress', 'started', 'active', 'processing'].includes(flat)) return 'running'
  return 'pending'
}

const PHASE_STATUS_PRIORITY: Record<ProvisionPhaseStatus, number> = {
  completed: 0,
  pending: 1,
  running: 2,
  failed: 3
}

export const MSP_PROVISION_PHASE_IDS: ProvisionPhaseId[] = PROVISION_PHASES.map(phase => phase.id)

export const toProvisionStatus = (payload: LoosePayload): ProvisionStatus => {
  const data = (read(payload, 'data') as LoosePayload | undefined) ?? payload
  const rawPhases = Array.isArray(data?.phases)
    ? data.phases
    : Array.isArray(data?.steps)
      ? data.steps
      : Array.isArray(data?.stages)
        ? data.stages
        : []

  const byId = new Map<ProvisionPhaseId, ProvisionPhase>()
  ;(rawPhases as LoosePayload[]).forEach(rawPhase => {
    const id = toPhaseId(readString(rawPhase, 'step', 'id', 'name', 'phase', 'backendStep', 'backend_step'))
    if (!id) return
    const status = toPhaseStatus(readString(rawPhase, 'status', 'state'))
    const error =
      status === 'failed' ? readString(rawPhase, 'error', 'errorMessage', 'reason', 'message') || undefined : undefined
    const statusLabel =
      status === 'failed' ? undefined : readString(rawPhase, 'statusLabel', 'label', 'message') || undefined
    const previous = byId.get(id)
    if (!previous || PHASE_STATUS_PRIORITY[status] > PHASE_STATUS_PRIORITY[previous.status]) {
      byId.set(id, { id, status, statusLabel, error })
    }
  })

  const phases = MSP_PROVISION_PHASE_IDS.map(id => byId.get(id) ?? { id, status: 'pending' as const })
  const rawStatus = flatten(readString(data, 'status', 'state'))
  const hasFailed =
    phases.some(phase => phase.status === 'failed') || ['failed', 'failure', 'error'].includes(rawStatus)
  const isCompleted =
    !hasFailed &&
    (['completed', 'complete', 'success', 'succeeded'].includes(rawStatus) ||
      phases.every(phase => phase.status === 'completed'))

  return {
    status: hasFailed ? 'failed' : isCompleted ? 'completed' : 'running',
    phases,
    errorMessage: readString(data, 'errorMessage', 'error_message', 'error') || undefined,
    errorPhase: readString(data, 'errorPhase', 'error_phase', 'failedPhase') || undefined
  }
}

export const toOAuthUrl = (payload: LoosePayload) => {
  const data = (read(payload, 'data') as LoosePayload | undefined) ?? payload
  return readString(data, 'authUrl', 'authorizationUrl', 'oauthUrl', 'redirectUrl', 'url')
}

export const triggerBlobDownload = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export const closeBrowserTab = () => {
  window.close()
  window.location.replace('about:blank')
}

export const stepFromQuery = (value?: string | null): WizardStep | undefined => {
  if (value === 'configure') return WizardStep.Configure
  if (value === 'provision') return WizardStep.Provision
  if (value === 'complete') return WizardStep.Complete
  if (value === 'connect') return WizardStep.Connect
  return undefined
}

export const terminalCopy = (tokenStatus?: TokenStatus, errorMessage?: string) => {
  if (tokenStatus === 'expired') {
    return { title: copy.terminal.expiredTitle, body: copy.terminal.expiredBody }
  }
  if (tokenStatus === 'completed') {
    return { title: copy.terminal.usedTitle, body: copy.terminal.usedBody }
  }
  return {
    title: copy.terminal.failedTitle,
    body: errorMessage || copy.terminal.failedBody
  }
}
