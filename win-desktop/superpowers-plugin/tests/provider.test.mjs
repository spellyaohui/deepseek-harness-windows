import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as FileSystem from '@deepseek-ai/dsh-skill-filesystem'

const lib = fileURLToPath(new URL('../lib/', import.meta.url))
async function mount(t) {
  assert.ok(existsSync(join(lib, 'index.js')), 'bundled provider has not been implemented')
  const root = mkdtempSync(join(tmpdir(), 'dsh-superpowers 中文 空格-'))
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    rmSync(root, { recursive: true, force: true })
  })
  await ctx.plugin(SkillRegistry)
  const plugin = await import('../lib/index.js')
  const fork = await ctx.plugin(plugin)
  return { ctx, root, fork }
}
function skillAt(directory, body) {
  mkdirSync(join(directory, 'brainstorming'), { recursive: true })
  writeFileSync(join(directory, 'brainstorming', 'SKILL.md'),
    '---\nname: brainstorming\ndescription: Local scope override\n---\n' + body)
}

test('native registry loads all 15 bodies with one DSH mapping', async t => {
  const { ctx, root } = await mount(t)
  const summaries = await ctx.skills.list({ cwd: root })
  assert.equal(summaries.length, 15)
  const native = new FileSystem.FileSystemSkillProvider(ctx,
    { signal: new AbortController().signal, invalidate() {} },
    { includeDefaultRoots: false, watch: false, bundledSkillDir: join(lib, 'skills') })
  t.after(() => native.dispose())
  const originals = await native.list({ cwd: root })
  for (const summary of summaries) {
    const loaded = await ctx.skills.get(summary.name, { cwd: root })
    const original = await native.get(originals.find(candidate => candidate.name === summary.name), {})
    assert.ok(loaded.content.startsWith(original.content))
    assert.equal(loaded.provider, 'superpowers-bundled')
    assert.deepEqual(loaded.resourceBase, original.resourceBase)
    assert.equal(loaded.content.match(/<dsh_tool_mapping>/gu)?.length, 1)
    assert.ok(loaded.content.endsWith('</dsh_tool_mapping>'))
    assert.ok(summary.description.length > 0)
  }
})

test('review and delegation skills expose bound-Profile policy without granting temporary authority', async t => {
  const { ctx, root } = await mount(t)
  for (const name of ['subagent-driven-development', 'requesting-code-review']) {
    const loaded = await ctx.skills.get(name, { cwd: root })
    const mapping = loaded.content.split('<dsh_tool_mapping>')[1]
    assert.match(mapping, /默认绑定 Profile.*冻结角色/u, 'ordinary delegation must instruct the consuming captain to use its bound frozen roles')
    assert.match(mapping, /fresh reviewer.*不.*临时授权/u, 'fresh review does not grant a temporary exception')
    assert.match(mapping, /\/agent-teams --temporary <goal>/u, 'only the existing explicit human command grants the exception')
  }
})

test('project and user names beat bundled skills without being decorated', async t => {
  const { ctx, root } = await mount(t)
  const user = join(root, 'home')
  const agents = join(root, 'agents')
  skillAt(join(user, 'skills'), 'User skill body')
  await ctx.plugin(FileSystem, { watch: false, dshHome: user, agentsHome: agents })
  assert.equal((await ctx.skills.get('brainstorming', { cwd: root })).content, 'User skill body')
  // A second isolated cwd invalidates native discovery without relying on a watcher.
  const project = join(root, '项目 工作区')
  mkdirSync(join(project, '.git'), { recursive: true })
  skillAt(join(project, '.dsh', 'skills'), 'Project skill body')
  assert.equal((await ctx.skills.get('brainstorming', { cwd: project })).content, 'Project skill body')
})

test('abort and unknown names preserve native outcomes', async t => {
  const { ctx, root } = await mount(t)
  assert.equal(await ctx.skills.get('missing-skill', { cwd: root }), undefined)
  const controller = new AbortController()
  const reason = new Error('lookup cancelled')
  controller.abort(reason)
  await assert.rejects(ctx.skills.get('brainstorming', { cwd: root, signal: controller.signal }), error => error === reason)
})

test('dispose unregisters the bundled provider', async t => {
  const { ctx, root, fork } = await mount(t)
  assert.equal((await ctx.skills.list({ cwd: root })).length, 15)
  await fork.dispose()
  assert.deepEqual(await ctx.skills.list({ cwd: root }), [])
})

test('resources resolve independently of cwd and loading never changes assets', async t => {
  const { ctx, root } = await mount(t)
  const manifest = JSON.parse(readFileSync(join(lib, 'upstream-manifest.json'), 'utf8'))
  const before = manifest.files.map(entry => readFileSync(join(lib, entry.path)))
  const loaded = await ctx.skills.get('test-driven-development', { cwd: root })
  assert.equal(loaded.resourceBase.kind, 'directory')
  assert.equal(loaded.resourceBase.path, join(lib, 'skills', 'test-driven-development'))
  assert.ok(readFileSync(join(loaded.resourceBase.path, 'writing-good-tests.md')).length > 0)
  manifest.files.forEach((entry, index) => assert.deepEqual(readFileSync(join(lib, entry.path)), before[index]))
})
