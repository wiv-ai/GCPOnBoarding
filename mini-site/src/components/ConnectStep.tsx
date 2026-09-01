'use client'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { copy } from '@/lib/copy'

import styles from './steps.module.css'

type ConnectStepProps = {
  mspName: string
  isGranting: boolean
  hasFailed: boolean
  hasDownloadedReport: boolean
  isDownloadingReport: boolean
  onGrantAccess: () => void
  onDownloadReport: () => void
  onCloseTab: () => void
}

export function ConnectStep(props: ConnectStepProps) {
  const {
    mspName,
    isGranting,
    hasFailed,
    hasDownloadedReport,
    isDownloadingReport,
    onGrantAccess,
    onDownloadReport,
    onCloseTab
  } = props

  if (hasFailed) {
    return (
      <Card
        footer={
          <>
            <Button variant="secondary" loading={isDownloadingReport} onClick={onDownloadReport}>
              {copy.actions.downloadReport}
            </Button>
            <Button disabled={!hasDownloadedReport} onClick={onCloseTab}>
              {copy.actions.closeTab}
            </Button>
          </>
        }
      >
        <div className={styles.resultPanel}>
          <div className={`${styles.icon} ${styles.iconFail}`} aria-hidden>!</div>
          <h2 className={styles.resultTitle}>{copy.connect.failureTitle}</h2>
          <p className={styles.resultBody}>{copy.connect.failureBody}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title={copy.connect.title(mspName)}
      subtitle={copy.connect.subtitle}
      footer={
        <Button loading={isGranting} onClick={onGrantAccess}>
          {copy.connect.grantAccess}
        </Button>
      }
    >
      <div className={styles.connectGrid}>
        <div className={styles.connectCopy}>
          <p className={styles.who}>{copy.connect.whoIsAsking(mspName)}</p>
          <ul className={styles.permissions}>
            {copy.connect.permissions.map(permission => (
              <li key={permission.title} className={styles.permission}>
                <span className={styles.check} aria-hidden>✓</span>
                <span>
                  <strong>{permission.title}</strong>
                  <span className={styles.permissionDesc}>{permission.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.heroArt} aria-hidden>
          <div className={styles.heroGlow} />
          <div className={styles.heroCard}>GCP</div>
        </div>
      </div>
    </Card>
  )
}
