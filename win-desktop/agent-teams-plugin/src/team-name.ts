const SENSITIVE_DESCRIPTION = /(?:患者|病人|病患|姓名|病例|病案|病历(?:号)?|住院(?:号)?|门诊(?:号)?|就诊(?:号)?|检查|检验|化验单|检验单|结果|影像号|报告号|诊断|处方|医嘱|身份证(?:号)?|医保(?:号|卡)?|床号|手机号|联系电话|出生日期|patient|medical\s*(?:record|history)|health\s*record|mrn|inpatient|outpatient|diagnosis|dicom(?:\s*uid)?|study\s*uid|series\s*uid|sop\s*uid|accession|token|api.?key|secret|password|credential|bearer|private.?key|client.?secret)/iu
const SECRET_LIKE_VALUE = /https?:\/\/\S+|\b\S+@\S+\.\S+\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\b(?:sk|pk|gh[pousr]|pat|xox[baprs])[-_][A-Za-z0-9_-]{6,}\b|\beyJ[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]{2,}){0,2}\b|\d{4,}|\b[A-Za-z0-9_-]{20,}\b/giu

export function automaticTeamName(description: string | undefined, suffix: string): string {
  if (!/^[a-z0-9]{6,12}$/u.test(suffix)) throw new Error('automatic team suffix is invalid')

  const scrubbed = (description ?? '').normalize('NFC').replace(SECRET_LIKE_VALUE, ' ')
  const raw = scrubbed.split(/[。！？.!?\r\n]/u, 1)[0] ?? ''
  const sentence = SENSITIVE_DESCRIPTION.test(raw) ? '' : raw
  const cleaned = sentence.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/gu, '')
  const prefix = [...cleaned].slice(0, 36).join('').replace(/-+$/u, '') || 'agent-team'
  return `${prefix}-${suffix}`
}
