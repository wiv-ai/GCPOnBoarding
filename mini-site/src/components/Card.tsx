'use client'

import { ReactNode } from 'react'

import styles from './card.module.css'

type CardProps = {
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  centered?: boolean
}

export function Card({ title, subtitle, children, footer, centered }: CardProps) {
  return (
    <section className={`${styles.card} ${centered ? styles.centered : ''}`}>
      {(title || subtitle) && (
        <header className={styles.header}>
          {title ? <h1 className={styles.title}>{title}</h1> : null}
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </header>
      )}
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  )
}
