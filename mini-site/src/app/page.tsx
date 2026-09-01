import styles from './home.module.css'

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <h1 className={styles.title}>Wiv GCP onboard</h1>
        <p className={styles.body}>
          Open the one-time link from your MSP partner to connect Google Cloud. The path looks like{' '}
          <code className={styles.code}>/gcp-onboard/&lt;token&gt;</code>.
        </p>
      </div>
    </main>
  )
}
