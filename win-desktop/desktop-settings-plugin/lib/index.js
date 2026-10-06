import { exportConfiguration, importConfiguration, MAX_BACKUP_BYTES, BackupError } from './backup.js'

export const inject = []
export function apply(ctx) {
  ctx.inject(['settings', 'configEditor', 'credentials', 'webServer', 'connection'], owner => {
    let busy = false
    owner.effect(() => owner.webServer.register({
      kind: 'exact', path: '/plugins/dsh-desktop-settings/backup',
      async handler(req, res) {
        const reply = (status, value) => {
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(value))
        }
        const gate = owner.get('connection')
        const rejection = gate ? gate.requestRejection(req) : 503
        if (rejection !== undefined) { reply(rejection, { error: '请求未通过本地身份验证' }); req.resume(); return }
        if (req.method !== 'POST') { reply(405, { error: '仅支持 POST 请求' }); req.resume(); return }
        if (busy) { reply(409, { error: '已有备份操作正在进行，请稍后重试' }); req.resume(); return }
        busy = true
        try {
          let bytes = 0, chunks = []
          for await (const chunk of req) {
            bytes += chunk.length
            if (bytes > MAX_BACKUP_BYTES + 8192) { reply(413, { error: '备份文件过大' }); req.resume(); return }
            chunks.push(chunk)
          }
          let body
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { reply(400, { error: '请求格式无效' }); return }
          if (body?.action === 'export') reply(200, { encrypted: await exportConfiguration(owner, body.password) })
          else if (body?.action === 'import') reply(200, await importConfiguration(owner, body.encrypted, body.password))
          else reply(400, { error: '备份操作无效' })
        } catch (error) {
          // Provider errors can quote keys; never pass those errors to the UI/log.
          const message = error instanceof BackupError ? error.message : '备份操作失败，请检查配置服务是否就绪'
          if (!res.headersSent) reply(400, { error: message })
        } finally { busy = false }
      },
    }), 'desktop-settings: encrypted configuration backup')
  })
}
