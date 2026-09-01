import { OnboardWizard } from '@/components/OnboardWizard'

type PageProps = {
  params: Promise<{ token: string }>
}

export default async function GcpOnboardPage({ params }: PageProps) {
  const { token } = await params
  return <OnboardWizard token={decodeURIComponent(token)} />
}
