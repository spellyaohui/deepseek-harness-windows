import { randomBytes, scrypt as derive, createCipheriv, createDecipheriv } from 'node:crypto'
import { promisify, isDeepStrictEqual } from 'node:util'
import { credentialRef, parseCredentialKey } from '@deepseek-ai/dsh-credentials'

const scrypt = promisify(derive)
export const MAX_BACKUP_BYTES = 6_000_000
const FORMAT = 'dsh-configuration-backup'
const HEADER = `${FORMAT}:1:scrypt:aes-256-gcm`
const OWNERS = new Set([
  '@deepseek-ai/dsh-llm-pi-ai', '@deepseek-ai/dsh-llm-deepseek-api-key',
  '@nanmicoder/dsh-agent-teams', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-tool-subagent',
  '@deepseek-ai/dsh-tool-subagent/model-selection-settings',
])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export class BackupError extends Error {}
const fail = message => { throw new BackupError(message) }

// Backup input can never introduce executable YAML expressions or prototype keys.
function safeJson(value, depth = 0) {
  if (depth > 40) fail('配置嵌套过深')
  if (Array.isArray(value)) value.forEach(child => safeJson(child, depth + 1))
  else if (object(value)) for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor', '__jsExpr'].includes(key)) fail('配置包含不允许的字段')
    safeJson(child, depth + 1)
  }
  else if ((typeof value === 'number' && !Number.isFinite(value)) || (value !== null && !['string', 'boolean', 'number'].includes(typeof value))) fail('配置格式无效')
}

function passwordCheck(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) fail('备份密码须为 8～1024 个字符')
}
async function keyFor(password, salt) {
  passwordCheck(password)
  return scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}
export async function encryptBackup(payload, password) {
  safeJson(payload)
  const plain = Buffer.from(JSON.stringify(payload))
  if (plain.length > 4_000_000) fail('配置超过备份大小限制')
  const salt = randomBytes(16), iv = randomBytes(12)
  const key = await keyFor(password, salt)
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(HEADER))
    const data = Buffer.concat([cipher.update(plain), cipher.final()])
    return JSON.stringify({ format: FORMAT, version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
  } finally { key.fill(0); plain.fill(0) }
}
export function validateEncryptedBackup(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BACKUP_BYTES) fail('备份文件过大或格式无效')
  let doc
  try { doc = JSON.parse(text) } catch { fail('备份文件格式无效') }
  if (!object(doc) || doc.format !== FORMAT || doc.version !== 1) fail('不支持此备份文件或版本')
  if (Object.keys(doc).sort().join(',') !== 'data,format,iv,salt,tag,version') fail('备份文件格式无效')
  for (const [field, length] of [['salt', 16], ['iv', 12], ['tag', 16], ['data', undefined]]) {
    const value = doc[field]
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail('备份文件格式无效')
    const bytes = Buffer.from(value, 'base64')
    if (bytes.toString('base64') !== value || (length !== undefined && bytes.length !== length) || !bytes.length) fail('备份文件格式无效')
  }
  return doc
}
export async function decryptBackup(text, password) {
  const doc = validateEncryptedBackup(text)
  const key = await keyFor(password, Buffer.from(doc.salt, 'base64'))
  let plain
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(doc.iv, 'base64'))
    cipher.setAAD(Buffer.from(HEADER))
    cipher.setAuthTag(Buffer.from(doc.tag, 'base64'))
    plain = Buffer.concat([cipher.update(Buffer.from(doc.data, 'base64')), cipher.final()])
    if (plain.length > 4_000_000) fail('配置超过备份大小限制')
    const payload = JSON.parse(plain.toString('utf8'))
    safeJson(payload)
    return payload
  } catch { fail('密码错误或备份文件已损坏') }
  finally { key.fill(0); plain?.fill(0) }
}

function sectionsOf(ctx) {
  const views = ctx.settings.describe()
  return ctx.configEditor.entries().filter(entry => OWNERS.has(entry.options.name)).flatMap(entry => {
    const view = views.find(view => view.ns === entry.options.id)
    return view ? [{ ns: view.ns, owner: entry.options.name, value: structuredClone(view.value), revision: view.revision }] : []
  })
}
function references(sections) {
  const refs = new Set()
  for (const section of sections) {
    if (section.owner === '@deepseek-ai/dsh-llm-pi-ai') {
      for (const provider of Object.values(section.value.providers ?? {})) if (provider.apiKeyEnv !== undefined) refs.add(credentialRef(provider.apiKeyEnv))
    } else if (section.owner === '@deepseek-ai/dsh-llm-deepseek-api-key') refs.add(credentialRef(section.value.apiKeyEnv ?? 'DEEPSEEK_API_KEY'))
  }
  return refs
}
export async function exportConfiguration(ctx, password) {
  const sections = sectionsOf(ctx)
  if (!sections.length) fail('配置服务尚未就绪')
  const refs = {}, records = {}
  for (const ref of references(sections)) refs[ref] = (await ctx.credentials.resolve(ref))?.value ?? null
  // Catalog-native provider keys may exist without a manual providers entry.
  for (const entry of sections.some(section => section.owner === '@deepseek-ai/dsh-llm-pi-ai') ? await ctx.credentials.listRecords() : []) {
    if (!entry.key.startsWith('llm-pi-ai/') || entry.kind !== 'api-key') continue
    const record = await ctx.credentials.readRecord(entry.key)
    // OAuth/account grants are login state, not portable provider API keys.
    if (record?.kind === 'api-key') records[entry.key] = record
  }
  if (!isDeepStrictEqual(sections, sectionsOf(ctx))) fail('配置已变化，请重新导出')
  return encryptBackup({ version: 1, sections: sections.map(({ revision, ...section }) => section), refs, records }, password)
}

export async function importConfiguration(ctx, encrypted, password) {
  const payload = await decryptBackup(encrypted, password)
  if (!object(payload) || payload.version !== 1 || !Array.isArray(payload.sections) || !payload.sections.length || !object(payload.refs) || !object(payload.records)) fail('备份配置格式无效')
  const current = sectionsOf(ctx), seen = new Set()
  for (const section of payload.sections) {
    if (!object(section) || !object(section.value) || seen.has(section.ns)) fail('备份配置格式无效')
    seen.add(section.ns)
    const before = current.find(row => row.ns === section.ns && row.owner === section.owner)
    if (!before) fail('备份所需的配置模块不可用，请使用相同版本的程序')
  }
  const allowedRefs = references(payload.sections)
  if (Object.keys(payload.refs).length !== allowedRefs.size) fail('备份缺少供应商密钥信息')
  const undoCredentials = []
  for (const [ref, value] of Object.entries(payload.refs)) {
    if (!allowedRefs.has(ref) || (value !== null && (typeof value !== 'string' || !value))) fail('供应商密钥格式无效')
    const info = await ctx.credentials.describe(ref)
    if (!info.writable) fail('供应商密钥受环境变量或只读配置控制，无法导入')
    const old = await ctx.credentials.resolve(ref)
    undoCredentials.push({ ref, value, old: old?.source === 'file' ? old.value : null })
  }
  for (const [key, record] of Object.entries(payload.records)) {
    if (!payload.sections.some(section => section.owner === '@deepseek-ai/dsh-llm-pi-ai') || !/^llm-pi-ai\/[a-z][a-z0-9-]*$/.test(key) || !object(record) || record.kind !== 'api-key' || Object.keys(record).some(field => !['kind', 'key', 'env'].includes(field)) || (record.key !== undefined && typeof record.key !== 'string') || (record.env !== undefined && (!object(record.env) || Object.values(record.env).some(value => typeof value !== 'string')))) fail('供应商密钥记录格式无效')
    parseCredentialKey(key)
    if (!(await ctx.credentials.describeRecord(key)).writable) fail('供应商密钥记录只读，无法导入')
    const old = await ctx.credentials.readRecord(key)
    if (old?.kind === 'grant') fail('目标供应商已有登录授权，请先在模型设置中退出该授权')
    undoCredentials.push({ key, value: record, old })
  }
  const written = [], secretsWritten = []
  try {
    // Official SettingsForms/ConfigEditor remain the sole config writer: schema,
    // CAS and Home/CLI overlay refusal are unchanged. Roll back only our writes.
    for (const section of payload.sections) {
      const before = current.find(row => row.ns === section.ns)
      await ctx.settings.mutate(section.ns, [{ op: 'set', path: [], value: section.value }], before.revision)
      const after = sectionsOf(ctx).find(row => row.ns === section.ns)
      written.push({ before, after })
    }
    for (const item of undoCredentials) {
      if (item.ref) {
        const live = await ctx.credentials.resolve(item.ref)
        if ((live?.source === 'file' ? live.value : null) !== item.old) fail('供应商密钥已变化，请重新导入')
        if (item.value === null) await ctx.credentials.unset(item.ref)
        else await ctx.credentials.set(item.ref, item.value)
      } else await ctx.credentials.modifyRecord(item.key, async live => {
        if (!isDeepStrictEqual(live, item.old)) fail('供应商密钥已变化，请重新导入')
        return item.value
      })
      secretsWritten.push(item)
      if (item.ref && ((await ctx.credentials.resolve(item.ref))?.value ?? null) !== item.value) fail('供应商密钥受只读配置控制，无法导入')
    }
  } catch {
    let incomplete = false
    for (const item of secretsWritten.reverse()) try {
      if (item.ref) {
        const live = await ctx.credentials.resolve(item.ref)
        if ((live?.source === 'file' ? live.value : null) !== item.value) throw new Error()
        if (item.old === null) await ctx.credentials.unset(item.ref)
        else await ctx.credentials.set(item.ref, item.old)
      } else {
        if (!isDeepStrictEqual(await ctx.credentials.readRecord(item.key), item.value)) throw new Error()
        if (item.old === undefined) await ctx.credentials.deleteRecord(item.key)
        else await ctx.credentials.modifyRecord(item.key, async live => {
          if (!isDeepStrictEqual(live, item.value)) throw new Error()
          return item.old
        })
      }
    } catch { incomplete = true }
    for (const { before, after } of written.reverse()) try {
      await ctx.settings.mutate(before.ns, [{ op: 'set', path: [], value: before.value }], after.revision)
    } catch { incomplete = true }
    // Never return third-party validator errors: they can contain secret values.
    fail(incomplete ? '导入未完成，部分配置未能恢复。请检查模型和子智能体配置后重启程序' : '导入失败，已恢复原配置。请检查备份版本及只读配置覆盖后重试')
  }
  return { restartRequired: true }
}
