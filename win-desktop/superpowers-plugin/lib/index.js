import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'

export const name = 'superpowers'
export const inject = ['skills']
const mapping = readFileSync(new URL('./dsh-tools.md', import.meta.url), 'utf8').trim()
const bundledSkillDir = fileURLToPath(new URL('./skills/', import.meta.url))

export function apply(ctx) {
  let native
  ctx.skills.registerProvider(control => {
    native = new FileSystemSkillProvider(ctx, control, {
      providerName: 'superpowers-bundled', includeDefaultRoots: false,
      bundledSkillDir, watch: false,
    })
    return {
      name: native.name,
      list: options => native.list(options),
      async get(candidate, options) {
        const skill = await native.get(candidate, options)
        return skill === undefined ? undefined : {
          ...skill,
          content: `${skill.content}\n\n<dsh_tool_mapping>\n${mapping}\n</dsh_tool_mapping>`,
        }
      },
    }
  })
  ctx.effect(function* () { yield () => native.dispose() }, 'superpowers provider')
}
