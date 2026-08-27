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
import z from '@deepseek-ai/schemastery';
import { haltTeamWork, registerAgentTeamsTools, } from "./tools.js";
import { installAgentTeamsGestureBoundary, registerAgentTeamsCommand } from "./command.js";
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArchivedTeamsActivity, collectTeamsActivity } from "./snapshot.js";
import { findTeamByCaptain } from "./state.js";
import { formatProfilesForPrompt } from "./profiles.js";
import { qualityPlanningPrompt } from "./quality-gates.js";
import { buildHostModelCatalog } from "./host-model-catalog.js";
import { AGENT_TEAMS_MIGRATION_VERSION, createAgentTeamsSettingsRuntime, normalizeLegacyDesktopAgentTeamsSettings, } from "./settings.js";
import { delegationPolicyUsagePreamble, policyMarker, registerDelegationPolicyLifecycle, } from "./routing-policy.js";
/** Web-server service key candidates, newest first. */
const WEB_SERVER_KEYS = ['webServer', 'httpServer'];
/** Workspace registry service key candidates, newest first. */
const WORKSPACE_KEYS = ['workspaceRegistry', 'workspace'];
export const name = 'agent-teams';
export const inject = ['tools', 'llm', 'subagents', 'systemPrompt', 'agents'];
// `z.object()` has an implicit `{}` default in Schemastery.  Fallback routes
// are optional, so model absence explicitly; otherwise a missing route is
// validated as an empty object and fails on the required provider/model keys.
const fallbackRouteConfig = z.union([
    z.object({ provider: z.string().required(), model: z.string().required() }),
    z.const(undefined),
]);
export const Config = z.object({
    delegationMode: z.union(['teams', 'native']).default('teams'),
    memberLlmProvider: z.string().default(''),
    stateDir: z.string().default('.agent-teams'),
    memberProvider: z.string().default('spawn'),
    memberModel: z.string().default(''),
    memberReasoningMode: z.union(['target-default', 'route-aware', 'explicit']).default('target-default'),
    memberReasoningEffort: z.string().default(''),
    legacyDesktopSettings: z.object({
        provider: z.string(),
        model: z.string(),
        reasoningEffort: z.string(),
    }),
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
});
export function usageSectionText(policyOrToolNames, toolNamesOrProfiles = '', profilesText = '') {
    const isPolicy = policyOrToolNames === 'teams-v1' || policyOrToolNames === 'native-v1';
    const policy = isPolicy ? policyOrToolNames : 'native-v1';
    const toolNames = isPolicy ? toolNamesOrProfiles : policyOrToolNames;
    const resolvedProfilesText = isPolicy ? profilesText : toolNamesOrProfiles;
    return `${policyMarker(policy)}

${delegationPolicyUsagePreamble(policy)} Follow this protocol:
1. Call agent_teams_create with a team name and the goal as description. The default approval is "automatic" for this desktop fork, so ordinary AgentTeams requests keep the existing immediate-execution behavior. Use approval="required" only when the user explicitly asks to review a staged plan before any member starts.
2. Call agent_teams_add_member once per role the goal needs (researcher, engineer, reviewer, ...). Members are durable subagents: they wait for your messages, then work a full turn. Provider, model, and reasoning defaults come from AgentTeams settings: target-default uses the selected target model's default effort; route-aware inherits the captain's effort only on the exact same provider/model route; explicit locks the configured route and effort. In explicit mode, omit provider/model/reasoning_effort; the plugin enforces the configured settings route. In target-default and route-aware modes, omit these fields for ordinary members and pass them only when the user explicitly requests a heterogeneous route for that role. Blank optional values are treated as omitted, and reasoning_effort="default" selects the target default.
3. For an automatic team, add members and tasks normally; the scheduler starts ready work. For approval="required", build the complete editable roster and DAG while staged, then wait for the user or the Web Approve & Run control; never approve that plan in the same turn. Return-to-chat and discard messages are authoritative and must not create a replacement team. Never inspect or edit .agent-teams state files or plugin source code to revise a staged plan.
4. Break the goal into tasks with agent_teams_create_task and wire dependencies. Assign role-specific work when useful; unassigned ready work belongs to the shared pool. The scheduler automatically claims one ready task for each truly idle member and wakes it, including across later rounds.
5. Lead by delegation: monitor with agent_teams_status, send guidance with agent_teams_send_message, and let idle teammates execute ready work. Do not duplicate a teammate's work merely because its turn is slow. If the user requires every member to contribute or report, create one task per required contribution (or message each member directly); never wait for an unassigned member to produce work it was never given.
6. If the user explicitly asks to pause a running member, its open attempt remains parked after interruption; after answering the user, send that same member guidance with agent_teams_send_message so it continues the same attempt. Do not interrupt members for an ordinary user question that did not request a pause. If work must change owner, restart from scratch, or be taken over, call agent_teams_reassign_task first. Reassign to another idle member, retry with the same member, or use assignee=captain before doing it yourself. Reassignment revokes the old attempt and waits for that member to quiesce, preventing late results from overwriting the new attempt.
7. Tasks carry attempt_id capabilities. Members must use the current attempt_id for updates; stale-attempt errors mean ownership changed. As a member, call agent_teams_claim_task with the task id only and omit assignee; automatic assignments are already pre-claimed. Check status after progress notifications until every required task is terminal and every member is idle/ready; do not busy-poll or require reports from members with no assigned work.
8. If the user names a configured profile / template / fixed roster, pass that name as profile= to agent_teams_create. After a successful profile create, do not recreate the same members. Seed profiles provide template tasks; captain-planning profiles provide the roster and guardrails, so design their DAG while staged. Profile fallback routes are opt-in and may retry only the configured fallback after an eligible provider failure.
9. Quality kinds (requirements, implementation, verification, review, repair, integration) are opt-in contracts: use them only when the user or profile requests quality-mode planning. They need the required objective/acceptance/verification evidence; review/requirements can complete only with verdict=pass, and needs_revision/reject must fail with findings. The automatic repair/review loop must never depend on a failed task.
10. ${qualityPlanningPrompt()}
11. Present the team's results to the user, then agent_teams_delete the team unless the user wants to keep working with it. Never perform a real deployment without explicit user confirmation.

Tools: ${toolNames}${resolvedProfilesText === '' ? '' : `\n\n${resolvedProfilesText}`}`;
}
export function apply(ctx, config) {
    const settings = createAgentTeamsSettingsRuntime(ctx, {
        delegationMode: config.delegationMode ?? 'teams',
        memberLlmProvider: config.memberLlmProvider ?? '',
        memberModel: config.memberModel ?? '',
        memberReasoningMode: config.memberReasoningMode ?? 'target-default',
        memberReasoningEffort: config.memberReasoningEffort ?? '',
        migrationVersion: 0,
    }, normalizeLegacyDesktopAgentTeamsSettings(config.legacyDesktopSettings));
    const resolved = {
        stateDir: config.stateDir ?? '.agent-teams',
        memberProvider: config.memberProvider ?? 'spawn',
        memberModel: config.memberModel,
        executionPrompt: config.executionPrompt,
        fallback: config.fallback,
        memberMaxDepth: config.memberMaxDepth ?? 1,
        maxMembers: config.maxMembers ?? 8,
        settings,
        delegationPolicy: undefined,
        profiles: config.profiles ?? {},
    };
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
    ].join(', ');
    const delegationPolicy = {
        defaultMode: () => settings.get().delegationMode,
        order: config.promptSectionOrder ?? 117,
        text: (policy) => usageSectionText(policy, toolNames, formatProfilesForPrompt(config.profiles ?? {})),
    };
    resolved.delegationPolicy = delegationPolicy;
    registerDelegationPolicyLifecycle(ctx, delegationPolicy);
    // Exported for TDD / docs checks. Not a public runtime API.
    const agentTeamsRuntime = registerAgentTeamsTools(ctx, resolved);
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
            registerAgentTeamsCommand(commandCtx, () => config.profiles ?? {});
        });
        installAgentTeamsGestureBoundary(ctx, () => config.profiles ?? {});
    }
    let migrationStatusRegistered = false;
    const registerMigrationStatus = () => {
        if (migrationStatusRegistered)
            return;
        const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]));
        if (webServer === undefined)
            return;
        migrationStatusRegistered = true;
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-agent-teams/migration-status',
            handler: (req, res) => {
                const responseHeaders = {
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-store',
                };
                if (req.method !== 'GET') {
                    res.writeHead(405, { ...responseHeaders, allow: 'GET' });
                    res.end(JSON.stringify({ migrationVersion: 0, complete: false }));
                    return;
                }
                const status = settings.migrationStatus();
                const complete = status.migrationVersion >= AGENT_TEAMS_MIGRATION_VERSION;
                res.writeHead(200, responseHeaders);
                res.end(JSON.stringify(complete
                    ? { migrationVersion: AGENT_TEAMS_MIGRATION_VERSION, complete: true }
                    : { migrationVersion: 0, complete: false }));
            },
        }), 'agent-teams: migration status route');
    };
    let modelCatalogRegistered = false;
    const registerModelCatalog = () => {
        if (modelCatalogRegistered)
            return;
        const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]));
        if (webServer === undefined)
            return;
        modelCatalogRegistered = true;
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-agent-teams/models',
            handler: async (req, res) => {
                const responseHeaders = {
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-store',
                };
                if (req.method !== 'GET') {
                    res.writeHead(405, { ...responseHeaders, allow: 'GET' });
                    res.end(JSON.stringify({ models: [], failures: [] }));
                    return;
                }
                const { models, failures } = await buildHostModelCatalog(ctx.llm);
                res.writeHead(200, responseHeaders);
                res.end(JSON.stringify({ models, failures }));
            },
        }), 'agent-teams: model catalog route');
    };
    // The activity panel data/artwork routes need the Web server and the
    // workspace registry, which headless profiles do not mount; under
    // concurrent activation they may also bind after this plugin. Register the
    // routes lazily: try now, then on each service binding event. In a webless
    // profile the plugin stays tool-only and never blocks boot.
    let webRegistered = false;
    const registerWebSurface = () => {
        if (webRegistered)
            return;
        const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]));
        const workspaceRegistry = (ctx.get(WORKSPACE_KEYS[0]) ?? ctx.get(WORKSPACE_KEYS[1]));
        if (webServer === undefined || workspaceRegistry === undefined)
            return;
        webRegistered = true;
        // Activity panel data route: the browser floater polls this for team
        // snapshots (disk truth + live subagent activity). Mirrors the Claude
        // Code desktop watcher's server-side snapshot pattern.
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-agent-teams/state',
            handler: async (req, res) => {
                const url = new URL(req.url ?? '/', 'http://x');
                const roots = workspaceRegistry.list().map((workspace) => ({
                    workspace: workspace.title,
                    stateRoot: join(workspace.path, resolved.stateDir),
                }));
                // ?archived=1 serves teams moved to archive/ (post-delete review).
                const snapshots = url.searchParams.get('archived') === '1'
                    ? await collectArchivedTeamsActivity(ctx, roots)
                    : await collectTeamsActivity(ctx, roots);
                const body = JSON.stringify({ teams: snapshots });
                res.writeHead(200, {
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-store',
                });
                res.end(body);
            },
        }), 'agent-teams: activity route');
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-agent-teams/halt',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
                    res.end();
                    return;
                }
                let raw = '';
                try {
                    raw = await new Promise((resolve, reject) => {
                        const chunks = [];
                        req.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
                        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                        req.on('error', reject);
                    });
                }
                catch {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'invalid request body' }));
                    return;
                }
                let payload;
                try {
                    payload = raw.trim() === '' ? {} : JSON.parse(raw);
                }
                catch {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'invalid JSON' }));
                    return;
                }
                const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
                const teamId = typeof payload.teamId === 'string' ? payload.teamId.trim() : '';
                if (sessionId === '' || teamId === '') {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'sessionId and teamId are required' }));
                    return;
                }
                const captain = ctx.agents.get(sessionId);
                if (captain === undefined) {
                    res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'captain session is not attached' }));
                    return;
                }
                const workspace = captain.session.header.cwd ?? process.cwd();
                const stateRoot = join(workspace, resolved.stateDir);
                const team = await findTeamByCaptain(stateRoot, captain.id);
                if (team === undefined || team.id !== teamId) {
                    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'team not found for this captain' }));
                    return;
                }
                try {
                    const result = await haltTeamWork({
                        ctx,
                        stateRoot,
                        teamId,
                        captain,
                    });
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify(result));
                }
                catch (error) {
                    ctx.logger.warn(`agent-teams: halt failed for ${teamId}: ${String(error)}`);
                    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'failed to stop the team' }));
                }
            },
        }), 'agent-teams: halt route');
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/dsh-agent-teams/plan',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
                    res.end();
                    return;
                }
                let payload;
                try {
                    const chunks = [];
                    const raw = await new Promise((resolve, reject) => {
                        let size = 0;
                        req.on('data', (chunk) => {
                            const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                            size += part.length;
                            if (size > 1_000_000) {
                                reject(new Error('request body is too large'));
                                return;
                            }
                            chunks.push(part);
                        });
                        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                        req.on('error', reject);
                    });
                    const parsed = raw.trim() === '' ? {} : JSON.parse(raw);
                    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
                        throw new Error('body must be an object');
                    payload = parsed;
                }
                catch (error) {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid request body' }));
                    return;
                }
                const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'].trim() : '';
                const teamId = typeof payload['teamId'] === 'string' ? payload['teamId'].trim() : '';
                const action = typeof payload['action'] === 'string' ? payload['action'] : '';
                if (sessionId === '' || teamId === '' || action === '') {
                    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'sessionId, teamId, and action are required' }));
                    return;
                }
                const captain = ctx.agents.get(sessionId);
                if (captain === undefined) {
                    res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'captain session is not attached' }));
                    return;
                }
                const workspace = captain.session.header.cwd ?? process.cwd();
                const stateRoot = join(workspace, resolved.stateDir);
                const team = await findTeamByCaptain(stateRoot, captain.id);
                if (team === undefined || team.id !== teamId) {
                    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: 'team not found for this captain' }));
                    return;
                }
                try {
                    if (action === 'approve') {
                        const approved = await agentTeamsRuntime.approveStagedTeam(captain, teamId);
                        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                        res.end(JSON.stringify({ ok: true, phase: 'running', ...approved }));
                        return;
                    }
                    if (action === 'continue') {
                        const continued = await agentTeamsRuntime.continueStagedPlanning(captain, teamId);
                        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                        res.end(JSON.stringify({ ok: true, phase: 'staged', review: 'awaiting_feedback', ...continued }));
                        return;
                    }
                    if (action === 'discard') {
                        const discarded = await agentTeamsRuntime.discardStagedTeam(captain, teamId);
                        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                        res.end(JSON.stringify({ ok: true, phase: 'archived', ...discarded }));
                        return;
                    }
                    const dependencies = Array.isArray(payload['dependencies'])
                        ? payload['dependencies'].filter((item) => typeof item === 'string')
                        : [];
                    let mutation;
                    if (action === 'update_member') {
                        if (typeof payload['memberName'] !== 'string'
                            || typeof payload['provider'] !== 'string'
                            || typeof payload['model'] !== 'string')
                            throw new Error('memberName, provider, and model are required');
                        mutation = {
                            action,
                            memberName: payload['memberName'],
                            provider: payload['provider'],
                            model: payload['model'],
                            ...typeof payload['role'] === 'string' || payload['role'] === null ? { role: payload['role'] } : {},
                            ...typeof payload['reasoningEffort'] === 'string' || payload['reasoningEffort'] === null
                                ? { reasoningEffort: payload['reasoningEffort'] }
                                : {},
                            ...typeof payload['executionPrompt'] === 'string' || payload['executionPrompt'] === null
                                ? { executionPrompt: payload['executionPrompt'] }
                                : {},
                        };
                    }
                    else if (action === 'update_task') {
                        if (typeof payload['taskId'] !== 'string' || typeof payload['subject'] !== 'string') {
                            throw new Error('taskId and subject are required');
                        }
                        mutation = {
                            action,
                            taskId: payload['taskId'],
                            subject: payload['subject'],
                            dependencies,
                            ...typeof payload['description'] === 'string' || payload['description'] === null
                                ? { description: payload['description'] }
                                : {},
                            ...typeof payload['assignee'] === 'string' || payload['assignee'] === null
                                ? { assignee: payload['assignee'] }
                                : {},
                        };
                    }
                    else if (action === 'add_task') {
                        if (typeof payload['subject'] !== 'string')
                            throw new Error('subject is required');
                        mutation = {
                            action,
                            subject: payload['subject'],
                            dependencies,
                            ...typeof payload['description'] === 'string' || payload['description'] === null
                                ? { description: payload['description'] }
                                : {},
                            ...typeof payload['assignee'] === 'string' || payload['assignee'] === null
                                ? { assignee: payload['assignee'] }
                                : {},
                        };
                    }
                    else if (action === 'remove_task') {
                        if (typeof payload['taskId'] !== 'string')
                            throw new Error('taskId is required');
                        mutation = { action, taskId: payload['taskId'] };
                    }
                    else {
                        throw new Error(`unknown plan action "${action}"`);
                    }
                    const updated = await agentTeamsRuntime.updateStagedPlan(captain, teamId, mutation);
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ ok: true, phase: updated.phase, members: updated.members.length, tasks: updated.tasks.length }));
                }
                catch (error) {
                    res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'plan operation failed' }));
                }
            },
        }), 'agent-teams: plan route');
        // Whale mascot artwork: serve the packaged V2 role/action images to the
        // activity panel. An explicit allowlist guards the route (no path
        // traversal); the images ship with the bundle (files: assets/).
        const artDir = fileURLToPath(new URL('../assets/agent-teams/', import.meta.url));
        const ART_ALLOWLIST = new Set([
            'team-lead-v2.png',
            'member-researcher-v2.png', 'member-engineer-v2.png',
            'member-qa-v2.png', 'member-designer-v2.png',
            'member-security-v2.png', 'member-docs-v2.png',
            'member-data-v2.png', 'member-operator-v2.png',
            'action-working-v2.png', 'action-thinking-v2.png',
            'action-reporting-v2.png', 'action-celebrating-v2.png',
            'action-sleeping-v2.png', 'action-sending-v2.png',
        ]);
        ctx.effect(() => webServer.register({
            kind: 'prefix',
            path: '/plugins/dsh-agent-teams/assets',
            handler: async (req, res) => {
                let name;
                try {
                    name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.split('/').pop() ?? '');
                }
                catch {
                    // Malformed percent-encoding: treat as an unknown asset, not a 400.
                    res.writeHead(404);
                    res.end();
                    return;
                }
                if (!ART_ALLOWLIST.has(name)) {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                try {
                    const data = await readFile(join(artDir, name));
                    res.writeHead(200, {
                        'content-type': 'image/png',
                        'cache-control': 'public, max-age=86400',
                    });
                    res.end(data);
                }
                catch (error) {
                    ctx.logger.warn(`agent-teams: artwork read failed for ${name}: ${String(error)}`);
                    res.writeHead(404);
                    res.end();
                }
            },
        }), 'agent-teams: artwork route');
    };
    registerMigrationStatus();
    registerModelCatalog();
    registerWebSurface();
    ctx.on('internal/service', (name) => {
        if (WEB_SERVER_KEYS.includes(name)) {
            registerMigrationStatus();
            registerModelCatalog();
            registerWebSurface();
        }
        else if (WORKSPACE_KEYS.includes(name)) {
            registerWebSurface();
        }
    });
}
