export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const getAppServerBase = () => {
  const fromEnv = process.env.NEXT_PUBLIC_APP_SERVER_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') {
    const override = window.localStorage.getItem('app-server')?.replace(/\/$/, '')
    if (override) return override
  }
  return 'https://dev-app-server.wiv.ai'
}

const publicRequest = async (path: string, init?: RequestInit & { raw?: boolean }) => {
  const response = await fetch(`${getAppServerBase()}/${path}`, { ...init })
  if (!response.ok) {
    let message = response.statusText || 'Request failed'
    try {
      const error = await response.json()
      message =
        (typeof error?.message === 'string' && error.message) ||
        (typeof error?.error === 'string' && error.error) ||
        (typeof error?.error?.message === 'string' && error.error.message) ||
        message
    } catch {
      // keep statusText
    }
    throw new ApiError(message, response.status)
  }
  if (init?.raw) return response
  const cloned = response.clone()
  try {
    return await cloned.json()
  } catch {
    return await response.text()
  }
}

const tokenPath = (token: string) => `integrations/gcp/onboard/${encodeURIComponent(token)}`

export const fetchOnboardToken = (token: string) => publicRequest(tokenPath(token))
/** Avoid custom headers to prevent CORS preflight blocks at API Gateway. */
export const startOnboardOAuth = (token: string) => publicRequest(`${tokenPath(token)}/oauth/start`)
export const fetchOnboardSession = (token: string) => publicRequest(`${tokenPath(token)}/session`)
export const confirmOnboardSession = (token: string, body: Record<string, unknown>) =>
  publicRequest(`${tokenPath(token)}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
export const fetchOnboardStatus = (token: string) => publicRequest(`${tokenPath(token)}/status`)
export const downloadOnboardReport = async (token: string) => {
  const response = (await publicRequest(`${tokenPath(token)}/report`, { raw: true })) as Response
  return response.blob()
}
