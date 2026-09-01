'use client'

import { ReactNode } from 'react'

import styles from './button.module.css'

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary'
  type?: 'button' | 'submit'
}

export function Button({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  type = 'button'
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]} ${disabled || loading ? styles.disabled : ''}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : null}
      <span>{children}</span>
    </button>
  )
}
