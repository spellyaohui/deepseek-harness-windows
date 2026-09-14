const LOOPBACK_HOST = '127.0.0.1'
const AUTH_COOKIE_PREFIX = 'dsh-auth-'

function isStaleLoopbackAuthCookie(cookie) {
  return cookie?.domain === LOOPBACK_HOST
    && typeof cookie.name === 'string'
    && cookie.name.startsWith(AUTH_COOKIE_PREFIX)
}

function loopbackCookieUrl(cookie) {
  const path = typeof cookie.path === 'string' && cookie.path.startsWith('/')
    ? cookie.path
    : '/'
  return `http://${LOOPBACK_HOST}${path}`
}

function parseCurrentLoopbackServiceUrl(serviceUrl) {
  if (typeof serviceUrl !== 'string') return undefined
  try {
    const url = new URL(serviceUrl)
    return url.protocol === 'http:' && url.hostname === LOOPBACK_HOST ? url : undefined
  } catch {
    return undefined
  }
}

/** True only for the current service's aggregated plugin-module header overflow. */
export function isLoopbackPluginsResponse431(details, serviceUrl) {
  const service = parseCurrentLoopbackServiceUrl(serviceUrl)
  if (service === undefined || details?.statusCode !== 431 || typeof details.url !== 'string') return false
  try {
    const response = new URL(details.url)
    return response.origin === service.origin && response.pathname.startsWith('/plugins/')
  } catch {
    return false
  }
}

/**
 * Keeps old random-port DSH authentication cookies from overflowing Chromium's
 * request header. It never touches other loopback cookies, domains, or storage.
 */
export function createLoopbackAuthCookieRecovery({ cookies, getServiceUrl, loadServiceUrl }) {
  let recoveryStarted = false

  async function clearStaleLoopbackAuthCookies() {
    const staleCookies = (await cookies.get({})).filter(isStaleLoopbackAuthCookie)
    await Promise.all(staleCookies.map(cookie => cookies.remove(loopbackCookieUrl(cookie), cookie.name)))
  }

  async function loadFreshServiceUrl(url = getServiceUrl()) {
    if (typeof url !== 'string') return false
    await clearStaleLoopbackAuthCookies()
    await loadServiceUrl(url)
    return true
  }

  async function recoverFromResponse(details) {
    const url = getServiceUrl()
    if (recoveryStarted || !isLoopbackPluginsResponse431(details, url)) return false
    recoveryStarted = true
    await loadFreshServiceUrl(url)
    return true
  }

  return { clearStaleLoopbackAuthCookies, loadFreshServiceUrl, recoverFromResponse }
}

/** Attach one bounded runtime recovery hook to this window's Electron session. */
export function installLoopbackAuthCookieRecovery({
  webContents,
  getServiceUrl,
  loadServiceUrl,
  onError = () => console.warn('[main] loopback authentication cookie recovery failed'),
}) {
  const recovery = createLoopbackAuthCookieRecovery({
    cookies: webContents.session.cookies,
    getServiceUrl,
    loadServiceUrl,
  })
  webContents.session.webRequest.onCompleted((details) => {
    void recovery.recoverFromResponse(details).catch(onError)
  })
  return recovery
}
