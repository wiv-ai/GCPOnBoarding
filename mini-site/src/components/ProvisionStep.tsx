'use client'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { PROVISION_PHASES } from '@/lib/constants'
import { copy } from '@/lib/copy'
import { ProvisionPhase, ProvisionStatus } from '@/lib/types'

import styles from './steps.module.css'

type ProvisionStepProps = {
  status?: ProvisionStatus
  hasDownloadedReport: boolean
  isDownloadingReport: boolean
  onNext: () => void
  onDownloadReport: () => void
  onCloseTab: () => void
}

export function ProvisionStep({
  status,
  hasDownloadedReport,
  isDownloadingReport,
  onNext,
  onDownloadReport,
  onCloseTab
}: ProvisionStepProps) {
  const phases: ProvisionPhase[] = status?.phases?.length
    ? status.phases
    : PROVISION_PHASES.map(phase => ({ id: phase.id, status: 'pending' }))
  const failedPhase = phases.find(phase => phase.status === 'failed')
  const isFailed = status?.status === 'failed' || Boolean(failedPhase)
  const isSucceeded = status?.status === 'completed' && !isFailed
  const failedLabel =
    PROVISION_PHASES.find(phase => phase.id === failedPhase?.id)?.label || status?.errorPhase || ''

  return (
    <Card
      title={copy.provision.title}
      footer={
        isFailed ? (
          <>
            <Button variant="secondary" loading={isDownloadingReport} onClick={onDownloadReport}>
              {copy.actions.downloadReport}
            </Button>
            <Button disabled={!hasDownloadedReport} onClick={onCloseTab}>
              {copy.actions.closeTab}
            </Button>
          </>
        ) : (
          <Button disabled={!isSucceeded} onClick={onNext}>
            {copy.actions.next}
          </Button>
        )
      }
    >
      <div className={styles.twoCol}>
        <ul className={styles.phaseList}>
          {PROVISION_PHASES.map(phaseDef => {
            const phase = phases.find(item => item.id === phaseDef.id)
            const phaseStatus = phase?.status ?? 'pending'
            return (
              <li
                key={phaseDef.id}
                className={`${styles.phase} ${
                  phaseStatus === 'completed'
                    ? styles.phaseDone
                    : phaseStatus === 'failed'
                      ? styles.phaseFail
                      : ''
                }`}
              >
                <span>{phaseDef.label}</span>
                <span className={styles.phaseStatus}>
                  {phaseStatus === 'completed' ? (
                    <>
                      <span>{phase?.statusLabel || copy.provision.status.completed}</span>
                      <span className={`${styles.miniIcon} ${styles.iconOk}`}>✓</span>
                    </>
                  ) : null}
                  {phaseStatus === 'failed' ? (
                    <>
                      <span>{copy.provision.status.failed}</span>
                      <span className={`${styles.miniIcon} ${styles.iconFail}`}>!</span>
                    </>
                  ) : null}
                  {phaseStatus === 'running' ? <span className={styles.runningDot} /> : null}
                  {phaseStatus === 'pending' ? <span className={styles.pendingDot} /> : null}
                </span>
              </li>
            )
          })}
        </ul>
        <div className={styles.statusPanel}>
          {isFailed ? (
            <>
              <div className={`${styles.icon} ${styles.iconFail}`} aria-hidden>!</div>
              <h3 className={styles.statusTitle}>
                {failedLabel ? copy.provision.phaseFailedTitle(failedLabel) : copy.complete.failureTitle}
              </h3>
              <p className={styles.statusBody}>
                {failedPhase?.error || status?.errorMessage || copy.provision.failureBody}
              </p>
            </>
          ) : (
            <>
              <div className={styles.loader} aria-hidden />
              <p className={styles.statusBody}>{copy.provision.title}</p>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
