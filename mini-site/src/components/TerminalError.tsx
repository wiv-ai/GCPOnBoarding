'use client'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { copy } from '@/lib/copy'
import { closeBrowserTab, terminalCopy } from '@/lib/normalize'
import { TokenStatus } from '@/lib/types'

import styles from './steps.module.css'

type TerminalErrorProps = {
  tokenStatus?: TokenStatus
  errorMessage?: string
}

export function TerminalError({ tokenStatus, errorMessage }: TerminalErrorProps) {
  const { title, body } = terminalCopy(tokenStatus, errorMessage)
  return (
    <Card centered footer={<Button onClick={closeBrowserTab}>{copy.actions.closeTab}</Button>}>
      <div className={styles.resultPanel}>
        <div className={`${styles.icon} ${styles.iconFail}`} aria-hidden>!</div>
        <h2 className={styles.resultTitle}>{title}</h2>
        <p className={styles.resultBody}>{body}</p>
      </div>
    </Card>
  )
}
