'use client'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { copy } from '@/lib/copy'
import { ConfigureView } from '@/lib/types'

import styles from './steps.module.css'

type ConfigureStepProps = {
  organizationName: string
  hostProjectId: string
  integrationName: string
  view: ConfigureView
  applyError?: string
  hasDownloadedReport: boolean
  isDownloadingReport: boolean
  onApply: () => void
  onNext: () => void
  onDownloadReport: () => void
  onCloseTab: () => void
}

export function ConfigureStep(props: ConfigureStepProps) {
  const {
    organizationName,
    hostProjectId,
    integrationName,
    view,
    applyError,
    hasDownloadedReport,
    isDownloadingReport,
    onApply,
    onNext,
    onDownloadReport,
    onCloseTab
  } = props

  const isFailed = view === 'failed'
  const isSuccess = view === 'success'
  const isApplying = view === 'applying'
  const statusTitle =
    view === 'idle'
      ? copy.configure.applyToContinue
      : view === 'applying'
        ? copy.configure.applyingTitle
        : view === 'success'
          ? copy.configure.successTitle
          : copy.configure.failureTitle
  const statusBody =
    view === 'applying'
      ? copy.configure.applyingBody
      : view === 'failed'
        ? applyError || copy.configure.failureBody
        : undefined

  return (
    <Card
      title={copy.configure.title}
      footer={
        isFailed ? (
          <>
            <Button variant="secondary" onClick={onApply}>
              {copy.configure.retry}
            </Button>
            <Button variant="secondary" loading={isDownloadingReport} onClick={onDownloadReport}>
              {copy.actions.downloadReport}
            </Button>
            <Button disabled={!hasDownloadedReport} onClick={onCloseTab}>
              {copy.actions.closeTab}
            </Button>
          </>
        ) : (
          <Button disabled={!isSuccess} onClick={onNext}>
            {copy.actions.next}
          </Button>
        )
      }
    >
      <div className={styles.twoCol}>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>{copy.configure.organization}</span>
            <input value={organizationName} readOnly />
          </label>
          <label className={styles.field}>
            <span>{copy.configure.hostProject}</span>
            <input value={hostProjectId} readOnly />
          </label>
          <label className={styles.field}>
            <span>{copy.configure.integrationName}</span>
            <input value={integrationName} readOnly />
            <em>{copy.configure.integrationNameHelper}</em>
          </label>
          {!isFailed ? (
            <Button
              variant="secondary"
              loading={isApplying}
              disabled={!organizationName || !hostProjectId || isApplying || isSuccess}
              onClick={onApply}
            >
              {copy.configure.apply}
            </Button>
          ) : null}
        </div>
        <div className={styles.statusPanel}>
          <div
            className={`${styles.icon} ${isFailed ? styles.iconFail : isSuccess ? styles.iconOk : styles.iconInfo}`}
            aria-hidden
          >
            {isFailed ? '!' : isSuccess ? '✓' : '…'}
          </div>
          <h3 className={styles.statusTitle}>{statusTitle}</h3>
          {statusBody ? <p className={styles.statusBody}>{statusBody}</p> : null}
        </div>
      </div>
    </Card>
  )
}
