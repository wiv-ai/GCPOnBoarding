import { describe, expect, it } from 'vitest'

import {
  stepFromQuery,
  toOAuthUrl,
  toOnboardSession,
  toOnboardTokenPayload,
  toProvisionStatus
} from './normalize'
import { WizardStep } from './types'

describe('toOnboardTokenPayload', () => {
  it('maps issued token with msp display name as non-terminal', () => {
    const result = toOnboardTokenPayload({
      status: 'issued',
      msp_display_name: 'Commit',
      customer_display_name: 'AppCharge'
    })

    expect(result.tokenStatus).toBe('issued')
    expect(result.isTerminal).toBe(false)
    expect(result.mspName).toBe('Commit')
    expect(result.customerName).toBe('AppCharge')
  })

  it('marks expired tokens as terminal', () => {
    const result = toOnboardTokenPayload({
      status: 'expired',
      msp_display_name: 'Commit'
    })

    expect(result.tokenStatus).toBe('expired')
    expect(result.isTerminal).toBe(true)
  })

  it('treats known error codes as terminal', () => {
    const result = toOnboardTokenPayload({
      code: 'onboard_link_expired',
      message: 'expired'
    })

    expect(result.isTerminal).toBe(true)
  })
})

describe('toOnboardSession', () => {
  it('maps session payload with computed host project and org list', () => {
    const result = toOnboardSession({
      organizations: [{ id: 'org-1', display_name: 'AppCharge' }],
      computed_host_project_id: 'wiv-host-commit-appcharge',
      computed_integration_name: 'Commit·wiv-host-commit-appcharge',
      onboard: { msp_display_name: 'Commit' }
    })

    expect(result).toEqual({
      organizationId: 'org-1',
      organizationName: 'AppCharge',
      hostProjectId: 'wiv-host-commit-appcharge',
      integrationName: 'Commit·wiv-host-commit-appcharge',
      mspName: 'Commit'
    })
  })
})

describe('toProvisionStatus', () => {
  it('maps verifying_scope alias and verification phase', () => {
    const result = toProvisionStatus({
      status: 'running',
      steps: [
        { step: 'verifying_scope', status: 'completed' },
        { step: 'host_project_creation', status: 'completed', message: 'Created' },
        { step: 'api_enablement', status: 'in_progress' },
        { step: 'verification', status: 'pending' }
      ]
    })

    expect(result.status).toBe('running')
    expect(result.phases.find(phase => phase.id === 'scope')?.status).toBe('completed')
    expect(result.phases.find(phase => phase.id === 'hostProject')?.status).toBe('completed')
    expect(result.phases.find(phase => phase.id === 'apis')?.status).toBe('running')
    expect(result.phases.find(phase => phase.id === 'verification')?.status).toBe('pending')
  })

  it('marks overall status failed when a phase fails', () => {
    const result = toProvisionStatus({
      status: 'running',
      steps: [
        { step: 'verifying_scope', status: 'completed' },
        { step: 'organization_role_grants', status: 'failed', error: 'IAM denied' }
      ]
    })

    expect(result.status).toBe('failed')
    expect(result.phases.find(phase => phase.id === 'roleGrants')?.status).toBe('failed')
    expect(result.phases.find(phase => phase.id === 'roleGrants')?.error).toBe('IAM denied')
  })
})

describe('helpers', () => {
  it('extracts oauth url from nested payloads', () => {
    expect(toOAuthUrl({ data: { authorizationUrl: 'https://accounts.google.com/o/oauth2' } })).toBe(
      'https://accounts.google.com/o/oauth2'
    )
  })

  it('maps step query values', () => {
    expect(stepFromQuery('configure')).toBe(WizardStep.Configure)
    expect(stepFromQuery('provision')).toBe(WizardStep.Provision)
    expect(stepFromQuery('unknown')).toBeUndefined()
  })
})
