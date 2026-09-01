const SENSITIVE_DESCRIPTION = /(?:患者|姓名|病历号|住院号|门诊号|dicom\s*uid|accession|token|api.?key|secret|password)/iu
const SECRET_LIKE_VALUE = /https?:\/\/\S+|\b\S+@\S+\.\S+\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\d{4,}|\b[A-Za-z0-9_-]{20,}\b/giu

export function automaticTeamName(description: string | undefined, suffix: string): string {
  if (!/^[a-z0-9]{6,12}$/u.test(suffix)) throw new Error('automatic team suffix is invalid')

  const raw = (description ?? '').normalize('NFC').split(/[。！？.!?\r\n]/u, 1)[0] ?? ''
  const sentence = SENSITIVE_DESCRIPTION.test(raw) ? '' : raw.replace(SECRET_LIKE_VALUE, ' ')
  const cleaned = sentence.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/gu, '')
  const prefix = [...cleaned].slice(0, 36).join('').replace(/-+$/u, '') || 'agent-team'
  return `${prefix}-${suffix}`
}
