/**
 * AgentTeams for DeepSeek Harness.
 *
 * A host-plane plugin that registers the `agent_teams_*` tools and one usage
 * section into the global system prompt. After installation any session can
 * run multi-agent teamwork through natural language (e.g. "use AgentTeams to research X"):
 * the model creates a team (it becomes the captain), spawns members as
 * durable continuable subagents, breaks the goal into tasks with
 * dependencies, wakes members with messages, relays reports, and collects
 * results.
 *
 * Installation (bundle): `dsh plugin --profile <name> add @nanmicoder/dsh-agent-teams`
 * (or a local path). The bundle patch mounts this plugin row into the host
 * composition; the tools register into the shared `tools` registry and the
 * usage section into the global system prompt, so the plugin needs no realm.
 *
 * @module dsh-agent-teams
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Declaration merge only: makes ctx.llm, ctx.subagents and ctx.systemPrompt visible.
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  haltTeamWork,
  registerAgentTeamsTools,
  type ToolsConfig,
} from './tools.ts'
import { installAgentTeamsGestureBoundary, registerAgentTeamsCommand } from './command.ts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectArchivedTeamsActivity, collectTeamsActivity } from './snapshot.ts'
import { findTeamByCaptain } from './state.ts'
import { stagedPlanMutationFromPayload } from './staged-plan-payload.ts'
import { formatProfilesForPrompt, type TeamProfileConfig } from './profiles.ts'
import { buildHostModelCatalog } from './host-model-catalog.ts'
import {
  createAgentTeamsSettingsRuntime,
  type DelegationMode,
} from './settings.ts'
import {
  delegationPolicyUsagePreamble,
  policyMarker,
  registerDelegationPolicyLifecycle,
  type DelegationPolicyId,
  type DelegationPolicyRuntime,
} from './routing-policy.ts'

/**
 * Structural slice of the web server service, compatible with both the
 * published `dsh-host-webserver@0.0.1-rc.1` (`ctx.httpServer` /
 * `HttpServerService`) and the renamed `webServer` / `WebServer` in later
 * builds: the beta transition renames the service without changing the route
 * registration shape.
 */
interface WebRouteHost {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Web-server service key candidates, newest first. */
const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const
/** Workspace registry service key candidates, newest first. */
const WORKSPACE_KEYS = ['workspaceRegistry', 'workspace'] as const

export const name = 'agent-teams'
export const inject = ['tools', 'llm', 'subagents', 'systemPrompt', 'agents']

/** Plugin configuration. */
export interface Config {
  delegationMode?: DelegationMode
  /**
   * State directory name under the captain's workspace; team state lives at
   * `<workspace>/<stateDir>/<teamId>/` (default `.agent-teams`).
   */
  stateDir?: string
  /** `ctx.subagents` provider used to spawn members; must support continuable children and personas (default `spawn`). */
  memberProvider?: string
  /** Prompt injected into member personas and automatic task assignments. */
  executionPrompt?: string
  /** Plugin-wide fallback route for unavailable member models. */
  fallback?: import('./profiles.ts').TeamModelFallbackConfig
  /** Member delegation depth cap (default `1`; `0` forbids delegation entirely). */
  memberMaxDepth?: number
  /** Team size cap in members (default `8`). */
  maxMembers?: number
  /** Named multi-role team profiles. */
  profiles?: Record<string, TeamProfileConfig>
  /** Prompt-section order for the usage policy (default `117`, after delegation policy). */
  promptSectionOrder?: number
  /**
   * Register the deterministic `/agent-teams` activation surfaces (the
   * closed-namespace slash command and the plain-text gesture boundary).
   * Disable to keep the natural-language trigger as the only entry point.
   */
  slashCommand?: boolean
}

// `z.object()` has an implicit `{}` default in Schemastery.  Fallback routes
// are optional, so model absence explicitly; otherwise a missing route is
// validated as an empty object and fails on the required provider/model keys.
const fallbackRouteConfig = z.union([
  z.object({ provider: z.string().required(), model: z.string().required() }),
  z.const(undefined),
])

export const Config: z<Config> = z.object({
  delegationMode: z.union(['teams', 'native']).default('teams'),
  stateDir: z.string().default('.agent-teams'),
  memberProvider: z.string().default('spawn'),
  executionPrompt: z.string(),
  fallback: fallbackRouteConfig,
  profiles: z.dict(z.object({
    description: z.string(),
    protocol: z.string(),
    executionPrompt: z.string(),
    fallback: fallbackRouteConfig,
    members: z.array(z.object({
      name: z.string().required(),
      role: z.string(),
      provider: z.string(),
      model: z.string(),
      reasoning_mode: z.union(['target-default', 'route-aware', 'explicit']).required(),
      reasoning_effort: z.string(),
      executionPrompt: z.string(),
      fallback: fallbackRouteConfig,
    })).min(1).required(),
    taskPlanning: z.union([z.const('captain'), z.const('seed')]),
    reviewPolicy: z.object({
      requirementsMinRounds: z.natural().min(1),
      requirementsMaxRounds: z.natural().min(1),
      codeMaxRounds: z.natural().min(1),
      maxRepairAttempts: z.natural().min(1),
      requiredReviewers: z.array(z.string()),
    }),
    tasks: z.array(z.object({
      id: z.string().required(),
      subject: z.string().required(),
      description: z.string(),
      assignee: z.string(),
      dependencies: z.array(z.string()),
    })),
  })).default({}),
  memberMaxDepth: z.natural().default(1),
  maxMembers: z.natural().min(1).default(8),
  promptSectionOrder: z.natural().default(117),
  slashCommand: z.boolean().default(true),
})

/** The model-facing usage policy: when and how to drive AgentTeams. */
export function usageSectionText(toolNames: string, profilesText?: string): string
export function usageSectionText(policy: DelegationPolicyId, toolNames: string, profilesText?: string): string
export function usageSectionText(
  policyOrToolNames: DelegationPolicyId | string,
  toolNamesOrProfiles = '',
  profilesText = '',
): string {
  const isPolicy = policyOrToolNames === 'teams-v1' || policyOrToolNames === 'native-v1'
  const policy: DelegationPolicyId = isPolicy ? policyOrToolNames as DelegationPolicyId : 'native-v1'
  const resolvedProfilesText = isPolicy ? profilesText : toolNamesOrProfiles
  return `${policyMarker(policy)}

${delegationPolicyUsagePreamble(policy)}

State first:
- unknown -> agent_teams_status once.
- inactive -> create one Team; status/delete are safe probes.
- staged -> edit roster/DAG or wait for explicit approval; no work runs.
- running -> use status, create-task, message, reassign, and delete; never create a replacement Team, edit-plan, or approve.
- halted -> agent_teams_resume(reason) before work. Escalated remains running; ask the user when its review loop reaches the ceiling.

Approval/Profile: approval="automatic" runs normally. approval="required" stages the full roster/dependency DAG; wait for the user/Web control and never self-approve in that turn. Return/discard forbids replacement. An exact requested Profile expands its roster plus seed tasks or captain guardrails; do not recreate members and only its eligible fallback may retry. When no configured profile is listed above, omit the profile property entirely; never send profile="" or placeholders such as "default", "none", or "captain".

Reasoning/routes: each role owns target-default, route-aware, or explicit. target-default uses its role/captain route with no effort; route-aware inherits captain effort only on the same provider/model; explicit requires role provider/model and effort. Omit provider/model for the captain route or provide both as a pair for another route.

Tasks/execution: plan tasks and dependencies; the scheduler gives ready shared work to durable idle members. Assign an active member/captain or omit assignee. Never duplicate slow or unassigned work. A requested pause parks its attempt; message that member to continue. Updates use current attempt_id; stale means ownership changed, so reassign before retry/takeover. Members claim by task id without assignee. Reassignment revokes old attempt; monitor without busy-polling until required work and members are terminal/idle. Never inspect or edit .agent-teams state files or plugin source code.

Quality mode: requirements, implementation, verification, review, repair, and integration are opt-in. Build the staged DAG; implementation depends on requirements and waits for verdict=pass. Quality tasks need objective/acceptance and verification evidence; review/requirements pass only with verdict=pass; needs_revision/reject fail with findings. Review failure triggers repair/next-review and rewires pending integration; do not recreate the loop. Derive workspace-relative POSIX inScope, deliverable paths, and verification commands; exclude .env, secrets, .git. Implementation/repair deliverables must be covered by inScope; changedPaths=[] needs noChangesReason and cannot hide deliverables. Delivery waits for all gates.

Present the Team result, then call agent_teams_delete unless work continues. Never perform a real deployment without explicit user confirmation.

Use the registered agent_teams_* tool schemas.${resolvedProfilesText === '' ? '' : `\n\n${resolvedProfilesText}`}`
}

export function apply(ctx: Context, config: Config): void {
  const settings = createAgentTeamsSettingsRuntime(ctx, {
    delegationMode: config.delegationMode ?? 'teams',
  })

  const resolved: ToolsConfig = {
    stateDir: config.stateDir ?? '.agent-teams',
    memberProvider: config.memberProvider ?? 'spawn',
    executionPrompt: config.executionPrompt,
    fallback: config.fallback,
    memberMaxDepth: config.memberMaxDepth ?? 1,
    maxMembers: config.maxMembers ?? 8,
    settings,
    delegationPolicy: undefined,
    profiles: config.profiles ?? {},
  }

  // Provider registration is a sibling plugin's effect (`subagent-spawn` /
  // `subagent-fork` rows), which can land after this mount under the Loader's
  // concurrent activation — so capability validation happens at the first
  // member spawn (`spawnMember`), the earliest point the provider list is
  // settled, rather than here.

  const toolNames = [
    'agent_teams_create',
    'agent_teams_approve',
    'agent_teams_edit_plan',
    'agent_teams_add_member',
    'agent_teams_remove_member',
    'agent_teams_create_task',
    'agent_teams_reassign_task',
    'agent_teams_claim_task',
    'agent_teams_update_task',
    'agent_teams_send_message',
    'agent_teams_status',
    'agent_teams_resume',
    'agent_teams_delete',
  ].join(', ')
  const delegationPolicy: DelegationPolicyRuntime = {
    defaultMode: () => settings.get().delegationMode,
    order: config.promptSectionOrder ?? 117,
    text: (policy) => usageSectionText(policy, toolNames, formatProfilesForPrompt(config.profiles ?? {})),
  }
  resolved.delegationPolicy = delegationPolicy
  registerDelegationPolicyLifecycle(ctx, delegationPolicy)

  // Exported for TDD / docs checks. Not a public runtime API.

  const agentTeamsRuntime = registerAgentTeamsTools(ctx, resolved)

  // Deterministic activation surfaces: the closed-namespace `/agent-teams`
  // host command (surfaces in the Web GUI slash menu via the Harness
  // ui-commands client) and the plain-text gesture boundary for surfaces
  // without command adjudication (headless CLI). Both default on; a profile
  // can disable them to keep the natural-language trigger exclusive.
  //
  // `commands` is registered lazily (not a required inject): it ships in the
  // base bundle of every standard profile, but a minimal composition that
  // omits the command registry keeps the plugin fully functional — the fiber
  // never pends on it and simply never gains the slash command.
  if (config.slashCommand ?? true) {
    ctx.inject(['commands'], (commandCtx) => {
      registerAgentTeamsCommand(commandCtx, () => config.profiles ?? {})
    })
    installAgentTeamsGestureBoundary(ctx, () => config.profiles ?? {})
  }

  let modelCatalogRegistered = false
  const registerModelCatalog = (): void => {
    if (modelCatalogRegistered) return
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as WebRouteHost | undefined
    if (webServer === undefined) return
    modelCatalogRegistered = true
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-agent-teams/models',
      handler: async (req, res) => {
        const responseHeaders = {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        }
        if (req.method !== 'GET') {
          res.writeHead(405, { ...responseHeaders, allow: 'GET' })
          res.end(JSON.stringify({ models: [], failures: [] }))
          return
        }
        const { models, failures } = await buildHostModelCatalog(ctx.llm)
        res.writeHead(200, responseHeaders)
        res.end(JSON.stringify({ models, failures }))
      },
    }), 'agent-teams: model catalog route')
  }

  // The activity panel data/artwork routes need the Web server and the
  // workspace registry, which headless profiles do not mount; under
  // concurrent activation they may also bind after this plugin. Register the
  // routes lazily: try now, then on each service binding event. In a webless
  // profile the plugin stays tool-only and never blocks boot.
  let webRegistered = false
  const registerWebSurface = (): void => {
    if (webRegistered) return
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as WebRouteHost | undefined
    const workspaceRegistry = (ctx.get(WORKSPACE_KEYS[0]) ?? ctx.get(WORKSPACE_KEYS[1])) as WorkspaceRegistry | undefined
    if (webServer === undefined || workspaceRegistry === undefined) return
    webRegistered = true

    // Activity panel data route: the browser floater polls this for team
    // snapshots (disk truth + live subagent activity). Mirrors the Claude
    // Code desktop watcher's server-side snapshot pattern.
    ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/plugins/dsh-agent-teams/state',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const roots = workspaceRegistry.list().map((workspace) => ({
        workspace: workspace.title,
        stateRoot: join(workspace.path, resolved.stateDir),
      }))
      // ?archived=1 serves teams moved to archive/ (post-delete review).
      const snapshots = url.searchParams.get('archived') === '1'
        ? await collectArchivedTeamsActivity(ctx, roots)
        : await collectTeamsActivity(ctx, roots)
      const body = JSON.stringify({ teams: snapshots })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    },
  }), 'agent-teams: activity route')

    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-agent-teams/halt',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
          res.end()
          return
        }
        let raw = ''
        try {
          raw = await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = []
            req.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) })
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            req.on('error', reject)
          })
        } catch {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'invalid request body' }))
          return
        }
        let payload: { sessionId?: unknown; teamId?: unknown }
        try {
          payload = raw.trim() === '' ? {} : JSON.parse(raw) as { sessionId?: unknown; teamId?: unknown }
        } catch {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'invalid JSON' }))
          return
        }
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
        const teamId = typeof payload.teamId === 'string' ? payload.teamId.trim() : ''
        if (sessionId === '' || teamId === '') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'sessionId and teamId are required' }))
          return
        }
        const captain = ctx.agents.get(sessionId as import('@deepseek-ai/dsh-session').SessionId)
        if (captain === undefined) {
          res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'captain session is not attached' }))
          return
        }
        const workspace = captain.session.header.cwd ?? process.cwd()
        const stateRoot = join(workspace, resolved.stateDir)
        const team = await findTeamByCaptain(stateRoot, captain.id)
        if (team === undefined || team.id !== teamId) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'team not found for this captain' }))
          return
        }
        try {
          const result = await haltTeamWork({
            ctx,
            stateRoot,
            teamId,
            captain,
          })
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(result))
        } catch (error: unknown) {
          ctx.logger.warn(`agent-teams: halt failed for ${teamId}: ${String(error)}`)
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'failed to stop the team' }))
        }
      },
    }), 'agent-teams: halt route')

    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-agent-teams/plan',
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })
          res.end()
          return
        }
        let payload: Record<string, unknown>
        try {
          const chunks: Buffer[] = []
          const raw = await new Promise<string>((resolve, reject) => {
            let size = 0
            req.on('data', (chunk) => {
              const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
              size += part.length
              if (size > 1_000_000) {
                reject(new Error('request body is too large'))
                return
              }
              chunks.push(part)
            })
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            req.on('error', reject)
          })
          const parsed: unknown = raw.trim() === '' ? {} : JSON.parse(raw)
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('body must be an object')
          payload = parsed as Record<string, unknown>
        } catch (error: unknown) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid request body' }))
          return
        }
        const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'].trim() : ''
        const teamId = typeof payload['teamId'] === 'string' ? payload['teamId'].trim() : ''
        const action = typeof payload['action'] === 'string' ? payload['action'] : ''
        if (sessionId === '' || teamId === '' || action === '') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'sessionId, teamId, and action are required' }))
          return
        }
        const captain = ctx.agents.get(sessionId as import('@deepseek-ai/dsh-session').SessionId)
        if (captain === undefined) {
          res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'captain session is not attached' }))
          return
        }
        const workspace = captain.session.header.cwd ?? process.cwd()
        const stateRoot = join(workspace, resolved.stateDir)
        const team = await findTeamByCaptain(stateRoot, captain.id)
        if (team === undefined || team.id !== teamId) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'team not found for this captain' }))
          return
        }
        try {
          if (action === 'approve') {
            const approved = await agentTeamsRuntime.approveStagedTeam(captain, teamId)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ ok: true, phase: 'running', ...approved }))
            return
          }
          if (action === 'continue') {
            const continued = await agentTeamsRuntime.continueStagedPlanning(captain, teamId)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ ok: true, phase: 'staged', review: 'awaiting_feedback', ...continued }))
            return
          }
          if (action === 'discard') {
            const discarded = await agentTeamsRuntime.discardStagedTeam(captain, teamId)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ ok: true, phase: 'archived', ...discarded }))
            return
          }
          const mutation = stagedPlanMutationFromPayload(payload)
          const updated = await agentTeamsRuntime.updateStagedPlan(captain, teamId, mutation)
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ ok: true, phase: updated.phase, members: updated.members.length, tasks: updated.tasks.length }))
        } catch (error: unknown) {
          res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'plan operation failed' }))
        }
      },
    }), 'agent-teams: plan route')

  // Whale mascot artwork: serve the packaged V2 role/action images to the
  // activity panel. An explicit allowlist guards the route (no path
  // traversal); the images ship with the bundle (files: assets/).
  const artDir = fileURLToPath(new URL('../assets/agent-teams/', import.meta.url))
  const ART_ALLOWLIST = new Set([
    'team-lead-v2.png',
    'member-researcher-v2.png', 'member-engineer-v2.png',
    'member-qa-v2.png', 'member-designer-v2.png',
    'member-security-v2.png', 'member-docs-v2.png',
    'member-data-v2.png', 'member-operator-v2.png',
    'action-working-v2.png', 'action-thinking-v2.png',
    'action-reporting-v2.png', 'action-celebrating-v2.png',
    'action-sleeping-v2.png', 'action-sending-v2.png',
  ])
    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: '/plugins/dsh-agent-teams/assets',
    handler: async (req, res) => {
      let name: string
      try {
        name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.split('/').pop() ?? '')
      } catch {
        // Malformed percent-encoding: treat as an unknown asset, not a 400.
        res.writeHead(404)
        res.end()
        return
      }
      if (!ART_ALLOWLIST.has(name)) {
        res.writeHead(404)
        res.end()
        return
      }
      try {
        const data = await readFile(join(artDir, name))
        res.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400',
        })
        res.end(data)
      } catch (error: unknown) {
        ctx.logger.warn(`agent-teams: artwork read failed for ${name}: ${String(error)}`)
        res.writeHead(404)
        res.end()
      }
      },
    }), 'agent-teams: artwork route')
  }

  registerModelCatalog()
  registerWebSurface()
  ctx.on('internal/service', (name) => {
    if (WEB_SERVER_KEYS.includes(name as (typeof WEB_SERVER_KEYS)[number])) {
      registerModelCatalog()
      registerWebSurface()
    } else if (WORKSPACE_KEYS.includes(name as (typeof WORKSPACE_KEYS)[number])) {
      registerWebSurface()
    }
  })
}
