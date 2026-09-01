'use client'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { copy } from '@/lib/copy'

import styles from './steps.module.css'

type CompleteStepProps = {
  hasFailed: boolean
  hasDownloadedReport: boolean
  isDownloadingReport: boolean
  onDownloadReport: () => void
  onCloseTab: () => void
}

export function CompleteStep({
  hasFailed,
  hasDownloadedReport,
  isDownloadingReport,
  onDownloadReport,
  onCloseTab
}: CompleteStepProps) {
  return (
    <Card
      centered
      footer={
        hasFailed ? (
          <>
            <Button variant="secondary" loading={isDownloadingReport} onClick={onDownloadReport}>
              {copy.actions.downloadReport}
            </Button>
            <Button disabled={!hasDownloadedReport} onClick={onCloseTab}>
              {copy.actions.closeTab}
            </Button>
          </>
        ) : (
          <Button onClick={onCloseTab}>{copy.actions.closeTab}</Button>
        )
      }
    >
      <div className={styles.resultPanel}>
        <div className={`${styles.icon} ${hasFailed ? styles.iconFail : styles.iconOk}`} aria-hidden>
          {hasFailed ? '!' : '✓'}
        </div>
        <h2 className={styles.resultTitle}>
          {hasFailed ? copy.complete.failureTitle : copy.complete.successTitle}
        </h2>
        <p className={styles.resultBody}>
          {hasFailed ? copy.complete.failureBody : copy.complete.successSubtitle}
        </p>
      </div>
    </Card>
  )
}
