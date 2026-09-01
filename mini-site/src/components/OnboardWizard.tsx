'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { CompleteStep } from '@/components/CompleteStep'
import { ConfigureStep } from '@/components/ConfigureStep'
import { ConnectStep } from '@/components/ConnectStep'
import { ProvisionStep } from '@/components/ProvisionStep'
import { Stepper } from '@/components/Stepper'
import { TerminalError } from '@/components/TerminalError'
import {
  confirmOnboardSession,
  downloadOnboardReport,
  fetchOnboardSession,
  fetchOnboardStatus,
  fetchOnboardToken,
  startOnboardOAuth
} from '@/lib/api'
import { CONFIGURE_APPLY_TIMEOUT_MS, PROVISION_POLL_MS, REPORT_FILENAME } from '@/lib/constants'
import { copy } from '@/lib/copy'
import {
  closeBrowserTab,
  stepFromQuery,
  toOAuthUrl,
  toOnboardSession,
  toOnboardTokenPayload,
  toProvisionStatus,
  triggerBlobDownload
} from '@/lib/normalize'
import {
  ConfigureView,
  OnboardSession,
  OnboardTokenPayload,
  ProvisionStatus,
  WizardStep
} from '@/lib/types'

import styles from './wizard.module.css'

type Props = { token: string }

function WizardBody({ token }: Props) {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(WizardStep.Connect)
  const [tokenPayload, setTokenPayload] = useState<OnboardTokenPayload>()
  const [session, setSession] = useState<OnboardSession>()
  const [status, setStatus] = useState<ProvisionStatus>()
  const [isLoadingToken, setIsLoadingToken] = useState(true)
  const [tokenError, setTokenError] = useState<string>()
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [connectFailed, setConnectFailed] = useState(false)
  const [isGranting, setIsGranting] = useState(false)
  const [configureView, setConfigureView] = useState<ConfigureView>('idle')
  const [configureError, setConfigureError] = useState<string>()
  const [hasDownloadedReport, setHasDownloadedReport] = useState(false)
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const applyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const applyRequestIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoadingToken(true)
      try {
        const payload = toOnboardTokenPayload(await fetchOnboardToken(token))
        if (cancelled) return
        setTokenPayload(payload)
        const queryStep = stepFromQuery(searchParams.get('step'))
        const tokenStep = stepFromQuery(payload.step)
        if (queryStep !== undefined) setStep(queryStep)
        else if (tokenStep !== undefined) setStep(tokenStep)
        if (searchParams.get('fail') === 'oauth') setConnectFailed(true)
      } catch (error) {
        if (!cancelled) {
          setTokenError(error instanceof Error ? error.message : copy.somethingWentWrong)
        }
      } finally {
        if (!cancelled) setIsLoadingToken(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, searchParams])

  useEffect(() => {
    if (step < WizardStep.Configure || tokenPayload?.isTerminal) return
    let cancelled = false
    ;(async () => {
      setIsLoadingSession(true)
      try {
        const next = toOnboardSession(await fetchOnboardSession(token))
        if (!cancelled) setSession(next)
      } catch {
        if (!cancelled) setSession(undefined)
      } finally {
        if (!cancelled) setIsLoadingSession(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, token, tokenPayload?.isTerminal])

  useEffect(() => {
    if (step < WizardStep.Provision || tokenPayload?.isTerminal) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const next = toProvisionStatus(await fetchOnboardStatus(token))
        if (cancelled) return
        setStatus(next)
        if (next.status === 'running') timer = setTimeout(poll, PROVISION_POLL_MS)
      } catch {
        if (!cancelled) timer = setTimeout(poll, PROVISION_POLL_MS)
      }
    }
    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [step, token, tokenPayload?.isTerminal])

  useEffect(() => () => clearTimeout(applyTimeoutRef.current), [])

  const handleDownloadReport = useCallback(async () => {
    setIsDownloadingReport(true)
    try {
      const blob = await downloadOnboardReport(token)
      triggerBlobDownload(blob, REPORT_FILENAME)
      setHasDownloadedReport(true)
    } catch {
      // keep close disabled
    } finally {
      setIsDownloadingReport(false)
    }
  }, [token])

  const handleGrantAccess = useCallback(async () => {
    setIsGranting(true)
    try {
      const authUrl = toOAuthUrl(await startOnboardOAuth(token))
      if (!authUrl) {
        setConnectFailed(true)
        return
      }
      window.location.assign(authUrl)
    } catch {
      setConnectFailed(true)
    } finally {
      setIsGranting(false)
    }
  }, [token])

  const handleApply = useCallback(async () => {
    if (!session?.organizationId || configureView === 'applying') return
    const requestId = ++applyRequestIdRef.current
    setConfigureView('applying')
    setConfigureError(undefined)
    clearTimeout(applyTimeoutRef.current)
    applyTimeoutRef.current = setTimeout(() => {
      if (applyRequestIdRef.current !== requestId) return
      applyRequestIdRef.current += 1
      setConfigureView('failed')
      setConfigureError(copy.configure.timeoutBody)
    }, CONFIGURE_APPLY_TIMEOUT_MS)

    try {
      await confirmOnboardSession(token, { organizationId: session.organizationId })
      if (applyRequestIdRef.current !== requestId) return
      clearTimeout(applyTimeoutRef.current)
      setConfigureView('success')
    } catch {
      if (applyRequestIdRef.current !== requestId) return
      clearTimeout(applyTimeoutRef.current)
      setConfigureView('failed')
      setConfigureError(copy.configure.failureBody)
    }
  }, [configureView, session?.organizationId, token])

  if (isLoadingToken) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>{copy.loading}</div>
      </div>
    )
  }

  if (!token || tokenError || tokenPayload?.isTerminal) {
    return (
      <div className={styles.page}>
        <TerminalError
          tokenStatus={tokenPayload?.tokenStatus}
          errorMessage={tokenPayload?.errorMessage || tokenError}
        />
      </div>
    )
  }

  const mspName = tokenPayload?.mspName || session?.mspName || copy.defaultMspName

  return (
    <div className={styles.page}>
      <header className={styles.brand}>
        <span className={styles.brandMark}>{copy.brand}</span>
        <span className={styles.brandSub}>GCP onboarding</span>
      </header>
      <Stepper activeStep={step} />
      {step === WizardStep.Connect ? (
        <ConnectStep
          mspName={mspName}
          isGranting={isGranting}
          hasFailed={connectFailed}
          hasDownloadedReport={hasDownloadedReport}
          isDownloadingReport={isDownloadingReport}
          onGrantAccess={handleGrantAccess}
          onDownloadReport={handleDownloadReport}
          onCloseTab={closeBrowserTab}
        />
      ) : null}
      {step === WizardStep.Configure ? (
        isLoadingSession ? (
          <div className={styles.loading}>{copy.loading}</div>
        ) : (
          <ConfigureStep
            organizationName={session?.organizationName || tokenPayload?.organizationName || ''}
            hostProjectId={session?.hostProjectId || tokenPayload?.hostProjectId || ''}
            integrationName={session?.integrationName || tokenPayload?.integrationName || ''}
            view={configureView}
            applyError={configureError}
            hasDownloadedReport={hasDownloadedReport}
            isDownloadingReport={isDownloadingReport}
            onApply={handleApply}
            onNext={() => {
              setHasDownloadedReport(false)
              setStep(WizardStep.Provision)
            }}
            onDownloadReport={handleDownloadReport}
            onCloseTab={closeBrowserTab}
          />
        )
      ) : null}
      {step === WizardStep.Provision ? (
        <ProvisionStep
          status={status}
          hasDownloadedReport={hasDownloadedReport}
          isDownloadingReport={isDownloadingReport}
          onNext={() => {
            setHasDownloadedReport(false)
            setStep(WizardStep.Complete)
          }}
          onDownloadReport={handleDownloadReport}
          onCloseTab={closeBrowserTab}
        />
      ) : null}
      {step === WizardStep.Complete ? (
        <CompleteStep
          hasFailed={status?.status === 'failed'}
          hasDownloadedReport={hasDownloadedReport}
          isDownloadingReport={isDownloadingReport}
          onDownloadReport={handleDownloadReport}
          onCloseTab={closeBrowserTab}
        />
      ) : null}
    </div>
  )
}

export function OnboardWizard({ token }: Props) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.loading}>{copy.loading}</div>
        </div>
      }
    >
      <WizardBody token={token} />
    </Suspense>
  )
}
