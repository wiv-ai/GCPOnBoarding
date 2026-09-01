'use client'

import { WIZARD_STEPS } from '@/lib/constants'
import { WizardStep } from '@/lib/types'

import styles from './stepper.module.css'

type StepperProps = {
  activeStep: WizardStep
}

export function Stepper({ activeStep }: StepperProps) {
  return (
    <ol className={styles.stepper} aria-label="Onboarding steps">
      {WIZARD_STEPS.map((step, index) => {
        const isActive = step.id === activeStep
        const isDone = step.id < activeStep
        return (
          <li
            key={step.id}
            className={`${styles.step} ${isActive ? styles.active : ''} ${isDone ? styles.done : ''}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className={styles.index}>{index + 1}</span>
            <span className={styles.label}>{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
