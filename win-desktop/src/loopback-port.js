import net from 'node:net'

// Chromium's HTTP restricted ports (net/base/port_util.cc). A free TCP port
// can still be unusable by Electron, even on 127.0.0.1.
const restrictedPorts = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69,
  77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119,
  123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515,
  526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990,
  993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080,
])

export function isBrowserSafePort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535 && !restrictedPorts.has(port)
}

/** Probe only loopback, release the socket, then let Harness bind that port. */
export async function selectBrowserLoopbackPort({ createServer = net.createServer, maxAttempts = 16 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
        const address = server.address()
        server.close(error => error ? reject(error) : resolve(address?.port))
      })
    })
    if (isBrowserSafePort(port)) return port
  }
  throw new Error('无法分配浏览器安全的本地端口，请稍后重试。')
}
