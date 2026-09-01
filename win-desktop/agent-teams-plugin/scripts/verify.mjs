#!/usr/bin/env node
/**
 * Offline smoke verification for dsh-agent-teams.
 *
 * Runs the pure team-logic rules, the on-disk persistence flow, and the
 * browser workbench fold (events -> workbench projection) against throwaway
 * temp state. Requires a prior `pnpm build` (lib/ present). Does not touch
 * any running DSH instance or profile.
 *
 * Usage: node scripts/verify.mjs
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CAPTAIN_KEY,
  appendMailbox,
  createMessage,
  createTeamDir,
  findTeamByCaptain,
  findTeamByParticipant,
  readMailbox,
  readTeam,
  readTeamSync,
  removeTeamDir,
  sanitizeKey,
  transitionError,
  unsatisfiedDependencies,
  withTeamLock,
} from '../lib/state.js'
import {
  activityPanelExpandedForSession,
  activityPanelShouldAutoExpand,
  compactDagLayout,
  compactModelLabel,
  COMPACT_DAG_NODE_HEIGHT,
  COMPACT_DAG_NODE_WIDTH,
  dependencyFocusTaskId,
  memberRouteLabel,
  relatedTaskIds,
  taskModelLabel,
  taskStages,
  liveCaptainTeam,
  teamIsActive,
  teamProgressSummary,
  usesParallelTaskGrid,
} from '../lib/client/activity-model.js'
import {
  ACTIVITY_POLL_MS,
  ACTIVITY_PROBE_MS,
  getActivityMonitorTargetsSnapshot,
  monitorAgentTeam,
  startActivityPolling,
  subscribeActivityMonitorTargets,
} from '../lib/client/activity-monitor.js'
import {
  DEFAULT_PANEL_LAYOUT,
  compactPanelForBounds,
  dockPanelLayout,
  floatPanelLayout,
  movePanelLayout,
  panelMaximumHeight,
  panelUsesAutoHeight,
  parsePanelLayout,
  resizePanelLayout,
  resolvePanelGeometry,
} from '../lib/client/panel-geometry.js'
import { memberArtUrl } from '../lib/client/artwork.js'
import { parseAgentTeamsCreateArgs } from '../lib/client/agent-teams-card-definition.js'
import {
  AGENT_TEAMS_LOCALE_NAMESPACE,
  en as agentTeamsEn,
  zh as agentTeamsZh,
} from '../lib/client/locales.js'
import { openAgentTeamMember } from '../lib/client/session-navigation.js'
import { steerCaptainReport } from '../lib/tools.js'
import { renderStatus, statusFingerprint } from '../lib/status-render.js'
import { usageSectionText } from '../lib/index.js'
import { parseProfileInvocation, resolveTeamProfile, formatProfilesForPrompt } from '../lib/profiles.js'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { memberPersona, memberWelcome } from '../lib/members.js'
import { collectCompletedDependencyOutputs, formatDependencyOutputs, assignmentPrompt } from '../lib/scheduler.js'
import {
  installMemberSelectionRuntime,
  resolveMemberLlmSelection,
  spawnMember,
  validateMemberLlmSelections,
} from '../lib/members.js'

function automaticRunningProvenance(teamId, approvedAt = Date.now()) {
  return {
    planRevision: 1,
    approvedAt,
    approvedPlanRevision: 1,
    approvalSource: 'automatic',
    approvalEvidenceId: `automatic:create:${teamId}`,
  }
}

let failures = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('dsh-agent-teams offline verification')

const builtTools = await readFile(new URL('../lib/tools.js', import.meta.url), 'utf8')
const builtIndex = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
check(
  'tool schema exposes role reasoning policy',
  builtTools.includes('Role reasoning policy') && builtTools.includes('explicit requires provider/model/reasoning_effort'),
)
check(
  'usage prompt says model policy is role-specific',
  builtIndex.includes('target-default') && builtIndex.includes('route-aware') && builtIndex.includes('explicit'),
)
check(
  'usage prompt omits profile when no profile is configured',
  builtIndex.includes('If none are listed, omit the profile property; never send profile="" or default/none/captain placeholders.'),
)

const softwareDeliveryPrompt = usageSectionText(
  'teams-v1',
  'agent_teams_create, agent_teams_approve, agent_teams_edit_plan, agent_teams_add_member, agent_teams_remove_member, agent_teams_create_task, agent_teams_reassign_task, agent_teams_claim_task, agent_teams_update_task, agent_teams_send_message, agent_teams_status, agent_teams_resume, agent_teams_delete',
  formatProfilesForPrompt({
    'software-delivery': {
      description: 'A general software delivery team for analysis, implementation, verification, and review.',
      protocol: 'Keep scope, acceptance criteria, and verification evidence traceable. Analyze before implementation and verify before delivery.',
      taskPlanning: 'captain',
      members: [
        { name: 'analyst', role: 'Requirements analyst', reasoning_mode: 'target-default' },
        { name: 'implementer', role: 'Implementation engineer', reasoning_mode: 'target-default' },
        { name: 'tester', role: 'Verification engineer', reasoning_mode: 'target-default' },
        { name: 'reviewer', role: 'Code and risk reviewer', reasoning_mode: 'target-default' },
      ],
    },
  }),
)
check(
  'usage prompt stays within the software-delivery budget',
  softwareDeliveryPrompt.length <= 3500,
  `length = ${softwareDeliveryPrompt.length}`,
)
for (const [label, pattern] of [
  ['state unknown', /unknown[^\n]*agent_teams_status/i],
  ['state inactive', /inactive[^\n]*create/i],
  ['state staged', /staged[^\n]*edit[^\n]*(?:wait|approval)/i],
  ['state running', /running[^\n]*(?:create-task|create_task)[^\n]*message[^\n]*reassign/i],
  ['state halted', /halted[^\n]*resume/i],
  ['approval boundary', /approval="required"[^\n]*never[^\n]*(?:self-approve|approve it)/i],
  ['approval preflight', /agent_teams_status[^\n]*active=true[^\n]*phase=staged/i],
  ['profile omission', /omit the profile property[^\n]*profile=""/i],
  ['reasoning ownership', /target-default[^\n]*route-aware[^\n]*explicit/i],
  ['route pairing', /provider\/model[^\n]*(?:both|pair)/i],
  ['scheduler dependencies', /dependenc[^\n]*scheduler/i],
  ['attempt and reassignment', /attempt_id[^\n]*reassign/i],
  ['requirements gate', /requirements[^\n]*implementation[^\n]*verdict=pass/i],
  ['review repair loop', /review[^\n]*repair/i],
  ['scope and deliverables', /inScope[^\n]*deliverable/i],
  ['verification evidence', /verification evidence/i],
  ['cleanup', /agent_teams_delete/i],
  ['deployment confirmation', /deployment[^\n]*explicit user confirmation/i],
]) {
  check(`usage prompt preserves ${label}`, pattern.test(softwareDeliveryPrompt))
}
check(
  'usage prompt removes the duplicated eleven-step manual',
  !/Follow this protocol:\s*\n1\./.test(softwareDeliveryPrompt)
    && !/10\. When the user explicitly requests full quality-mode planning/.test(softwareDeliveryPrompt),
)
check(
  'status guidance separates read-only monitoring from recovery wake-up',
  builtIndex.includes('status is read-only')
    && builtIndex.includes('wake="recover"')
    && builtTools.includes('detail')
    && builtTools.includes('wake')
    && builtTools.includes('acknowledge')
    && builtTools.includes('recover'),
)

const statusRenderFixture = {
  team_name: 'render-demo',
  description: 'A team description that remains useful in the compact view.',
  profile: {
    name: 'software-delivery',
    protocol: 'private verbose profile protocol that belongs only in the full view',
    task_planning: 'captain',
  },
  viewer: 'captain',
  members: [{
    name: 'reviewer',
    role: 'review',
    provider: 'provider-x',
    model: 'expensive-review-model',
    reasoning_effort: 'high',
    status: 'working',
    activity: 'running',
  }],
  tasks: [{
    id: 't1',
    subject: 'Review implementation',
    status: 'completed',
    assignee: 'reviewer',
    dependencies: ['requirements'],
    attempt: 2,
    attempt_id: 'attempt-2',
    reassigning: false,
    verdict: 'pass',
    findings_open: 2,
    output: 'verbose-output-that-must-not-be-repeated-in-summary',
  }],
  coverage: [{ goal_item: 'quality', task_ids: ['t1'], status: 'covered' }],
  delivery: { ok: false, blockers: ['waiting for explicit deployment confirmation'] },
  captain_inbox: [{ from: 'reviewer', content: 'new review message' }],
  member_inboxes: { tester: { count: 1, latest: 'new tester message' } },
  mailbox_warnings: ['tester mailbox line 4'],
  mailbox_warning_count: 1,
}
const compactStatus = renderStatus(statusRenderFixture)
const fullStatus = renderStatus(statusRenderFixture, 'full')
const unchangedStatus = renderStatus({ ...statusRenderFixture, status_summary_unchanged: true })
check(
  'status summary keeps quality gates and omits verbose detail',
  compactStatus.includes('Delivery: blocked')
    && compactStatus.includes('Coverage:')
    && compactStatus.includes('verdict pass')
    && compactStatus.includes('findings 2')
    && compactStatus.includes('attempt 2 id attempt-2')
    && compactStatus.includes('(deps: requirements)')
    && compactStatus.includes('reviewer [review] working/running')
    && compactStatus.includes('Member inbox tester (1): latest — new tester message')
    && compactStatus.includes('Mailbox warnings (1; malformed lines were skipped; showing up to 10):')
    && compactStatus.includes('Task outputs omitted')
    && !compactStatus.includes('verbose-output-that-must-not-be-repeated-in-summary')
    && !compactStatus.includes('private verbose profile protocol')
    && !compactStatus.includes('expensive-review-model'),
)
check(
  'full status still exposes model, profile protocol, and task output on demand',
  fullStatus.includes('provider-x/expensive-review-model')
    && fullStatus.includes('private verbose profile protocol')
    && fullStatus.includes('verbose-output-that-must-not-be-repeated-in-summary'),
)
check(
  'unchanged status collapses to a current-state heartbeat',
  unchangedStatus.includes('No summary-visible Team state changes since the previous status query.')
    && unchangedStatus.includes('Delivery: blocked')
    && !unchangedStatus.includes('verbose-output-that-must-not-be-repeated-in-summary'),
)
check(
  'summary fingerprint ignores hidden long-form fields',
  statusFingerprint(statusRenderFixture)
    === statusFingerprint({
      ...statusRenderFixture,
      profile: { ...statusRenderFixture.profile, protocol: 'a different long protocol' },
      tasks: [{ ...statusRenderFixture.tasks[0], output: 'a different long report' }],
    }),
)

// Named multi-role profile rules
const demoProfiles = { ' demo ': { protocol: 'a'.repeat(300), members: [{ name: ' Implementer ', role: 'builder', provider: 'p', model: 'm', reasoning_mode: 'target-default' }, { name: 'Reviewer', provider: 'p', model: 'r', reasoning_mode: 'target-default' }], tasks: [{ id: 'design', subject: 'Design', assignee: 'implementer' }, { id: 'review', subject: 'Review', assignee: ' reviewer ', dependencies: ['design'] }] } }
const normalizedDemo = resolveTeamProfile(demoProfiles, 'demo', 8)
check('profile keys trim and assignees canonicalize', normalizedDemo.members[0].name === 'Implementer' && normalizedDemo.tasks[1].assignee === 'Reviewer')
check('profile tasks are stable topological order', normalizedDemo.tasks[0].id === 'design' && normalizedDemo.tasks[1].id === 'review')
check('profile invocation supports --profile=', parseProfileInvocation('--profile=demo ship it').profile === 'demo' && parseProfileInvocation('--profile=demo ship it').goal === 'ship it')
check('profile invocation leaves mid-goal profile text untouched', parseProfileInvocation('research profile=prod config').goal === 'research profile=prod config')
check('profile prompt omits empty config and truncates protocol', formatProfilesForPrompt(demoProfiles).includes('demo') && formatProfilesForPrompt(demoProfiles).length < 400)
check('seed planning remains the default', normalizedDemo.taskPlanning === 'seed')
const captainPlanned = resolveTeamProfile({
  dynamic: {
    taskPlanning: 'captain',
    members: [{ name: 'analyst', provider: 'p', model: 'a', reasoning_mode: 'target-default' }, { name: 'reviewer', provider: 'p', model: 'r', reasoning_mode: 'target-default' }],
    tasks: [
      { id: 'requirements', subject: 'Requirements', assignee: 'analyst' },
      { id: 'review', subject: 'Review', assignee: 'reviewer', dependencies: ['requirements'] },
    ],
  },
}, 'dynamic', 8)
check('captain planning keeps the roster and drops seed tasks', captainPlanned.taskPlanning === 'captain' && captainPlanned.members.length === 2 && captainPlanned.tasks.length === 0)
check('profile prompt marks captain planning instead of unused seed counts', formatProfilesForPrompt({ dynamic: { taskPlanning: 'captain', members: [{ name: 'solo', provider: 'p', model: 'm', reasoning_mode: 'target-default' }], tasks: [{ id: 'work', subject: 'Work', assignee: 'solo' }] } }).includes('captain planning'))
const profilePersona = memberPersona({ name: 'Demo', id: 'demo', description: 'goal', profile: { name: 'demo', protocol: 'p'.repeat(600) }, captainSessionId: 'c', createdAt: 0, members: [], tasks: [], taskSeq: 0 }, { name: 'Implementer', id: 'm', role: 'builder', joinedAt: 0, status: 'idle' }, '.agent-teams')
check('member persona includes completed/failed and claimed transition rules', profilePersona.includes('status=completed') && profilePersona.includes('status=failed') && profilePersona.includes('claimed') && profilePersona.includes('in_progress'))
const welcome = memberWelcome({ name: 'Demo', id: 'demo', captainSessionId: 'c', createdAt: 0, members: [], tasks: [{ id: 't1', subject: 'x', status: 'pending', assignee: 'Implementer', dependencies: [], createdAt: 0, updatedAt: 0 }], taskSeq: 1 }, 'Implementer')
check('member welcome reports assigned pending count', welcome.includes('1 pending task(s) assigned to you') && !welcome.includes('none assigned to you yet'))
const truncated = formatDependencyOutputs([
  { id: 't1', subject: 'old', profileSeedId: 'requirements', output: 'x'.repeat(2500) },
  { id: 't2', subject: 'new', profileSeedId: 'implement', output: 'keep-me' },
])
check('dependency outputs truncate and keep the newest seed id',
  truncated.includes('[implement]') && truncated.includes('keep-me') && truncated.includes('[truncated]'))
let cycleWarned = false
const cycled = collectCompletedDependencyOutputs([
  { id: 't1', subject: 'a', status: 'completed', dependencies: ['t2'], createdAt: 0, updatedAt: 0 },
  { id: 't2', subject: 'b', status: 'completed', dependencies: ['t1'], createdAt: 0, updatedAt: 0 },
], 't2', () => { cycleWarned = true })
check('recursive dependency collection stops on cycles', cycleWarned && Array.isArray(cycled))
check('persona protocol is truncated', profilePersona.includes('p'.repeat(400)) && !profilePersona.includes('p'.repeat(401)))
const injected = 'The product interface should present the intended outcome, not reveal the reasoning process.'
const assignment = assignmentPrompt({ taskId: 't1', memberName: 'Implementer', memberId: 'm', attempt: 1, attemptId: 'a', subject: 'x', dependencyOutputs: [], executionPrompt: injected }, '.agent-teams', 'demo')
check('execution prompt is injected into persona and assignment', assignment.includes(injected) && memberPersona({ name: 'Demo', id: 'demo', description: 'goal', captainSessionId: 'c', createdAt: 0, members: [], tasks: [], taskSeq: 0 }, { name: 'Implementer', id: 'm', role: 'builder', joinedAt: 0, status: 'idle', executionPrompt: injected }, '.agent-teams').includes(injected))

// The bundle patch's `name` is the specifier Node resolves when a profile
// loads this plugin, so it must equal the published package name. A mismatch
// only surfaces after someone installs the package (the row fails to load),
// never in local link-installed development — hence this pre-publish gate.
console.log('1/8 packaging contract')
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patchText = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patchName = patchText
  .split('\n')
  .filter(line => !/^\s*#/.test(line))
  .find(line => /^\s*name:\s*\S/.test(line))
  ?.match(/^\s*name:\s*(.+?)\s*$/)?.[1]
  ?.replace(/^(['"])(.*)\1$/, '$2')
check(
  'cordis.patch.yml name matches the published package name',
  patchName === pkg.name,
  `patch has ${JSON.stringify(patchName)}, package.json has ${JSON.stringify(pkg.name)}`,
)
check(
  'files[] ships the bundle patch and lib',
  ['lib', 'cordis.patch.yml'].every(entry => pkg.files?.includes(entry)),
  `files = ${JSON.stringify(pkg.files)}`,
)
check(
  'scoped package publishes publicly',
  !pkg.name.startsWith('@') || pkg.publishConfig?.access === 'public',
  'scoped packages default to restricted without publishConfig.access = "public"',
)
const requiredPeers = Object.keys(pkg.peerDependencies ?? {})
  .filter(name => pkg.peerDependenciesMeta?.[name]?.optional !== true)
check(
  'shared runtime peers are optional for standalone profile installs',
  requiredPeers.length === 0,
  `required peers trigger pnpm warnings: ${JSON.stringify(requiredPeers)}`,
)
// The browser half registers itself with __ModuleLoader__ under an id the host
// resolves by package name. A stale id here fails only in the browser — the
// host half loads fine, so every server-side check still passes.
const clientBundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const registeredId = clientBundle.match(/__ModuleLoader__\.load\(\{\s*id:\s*"([^"]*)"/)?.[1]
check(
  'client bundle registers under the package name',
  registeredId === pkg.name,
  `bundle registers ${JSON.stringify(registeredId)}, package.json has ${JSON.stringify(pkg.name)}`,
)
const activityPanelCss = await readFile(new URL('../src/client/ActivityPanel.module.css', import.meta.url), 'utf8')
const activityPanelSource = await readFile(new URL('../src/client/ActivityPanel.tsx', import.meta.url), 'utf8')
const activityMonitorSource = await readFile(new URL('../src/client/activity-monitor.ts', import.meta.url), 'utf8')
const sessionNavigationSource = await readFile(new URL('../src/client/session-navigation.ts', import.meta.url), 'utf8')
const stagingPlanSource = await readFile(new URL('../src/client/StagingPlanEditor.tsx', import.meta.url), 'utf8')
const stagedTaskMutationSource = await readFile(new URL('../src/client/staged-task-mutation.ts', import.meta.url), 'utf8')
const stagedPlanPayloadSource = await readFile(new URL('../src/staged-plan-payload.ts', import.meta.url), 'utf8')
const clientIndexSource = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
const agentTeamsCardCss = await readFile(new URL('../src/client/AgentTeamsCard.module.css', import.meta.url), 'utf8')
const agentTeamsCardSource = await readFile(new URL('../src/client/AgentTeamsCard.tsx', import.meta.url), 'utf8')
const artworkSource = await readFile(new URL('../src/client/artwork.ts', import.meta.url), 'utf8')
const hostSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
const toolsSource = await readFile(new URL('../src/tools.ts', import.meta.url), 'utf8')
const localesSource = await readFile(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
const localeKeys = Object.keys(agentTeamsZh).sort()
const englishLocaleKeys = Object.keys(agentTeamsEn).sort()
const placeholders = value => [...value.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort()
check(
  'AgentTeams locale dictionaries have identical keys and template placeholders',
  localeKeys.length > 0
    && JSON.stringify(localeKeys) === JSON.stringify(englishLocaleKeys)
    && localeKeys.every(key => JSON.stringify(placeholders(agentTeamsZh[key]))
      === JSON.stringify(placeholders(agentTeamsEn[key]))),
)
check(
  'client registers the official locale namespace on all three visible slots',
  AGENT_TEAMS_LOCALE_NAMESPACE === 'agentTeams'
    && clientIndexSource.includes("'uiConversation', 'slots', 'sessions', 'locale', 'modelDirectories'")
    && clientIndexSource.includes('ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, { zh, en })')
    && clientIndexSource.match(/locale:\s*AGENT_TEAMS_LOCALE_NAMESPACE/gu)?.length === 3,
)
check(
  'activity panel renders only current V2 live/archive snapshots',
  !activityPanelSource.includes('historicCardTeam')
    && !activityPanelSource.includes('visibleHistoric')
    && !activityPanelSource.includes('setHistoric'),
)
check(
  'activity-panel summon carries no historic card projection payload',
  !agentTeamsCardSource.includes('historical session review')
    && !agentTeamsCardSource.includes('detail:'),
)
check(
  'activity monitor has no archive-driven target retirement path',
  !activityMonitorSource.includes('settleActivityMonitorTargets')
    && !activityMonitorSource.includes('settleTargets')
    && !activityMonitorSource.includes('target.active'),
)
check(
  'member navigation has no ordinary session fallback',
  !sessionNavigationSource.includes('sessions.open(childSessionId)')
    && !sessionNavigationSource.includes("return 'session'"),
)
check(
  'slash command transcript hides the duplicate pre-message result row',
  clientIndexSource.includes('HiddenAgentTeamsCommand')
    && /name:\s*'conversation\.chat\.commandview',\s*key:\s*'agent-teams'/u.test(clientIndexSource),
)
check(
  'stop-team control lives in the team panel and requires confirmation',
  !clientIndexSource.includes("conversation.input.dock")
    && activityPanelSource.includes('className={css.teamStopButton}')
    && activityPanelSource.includes('<Modal')
    && activityPanelSource.includes('ACTIVITY_HALT_URL'),
)
check(
  'clean builds do not package the removed composer stop banner',
  !existsSync(new URL('../lib/client/TeamProgressBanner.js', import.meta.url))
    && !existsSync(new URL('../lib/types/client/TeamProgressBanner.d.ts', import.meta.url)),
)
check(
  'staged member routes use the official directory and primitive Menu instead of native route selects',
  clientIndexSource.includes('@deepseek-ai/dsh-client-ui-model-selection/client')
    && stagingPlanSource.includes('directory.store.subscribe')
    && stagingPlanSource.includes("from '@deepseek-ai/dsh-client-ui-primitives'")
    && stagingPlanSource.includes('<Menu')
    && stagingPlanSource.includes('data-plan-model-trigger')
    && !stagingPlanSource.includes('name="provider"')
    && !stagingPlanSource.includes('name="model"')
    && !stagingPlanSource.includes('name="modelRoute"')
    && !stagingPlanSource.includes('name="reasoningEffort"'),
)
check(
  'staged plan review offers continue, discard, and approve outcomes',
  stagingPlanSource.includes('data-plan-continue')
    && stagingPlanSource.includes('data-plan-discard')
    && stagingPlanSource.includes("action: 'continue'")
    && stagingPlanSource.includes("action: 'discard'")
    && hostSource.includes("if (action === 'continue')")
    && hostSource.includes("if (action === 'discard')"),
)
check(
  'review decisions control the Captain turn instead of relying on front-end state alone',
  toolsSource.includes('stagedPlanFeedbackContext')
    && toolsSource.includes('stagedPlanDiscardContext')
    && toolsSource.includes("fresh.planReviewState = 'awaiting_feedback'")
    && toolsSource.includes("captain.cancel({ kind: 'user' }, { keepInbox: true })")
    && toolsSource.includes('captain.followup(createUserMessage')
    && toolsSource.includes('captain.inject(createUserMessage')
    && toolsSource.includes('Do not create a replacement team')
    && toolsSource.includes('Do not call agent_teams_create'),
)
check(
  'continued planning uses a model-facing atomic staged-plan tool instead of state-file edits',
  toolsSource.includes("name: 'agent_teams_edit_plan'")
    && toolsSource.includes('updateStagedPlanBatch')
    && toolsSource.includes("action: 'remove_member'")
    && toolsSource.includes('none of the edits are saved')
    && hostSource.includes('agent_teams_edit_plan')
    && hostSource.includes('Never inspect or edit .agent-teams state files or plugin source code'),
)
check(
  'staged plan browser persists all three member reasoning policies without leaking non-explicit effort',
  stagingPlanSource.includes('reasoningMode')
    && stagingPlanSource.includes("'target-default'")
    && stagingPlanSource.includes("'route-aware'")
    && stagingPlanSource.includes("'explicit'")
    && stagedPlanPayloadSource.includes("payload['reasoningMode']")
    && hostSource.includes('stagedPlanMutationFromPayload(payload)'),
)
check(
  'staged plan browser and host preserve the complete quality task contract',
  stagingPlanSource.includes("from './staged-task-mutation.ts'")
    && stagingPlanSource.includes('await mutatePlan(buildStagedTaskMutationPayload({')
    && stagedTaskMutationSource.includes('inScope: parseLineList(draft.inScope)')
    && stagedTaskMutationSource.includes('outOfScope: parseLineList(draft.outOfScope)')
    && stagedTaskMutationSource.includes('acceptance: parseLineList(draft.acceptance)')
    && stagedTaskMutationSource.includes('verify: parseLineList(draft.verify)')
    && stagedTaskMutationSource.includes('deliverables: parseLineList(draft.deliverables)')
    && stagedTaskMutationSource.includes('nonGoals: parseLineList(draft.nonGoals)')
    && stagedTaskMutationSource.includes('sourceFindingIds: parseLineList(draft.sourceFindingIds)')
    && stagedTaskMutationSource.includes('coverageOf: parseLineList(draft.coverageOf)')
    && stagedPlanPayloadSource.includes("optionalPayloadStringList(payload, 'inScope')")
    && stagedPlanPayloadSource.includes("optionalPayloadStringList(payload, 'deliverables')")
    && stagedPlanPayloadSource.includes("optionalPayloadStringList(payload, 'coverageOf')")
    && hostSource.includes('stagedPlanMutationFromPayload(payload)'),
)
check(
  'discarded and stopped teams render terminal semantics instead of pending execution copy',
  activityPanelSource.includes("const discarded = historic && team.phase === 'staged'")
    && activityPanelSource.includes("t('member.status.discarded')")
    && activityPanelSource.includes("t('member.status.stopped')")
    && activityPanelSource.includes("'archive.discardedLabel'")
    && localesSource.includes("'task.status.notRun': '未执行'")
    && localesSource.includes("'member.state.notCreated': '未创建'"),
)
const expectedArtwork = [
  'team-lead-v2.png',
  'member-researcher-v2.png', 'member-engineer-v2.png',
  'member-qa-v2.png', 'member-designer-v2.png',
  'member-security-v2.png', 'member-docs-v2.png',
  'member-data-v2.png', 'member-operator-v2.png',
  'action-working-v2.png', 'action-thinking-v2.png',
  'action-reporting-v2.png', 'action-celebrating-v2.png',
  'action-sleeping-v2.png', 'action-sending-v2.png',
].sort()
const artworkDir = new URL('../assets/agent-teams/', import.meta.url)
const packagedArtwork = (await readdir(artworkDir)).sort()
check(
  'artwork directory contains exactly the V2 captain, eight members, and six actions',
  JSON.stringify(packagedArtwork) === JSON.stringify(expectedArtwork),
  `artwork = ${JSON.stringify(packagedArtwork)}`,
)
const artworkHeaders = await Promise.all(expectedArtwork.map(async (name) => {
  const data = await readFile(new URL(name, artworkDir))
  return {
    name,
    png: data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bitDepth: data[24],
    colorType: data[25],
  }
}))
check(
  'all V2 artwork is 256x256 8-bit RGBA PNG',
  artworkHeaders.every(image => image.png
    && image.width === 256
    && image.height === 256
    && image.bitDepth === 8
    && image.colorType === 6),
  `invalid headers = ${JSON.stringify(artworkHeaders.filter(image => !image.png
    || image.width !== 256
    || image.height !== 256
    || image.bitDepth !== 8
    || image.colorType !== 6))}`,
)
check(
  'client mapping and host allowlist reference every V2 artwork asset',
  expectedArtwork.every(name => artworkSource.includes(name) || hostSource.includes(name))
    && artworkSource.includes('member-data-v2.png')
    && artworkSource.includes('member-operator-v2.png'),
  'a packaged image is unreachable or one of the eighth-member mappings is missing',
)
const eightRoleArtwork = [
  ['Researcher', 'Researcher'],
  ['Engineer', 'Backend Engineer'],
  ['QA', 'QA Engineer'],
  ['Designer', 'UI UX Designer'],
  ['Security', 'Security Reviewer'],
  ['Docs', 'Docs Writer'],
  ['Data', 'Data Analyst'],
  ['Operator', 'Release Operator'],
].map(([name, role]) => memberArtUrl(name, role))
check(
  'canonical eight-member roster resolves to eight distinct role images',
  eightRoleArtwork.every(Boolean) && new Set(eightRoleArtwork).size === 8,
  `resolved artwork = ${JSON.stringify(eightRoleArtwork)}`,
)
check(
  'whale portraits use transparent cutouts instead of dark circular plates',
  !/#0b1d33/iu.test(`${activityPanelCss}\n${agentTeamsCardCss}`)
    && activityPanelCss.includes('object-fit: contain')
    && activityPanelCss.includes('agentTeamsUnreadPulse')
    && agentTeamsCardCss.includes('object-fit: contain'),
  'portrait CSS should preserve each transparent role silhouette and use a compact unread dot',
)
const requiredHarnessTokenBridges = [
  '--dsw-alias-line-normal: var(--dsw-static-neutral-bluish-150',
  '--dsw-alias-bg-module: var(--dsw-alias-bg-layer-1',
  '--dsw-alias-state-success: var(--dsw-alias-state-success-primary',
  '--dsw-alias-state-warning: var(--dsw-alias-state-warn-primary',
  '--dsw-alias-state-danger: var(--dsw-alias-state-error-primary',
]
check(
  'activity panel bridges the reference palette to current Harness tokens',
  requiredHarnessTokenBridges.every(token => activityPanelCss.includes(token)),
  'missing token bridges make panel fills and DAG borders transparent',
)
check(
  'activity panel uses the shell overlay instead of a page-breaking body portal',
  clientIndexSource.includes("ctx.slots.inject('shell.overlay'")
    && !clientIndexSource.includes('createRoot')
    && activityPanelCss.includes('position: absolute')
    && !activityPanelCss.includes('2147483000')
    && !activityPanelCss.includes('position: fixed'),
  'a body portal or unbounded z-index can cover host modal controls',
)
check(
  'panel exposes drag, resize, dock, and fold interaction probes',
  activityPanelSource.includes('data-drag-handle')
    && activityPanelSource.includes('data-resize-edge="left"')
    && activityPanelSource.includes('data-resize-edge="corner"')
    && activityPanelSource.includes('data-control="dock"')
    && activityPanelSource.includes('data-control="collapse"')
    && activityPanelSource.includes('data-height-mode=')
    && activityPanelSource.includes("height: autoHeight ? 'auto'")
    && activityPanelCss.includes('.resizeHandle')
    && activityPanelCss.includes('scrollbar-width: thin')
    && !activityPanelCss.includes('scrollbar-width: none'),
  'interactive panel controls must stay visible to browser verification',
)
check(
  'staged plan editor keeps long plans compact and guards consequential actions',
  stagingPlanSource.includes('aria-expanded={open}')
    && stagingPlanSource.includes('aria-live=')
    && stagingPlanSource.includes('confirmingRemove')
    && !stagingPlanSource.includes('approvalArmed')
    && stagingPlanSource.includes('data-plan-approve')
    && stagingPlanSource.includes('data-confirming')
    && activityPanelCss.includes('.planCardHeader')
    && activityPanelCss.includes('.planFeedback')
    && activityPanelCss.includes('.planApproveRow')
    && activityPanelCss.includes('position: sticky')
    && activityPanelCss.includes('container-type: inline-size')
    && activityPanelCss.includes('@container agent-team')
    && activityPanelCss.includes('.planSectionToggle:focus-visible'),
  'plan review must expose disclosure, feedback, destructive confirmation, focus, sticky action, and container-based narrow-layout contracts',
)
check(
  'staged task drafts survive content-identical polling snapshots',
  stagingPlanSource.includes('}, [remoteSignature])')
    && !stagingPlanSource.includes('task.inScope,\n    task.outOfScope,'),
)
check(
  'running DAG tasks reuse the animated work glyph without losing focus context',
  activityPanelSource.includes("task.state === 'running'")
    && activityPanelSource.includes('className={css.dagRunningState}')
    && activityPanelSource.includes('<WorkGlyph active />')
    && activityPanelCss.includes(".dagNode[data-state='running'][data-dimmed='true']")
    && activityPanelCss.includes('.dagRunningState {'),
  'running work should stay visible in both normal and dependency-focus states',
)
check(
  'running tasks surface the assignee model on the activity card',
  activityPanelSource.includes('taskModelLabel(task, members)')
    && activityPanelSource.includes('data-task-model={model || undefined}')
    && activityPanelSource.includes('data-task-model={detailModel}')
    && activityPanelSource.includes('member.status.executingModel')
    && activityPanelSource.includes('css.taskDetailModel')
    && activityPanelSource.includes('css.memberModel')
    && activityPanelCss.includes('.taskDetailModel')
    && activityPanelCss.includes('.memberModel'),
  'the right-side card must show which model a running subtask is using',
)
check(
  'activity polling combines card demand with current-session cold discovery',
  activityPanelSource.includes('if (current === undefined) return')
    && activityPanelSource.includes('startActivityPolling(currentTargets, { discoverySessionId: current })')
    && agentTeamsCardSource.includes('monitorAgentTeam(owner, data.teamId)')
    && !agentTeamsCardSource.includes('setInterval(')
    && !agentTeamsCardSource.includes('fetch('),
  'the global panel must recover cardless sessions without duplicate card pollers',
)

console.log('2/8 pure rules')
check("sanitizeKey('My Team!') -> 'my-team'", sanitizeKey('My Team!') === 'my-team')
// #15: an ASCII-only whitelist folded every non-Latin name onto one constant,
// so distinct members shared a mailbox file and the second one was rejected as
// a duplicate. Keys must stay distinct for distinct names, in any script.
check("CJK names survive folding", sanitizeKey('研究员') === '研究员')
check(
  'distinct non-Latin names stay distinct',
  sanitizeKey('研究员') !== sanitizeKey('工程师')
    && sanitizeKey('データ分析') !== sanitizeKey('Данные'),
)
check(
  'names with no letters or digits get distinct keys, not a shared constant',
  sanitizeKey('!!!') !== sanitizeKey('🐳') && sanitizeKey('🐳') !== '',
)
check('folding is deterministic', sanitizeKey('🐳') === sanitizeKey('🐳'))
check(
  'long names stay inside the filesystem name limit',
  Buffer.byteLength(`${sanitizeKey('研'.repeat(300))}.jsonl`) < 255,
)
check(
  'long names sharing a prefix stay distinct',
  sanitizeKey(`${'研'.repeat(60)}a`) !== sanitizeKey(`${'研'.repeat(60)}b`),
)
check(
  'keys stay a single safe path segment',
  !/[\\/:*?"<>|]/.test(sanitizeKey('a/b\\c:d*e?f"g<h>i|j')) && !sanitizeKey('../../etc').includes('.'),
)
check('pending -> claimed allowed', transitionError('pending', 'claimed') === undefined)
check('pending -> in_progress denied', transitionError('pending', 'in_progress') !== undefined)
check('in_progress -> completed allowed', transitionError('in_progress', 'completed') === undefined)
check('completed -> in_progress denied', transitionError('completed', 'in_progress') !== undefined)
check('same status is a no-op', transitionError('failed', 'failed') === undefined)

console.log('3/8 dependency gating')
const tasks = [
  { id: 't1', status: 'completed' },
  { id: 't2', status: 'pending' },
  { id: 't3', status: 'failed' },
]
check('all-done deps satisfied', unsatisfiedDependencies(tasks, ['t1']).length === 0)
check('pending dep blocks', unsatisfiedDependencies(tasks, ['t2']).length === 1)
check('failed dep blocks too', unsatisfiedDependencies(tasks, ['t3']).length === 1)

console.log('4/8 on-disk team flow (temp dir)')
const stateRoot = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-verify-'))
try {
  const team = {
    schemaVersion: 2,
    name: 'Verify Team',
    id: sanitizeKey('Verify Team'),
    description: 'smoke',
    captainSessionId: 'sess-captain',
    createdAt: Date.now(),
    members: [
      { id: 'sess-member', name: 'alice', provider: 'cpa', model: 'cheap-model', reasoningMode: 'target-default', joinedAt: Date.now(), status: 'idle' },
      { id: 'sess-removed', name: 'former', provider: 'cpa', model: 'cheap-model', reasoningMode: 'target-default', joinedAt: Date.now(), status: 'removed' },
    ],
    tasks: [],
    taskSeq: 0,
    ...automaticRunningProvenance(sanitizeKey('Verify Team')),
    phase: 'running',
  }
  await createTeamDir(stateRoot, team)

  const reread = await readTeam(stateRoot, team.id)
  check('team.json round-trips', reread?.id === team.id && reread.captainSessionId === 'sess-captain')

  await writeFile(join(stateRoot, team.id, 'team.json'), `\uFEFF${JSON.stringify(team, null, 2)}`, 'utf8')
  check('team.json accepts a UTF-8 BOM', (await readTeam(stateRoot, team.id))?.id === team.id)

  function teamV2(overrides = {}) {
    const now = Date.now()
    return {
      schemaVersion: 2,
      name: 'V2 Team',
      id: 'v2-team',
      captainSessionId: 'captain-session',
      createdAt: now,
      ...automaticRunningProvenance('v2-team', now),
      phase: 'running',
      members: [{
        id: 'member-1',
        name: 'implementer',
        provider: 'cpa',
        model: 'cheap-model',
        reasoningMode: 'target-default',
        joinedAt: now,
        status: 'idle',
      }],
      tasks: [{
        id: 't1',
        subject: 'work',
        kind: 'work',
        status: 'pending',
        dependencies: [],
        createdAt: now,
        updatedAt: now,
      }],
      taskSeq: 1,
      ...overrides,
    }
  }

  async function assertStrictReject(label, value, expectedId = 'v2-team') {
    const file = join(stateRoot, expectedId, 'team.json')
    await mkdir(join(stateRoot, expectedId, 'inbox'), { recursive: true })
    const serialized = JSON.stringify(value, null, 2)
    await writeFile(file, serialized, 'utf8')
    let asyncRejected = false
    try {
      await readTeam(stateRoot, expectedId)
    } catch (error) {
      asyncRejected = /AgentTeams (V2 状态无效|状态不受支持)/.test(String(error?.message ?? error))
    }
    const afterAsync = await readFile(file, 'utf8')
    let syncRejected = false
    try {
      readTeamSync(stateRoot, expectedId)
    } catch (error) {
      syncRejected = /AgentTeams (V2 状态无效|状态不受支持)/.test(String(error?.message ?? error))
    }
    const afterSync = await readFile(file, 'utf8')
    check(label, asyncRejected && syncRejected && afterAsync === serialized && afterSync === serialized)
    await removeTeamDir(stateRoot, expectedId)
  }

  await assertStrictReject('strict V2 rejects missing schema version', (() => {
    const invalid = teamV2()
    delete invalid.schemaVersion
    return invalid
  })())
  await assertStrictReject('strict V2 rejects string Profile', teamV2({ profile: 'legacy-profile' }))
  await assertStrictReject('strict V2 rejects missing phase', (() => {
    const invalid = teamV2()
    delete invalid.phase
    return invalid
  })())
  await assertStrictReject('strict V2 rejects staged state without plan review state', teamV2({ phase: 'staged' }))
  await assertStrictReject('strict V2 rejects running state with plan review state', teamV2({ planReviewState: 'awaiting_review' }))
  await assertStrictReject('strict V2 rejects missing member route', teamV2({
    members: [{ ...teamV2().members[0], provider: undefined }],
  }))
  await assertStrictReject('strict V2 rejects missing member reasoning mode', teamV2({
    members: [{ ...teamV2().members[0], reasoningMode: undefined }],
  }))
  await assertStrictReject('strict V2 rejects missing task kind', teamV2({
    tasks: [{ ...teamV2().tasks[0], kind: undefined }],
  }))
  await assertStrictReject('strict V2 rejects empty quality fields', teamV2({
    tasks: [{
      ...teamV2().tasks[0],
      profileSeedId: ' ',
      objective: '',
      reviewedTaskId: '',
      sourceTaskId: '',
    }],
  }))
  await assertStrictReject('strict V2 rejects round zero', teamV2({
    tasks: [{ ...teamV2().tasks[0], round: 0 }],
  }))

  const found = await findTeamByCaptain(stateRoot, 'sess-captain')
  check('findTeamByCaptain finds the team', found?.id === team.id)
  check('findTeamByCaptain ignores other captains', await findTeamByCaptain(stateRoot, 'sess-other') === undefined)
  check('findTeamByParticipant finds the captain', (await findTeamByParticipant(stateRoot, 'sess-captain'))?.id === team.id)
  check('findTeamByParticipant finds an active member', (await findTeamByParticipant(stateRoot, 'sess-member'))?.id === team.id)
  check('findTeamByParticipant rejects a removed member', await findTeamByParticipant(stateRoot, 'sess-removed') === undefined)

  const escapedContent = String.raw`save to notes\foo.md`
  const message = createMessage('alice', CAPTAIN_KEY, escapedContent)
  await withTeamLock(team.id, async () => {
    await appendMailbox(stateRoot, team.id, CAPTAIN_KEY, message)
  })
  const second = createMessage('bob', CAPTAIN_KEY, 'valid after BOM')
  const mailboxFile = join(stateRoot, team.id, 'inbox', `${CAPTAIN_KEY}.jsonl`)
  await writeFile(
    mailboxFile,
    `\uFEFF${JSON.stringify(second)}\n${String.raw`{"broken":"notes\q.md"}`}\n{}\n`,
    { encoding: 'utf8', flag: 'a' },
  )
  const malformedLines = []
  const inbox = await readMailbox(
    stateRoot,
    team.id,
    CAPTAIN_KEY,
    (lineNumber) => malformedLines.push(lineNumber),
  )
  check('mailbox append/read preserves backslashes', inbox[0]?.content === escapedContent)
  check('mailbox accepts BOM-prefixed JSONL records', inbox[1]?.content === second.content)
  check('mailbox skips malformed JSON and malformed shapes', inbox.length === 2 && malformedLines.join(',') === '3,4')
  check('missing mailbox reads empty', (await readMailbox(stateRoot, team.id, 'nobody')).length === 0)

  const duplicateCaptain = { ...team, id: 'duplicate-captain', members: [] }
  await createTeamDir(stateRoot, duplicateCaptain)
  let duplicateCaptainRejected = false
  try {
    await findTeamByCaptain(stateRoot, 'sess-captain')
  } catch {
    duplicateCaptainRejected = true
  }
  check('multiple teams for one captain fail as ambiguous', duplicateCaptainRejected)
  await removeTeamDir(stateRoot, duplicateCaptain.id)

  const duplicateMember = { ...team, id: 'duplicate-member', captainSessionId: 'sess-other-captain' }
  await createTeamDir(stateRoot, duplicateMember)
  let duplicateMemberRejected = false
  try {
    await findTeamByParticipant(stateRoot, 'sess-member')
  } catch {
    duplicateMemberRejected = true
  }
  check('multiple teams for one member fail as ambiguous', duplicateMemberRejected)
  await removeTeamDir(stateRoot, duplicateMember.id)

  const invalidId = 'invalid-shape'
  await mkdir(join(stateRoot, invalidId), { recursive: true })
  await writeFile(join(stateRoot, invalidId, 'team.json'), '{}', 'utf8')
  let invalidShapeRejected = false
  try {
    await readTeam(stateRoot, invalidId)
  } catch {
    invalidShapeRejected = true
  }
  check('invalid team.json shape is rejected at the durable boundary', invalidShapeRejected)
  await removeTeamDir(stateRoot, invalidId)

  await removeTeamDir(stateRoot, team.id)
  check('removeTeamDir removes the team', await readTeam(stateRoot, team.id) === undefined)

  // Archive keeps the team data for post-delete review.
  const archiveTeam = { ...team, id: sanitizeKey('Archive Team') }
  await createTeamDir(stateRoot, archiveTeam)
  const { archiveTeamDir, readArchivedTeam, listArchivedTeamIds } = await import('../lib/state.js')
  await archiveTeamDir(stateRoot, archiveTeam.id)
  check('archive moves the team out of live scan', await readTeam(stateRoot, archiveTeam.id) === undefined)
  check('archive keeps team.json readable', (await readArchivedTeam(stateRoot, archiveTeam.id))?.id === archiveTeam.id)
  check('archive lists the team id', (await listArchivedTeamIds(stateRoot)).includes(archiveTeam.id))
  check('archive dir skips live readTeam', await readTeam(stateRoot, 'archive') === undefined)
} finally {
  await rm(stateRoot, { recursive: true, force: true })
}

console.log('5/8 host visual-state functions (activity panel)')
const { taskVisualState, taskDepthsById } = await import('../lib/state.js')
const vtasks = [
  { id: 't1', subject: 'a', status: 'completed', assignee: 'alice', dependencies: [], createdAt: 0, updatedAt: 0 },
  { id: 't2', subject: 'b', status: 'pending', assignee: 'bob', dependencies: ['t1'], createdAt: 0, updatedAt: 0 },
  { id: 't3', subject: 'c', status: 'in_progress', assignee: 'bob', dependencies: ['t2'], createdAt: 0, updatedAt: 0 },
  { id: 't4', subject: 'd', status: 'pending', assignee: 'alice', dependencies: ['t9'], createdAt: 0, updatedAt: 0 },
]
check('completed -> completed visual state', taskVisualState('completed', [], vtasks) === 'completed')
check('failed -> failed visual state', taskVisualState('failed', [], vtasks) === 'failed')
check('cancelled -> cancelled visual state', taskVisualState('cancelled', [], vtasks) === 'cancelled')
check('in_progress -> running visual state', taskVisualState('in_progress', [], vtasks) === 'running')
check('pending with completed dep -> open', taskVisualState('pending', ['t1'], vtasks) === 'open')
check('pending with open dep -> blocked', taskVisualState('pending', ['t2'], vtasks) === 'blocked')
check('missing dependency is ignored (not blocked)', taskVisualState('pending', ['t9'], vtasks) === 'open')
const depths = taskDepthsById(vtasks)
check('t1 depth 0', depths.get('t1') === 0)
check('t2 depth 1 (longest path)', depths.get('t2') === 1)
check('t3 depth 2', depths.get('t3') === 2)
check('missing dep contributes no depth', depths.get('t4') === 0)

console.log('6/8 client relationship projections')
const projectionTasks = [
  { id: 't4', dependencies: ['t2'], depth: 2 },
  { id: 't1', dependencies: [], depth: 0 },
  { id: 't3', dependencies: ['t1'], depth: 1 },
  { id: 't2', dependencies: ['t1'], depth: 1 },
  { id: 't5', dependencies: [], depth: Number.NaN },
]
const stages = taskStages(projectionTasks)
check('task stages sort by depth', stages.map(stage => stage.depth).join(',') === '0,1,2')
check('task stages sort ids naturally', stages[1]?.tasks.map(task => task.id).join(',') === 't2,t3')
check('non-finite depth falls back to stage 0', stages[0]?.tasks.some(task => task.id === 't5') === true)
const chain = relatedTaskIds('t2', projectionTasks)
check('relationship chain includes upstream dependency', chain.has('t1'))
check('relationship chain includes focused task', chain.has('t2'))
check('relationship chain includes downstream dependent', chain.has('t4'))
check('relationship chain excludes sibling branch', !chain.has('t3'))
check(
  'pinned dependency chain wins over keyboard and hover previews',
  dependencyFocusTaskId('pinned', 'keyboard', 'hover') === 'pinned',
)
check(
  'keyboard dependency chain wins over delayed hover preview',
  dependencyFocusTaskId(null, 'keyboard', 'hover') === 'keyboard',
)
check(
  'hover dependency chain is used without a pinned or keyboard task',
  dependencyFocusTaskId(null, null, 'hover') === 'hover',
)
const cyclic = [
  { id: 'a', dependencies: ['b'], depth: 0 },
  { id: 'b', dependencies: ['a'], depth: 1 },
]
check('relationship traversal is cycle-safe', relatedTaskIds('a', cyclic).size === 2)
check('edge-free tasks switch to the fill-width parallel grid', usesParallelTaskGrid([
  { id: 't1', dependencies: [], depth: 0 },
  { id: 't2', dependencies: [], depth: 0 },
  { id: 't3', dependencies: ['missing'], depth: 0 },
]))
const liveTeam = {
  captainSessionId: 'captain-1',
  members: [{ name: 'analyst', status: 'working', activity: 'working', currentTask: 't1' }],
  tasks: [{ id: 't1', subject: 'Clarify requirements', status: 'in_progress' }],
}
check('live captain team is selected only for the current session', liveCaptainTeam([liveTeam], 'captain-1') === liveTeam)
check('halted captain team is hidden from the composer banner', liveCaptainTeam([{ ...liveTeam, halted: true }], 'captain-1') === undefined)
check('active team with working members stays visible', teamIsActive(liveTeam) === true)
check('planning roster with no tasks still shows the banner', teamIsActive({
  members: [{ name: 'analyst', status: 'idle', activity: 'idle' }],
  tasks: [],
}) === true)
check('halted team is not active', teamIsActive({ ...liveTeam, halted: true }) === false)
check('staged team is not presented as actively executing', teamIsActive({ ...liveTeam, phase: 'staged' }) === false)
check('settled failed/completed team is not waiting to be scheduled', teamIsActive({
  members: [{ name: 'analyst', status: 'idle', activity: 'idle' }],
  tasks: [
    { id: 't1', status: 'completed' },
    { id: 't2', status: 'failed' },
  ],
}) === false)
check('progress summary prefers running task titles', teamProgressSummary(liveTeam, '、').detail === 'Clarify requirements')
check('a real dependency keeps the layered DAG layout', !usesParallelTaskGrid([
  { id: 't1', dependencies: [], depth: 0 },
  { id: 't2', dependencies: ['t1'], depth: 1 },
]))
const dag = compactDagLayout(projectionTasks.filter(task => Number.isFinite(task.depth)))
check('compact DAG lays dependency depths out left-to-right',
  dag.nodes.find(node => node.task.id === 't1')?.x === 0
    && dag.nodes.find(node => node.task.id === 't2')?.x === 118
    && dag.nodes.find(node => node.task.id === 't4')?.x === 236)
check('compact DAG keeps stable rows and reference node geometry',
  dag.nodes.find(node => node.task.id === 't3')?.y === 38
    && dag.width === 328
    && dag.height === 68
    && COMPACT_DAG_NODE_WIDTH === 92
    && COMPACT_DAG_NODE_HEIGHT === 30)
check('compact DAG emits one curved SVG edge per valid dependency',
  dag.edges.length === 3
    && dag.edges.some(edge => edge.from === 't1' && edge.to === 't2' && edge.path.startsWith('M92 15C')))
check(
  'task model labels prefer the snapshot field and fall back to the assignee route',
  memberRouteLabel({ provider: 'openai', model: 'gpt-5.6-sol' }) === 'openai/gpt-5.6-sol'
    && memberRouteLabel({ model: 'grok-4.6' }) === 'grok-4.6'
    && compactModelLabel('openai/gpt-5.6-sol') === 'gpt-5.6-sol'
    && taskModelLabel({ assignee: 'analyst', model: 'openai/gpt-5.6-sol' }, []) === 'openai/gpt-5.6-sol'
    && taskModelLabel({ assignee: 'analyst' }, [{ name: 'analyst', provider: 'grok', model: 'grok-4.5' }]) === 'grok/grok-4.5'
    && taskModelLabel({ assignee: 'analyst' }, []) === '',
)
const panelBounds = { width: 1440, height: 900, anchorRight: 1440 }
const dockedPanel = resolvePanelGeometry(DEFAULT_PANEL_LAYOUT, panelBounds)
check('docked panel follows the shell anchor and retains an available-height ceiling',
  dockedPanel.mode === 'docked'
    && dockedPanel.x === 1034
    && dockedPanel.y === 64
    && dockedPanel.width === 388
    && dockedPanel.height === 788
    && dockedPanel.heightMode === 'auto'
    && panelUsesAutoHeight(dockedPanel, panelBounds)
    && panelMaximumHeight(dockedPanel, panelBounds) === 788)
const floatingPanel = floatPanelLayout(dockedPanel, panelBounds)
const movedPanel = movePanelLayout(floatingPanel, 999, 999, panelBounds)
check('floating panel movement clamps every edge inside the shell',
  movedPanel.mode === 'floating' && movedPanel.x === 1040 && movedPanel.y === 100)
const widerDockedPanel = resizePanelLayout(dockedPanel, 'left', -120, 0, panelBounds)
check('docked left-edge resize preserves the right anchor',
  widerDockedPanel.width === 508 && widerDockedPanel.x === 914)
const narrowerFloatingPanel = resizePanelLayout(floatingPanel, 'left', 200, 0, panelBounds)
check('floating left-edge resize preserves the opposite edge at minimum width',
  narrowerFloatingPanel.width === 320 && narrowerFloatingPanel.x === 1102)
const cornerPanel = resizePanelLayout({ ...floatingPanel, x: 400, y: 200, width: 388, height: 500 }, 'corner', 1200, 1200, panelBounds)
check('floating corner resize preserves its top-left anchor at shell limits',
  cornerPanel.x === 400 && cornerPanel.y === 200
    && cornerPanel.width === 640 && cornerPanel.height === 688
    && cornerPanel.heightMode === 'manual'
    && !panelUsesAutoHeight(cornerPanel, panelBounds))
const bottomPanel = resizePanelLayout({ ...floatingPanel, x: 400, y: 200, width: 388, height: 500 }, 'bottom', 0, 1200, panelBounds)
check('floating bottom resize preserves its top edge at the shell limit',
  bottomPanel.y === 200 && bottomPanel.height === 688
    && bottomPanel.heightMode === 'manual')
const redockedPanel = dockPanelLayout({ ...floatingPanel, width: 472, x: 120, y: 100, heightMode: 'manual' }, panelBounds)
check('dock toggle preserves width while restoring shell alignment and content-fit height',
  redockedPanel.x === 950 && redockedPanel.width === 472 && redockedPanel.heightMode === 'auto')
const compactBounds = { width: 900, height: 700, anchorRight: 900 }
const compactPanel = resolvePanelGeometry(floatingPanel, compactBounds)
check('compact shell disables free geometry and uses a balanced inset',
  compactPanelForBounds(compactBounds)
    && compactPanel.x === 12 && compactPanel.y === 12
    && compactPanel.width === 876 && compactPanel.height === 676
    && panelUsesAutoHeight({ ...compactPanel, heightMode: 'manual' }, compactBounds)
    && panelMaximumHeight(compactPanel, compactBounds) === 676)
check('persisted panel state rejects corrupt or partial values',
  parsePanelLayout('{"mode":"floating","x":1}').mode === 'docked'
    && parsePanelLayout('not-json').mode === 'docked')
const migratedPanel = parsePanelLayout('{"mode":"floating","x":120,"y":80,"width":420,"height":600}')
const manualPanel = parsePanelLayout('{"mode":"floating","x":120,"y":80,"width":420,"height":600,"heightMode":"manual"}')
const legacyDockedManualPanel = parsePanelLayout('{"mode":"docked","x":120,"y":80,"width":420,"height":600,"heightMode":"manual"}')
check('persisted panel height migrates to auto but preserves explicit manual sizing',
  migratedPanel.heightMode === 'auto'
    && panelUsesAutoHeight(migratedPanel, panelBounds)
    && manualPanel.heightMode === 'manual'
    && !panelUsesAutoHeight(manualPanel, panelBounds)
    && legacyDockedManualPanel.heightMode === 'auto')
check(
  'expanded activity panel belongs only to its current session',
  activityPanelExpandedForSession(true, 'session-a', 'session-a')
    && !activityPanelExpandedForSession(true, 'session-a', 'session-b')
    && !activityPanelExpandedForSession(true, 'session-a', undefined),
)
check(
  'restored live activity stays collapsed when a conversation is reopened',
  !activityPanelShouldAutoExpand({
    alreadyAutoOpened: false,
    pageSettled: true,
    restoreComplete: true,
    previousLiveTeamIds: new Set(['restored-team']),
    currentLiveTeamIds: ['restored-team'],
  }),
)
check(
  'archived-only conversation restore never auto-expands the activity panel',
  !activityPanelShouldAutoExpand({
    alreadyAutoOpened: false,
    pageSettled: true,
    restoreComplete: true,
    previousLiveTeamIds: new Set(),
    currentLiveTeamIds: [],
  }),
)
check(
  'a new live team appearing after restore still auto-expands once',
  activityPanelShouldAutoExpand({
    alreadyAutoOpened: false,
    pageSettled: true,
    restoreComplete: true,
    previousLiveTeamIds: new Set(),
    currentLiveTeamIds: ['new-team'],
  }) && !activityPanelShouldAutoExpand({
    alreadyAutoOpened: true,
    pageSettled: true,
    restoreComplete: true,
    previousLiveTeamIds: new Set(),
    currentLiveTeamIds: ['new-team'],
  }),
)
let monitorNotifications = 0
const unsubscribeMonitor = subscribeActivityMonitorTargets(() => { monitorNotifications += 1 })
const releaseMonitorOne = monitorAgentTeam('verify-session', 'verify-team')
const releaseMonitorTwo = monitorAgentTeam('verify-session', 'verify-team')
const registeredMonitor = getActivityMonitorTargetsSnapshot()[0]
check(
  'activity monitor coalesces duplicate cards into one shared target',
  getActivityMonitorTargetsSnapshot().length === 1
    && registeredMonitor?.sessionId === 'verify-session'
    && registeredMonitor.teamId === 'verify-team',
)
releaseMonitorOne()
check('one card cleanup keeps another card monitoring', getActivityMonitorTargetsSnapshot().length === 1)
releaseMonitorTwo()
check('target cleanup is controlled by card ownership', getActivityMonitorTargetsSnapshot().length === 0)
unsubscribeMonitor()
check('activity monitor publishes lifecycle changes without duplicate-card churn', monitorNotifications === 2)

let dormantFetches = 0
let dormantSchedules = 0
const dormantPoller = startActivityPolling([], {
  fetchState: async () => {
    dormantFetches += 1
    return { ok: true, json: async () => ({ teams: [] }) }
  },
  schedule: () => {
    dormantSchedules += 1
    return 0
  },
})
await dormantPoller.firstTick
dormantPoller.stop()
check(
  'no monitor targets create no request and no timer',
  dormantFetches === 0 && dormantSchedules === 0,
)

const discoveryUrls = []
const discoveryIntervals = []
let scheduledDiscoveryTick
const discoveryPoller = startActivityPolling([], {
  discoverySessionId: 'cold-captain',
  fetchState: async (url) => {
    discoveryUrls.push(url)
    return { ok: true, json: async () => ({ teams: [] }) }
  },
  schedule: (callback, intervalMs) => {
    scheduledDiscoveryTick = callback
    discoveryIntervals.push(intervalMs)
    return 'discovery-timer'
  },
  cancel: () => {},
  publishSnapshots: () => {},
})
await discoveryPoller.firstTick
scheduledDiscoveryTick?.()
await new Promise((resolve) => setImmediate(resolve))
discoveryPoller.stop()
check(
  'a cardless cold session restores live and archive once, then probes at the discovery cadence',
  discoveryUrls.length === 3
    && discoveryUrls[0] === '/plugins/dsh-agent-teams/state'
    && discoveryUrls[1]?.endsWith('?archived=1')
    && discoveryUrls[2] === '/plugins/dsh-agent-teams/state'
    && discoveryIntervals.length === 1
    && discoveryIntervals[0] === ACTIVITY_PROBE_MS,
)

// Regression (GitHub #57): a team created AFTER the cold-start discovery pass
// (e.g. a run_code-wrapped agent_teams_create) must be discovered without a
// manual reload. The controller keeps probing while its discovery session owns
// no team yet, so a later team is published — and once found, the probe
// upgrades to the live cadence so the panel stays fresh.
const latePublished = []
const lateUrls = []
const lateIntervals = []
let lateLiveTeams = []
let lateTick = () => {}
const latePoller = startActivityPolling([], {
  discoverySessionId: 'cold-captain',
  fetchState: async (url) => {
    lateUrls.push(url)
    if (url === '/plugins/dsh-agent-teams/state') {
      return { ok: true, json: async () => ({ teams: lateLiveTeams }) }
    }
    return { ok: true, json: async () => ({ teams: [] }) }
  },
  schedule: (callback, intervalMs) => {
    lateTick = callback
    lateIntervals.push(intervalMs)
    return 'late-timer'
  },
  cancel: () => {},
  publishSnapshots: (update) => { latePublished.push(update) },
})
await latePoller.firstTick
lateTick()
await new Promise((resolve) => setImmediate(resolve))
check(
  'a cardless session keeps probing at the discovery cadence after an empty first pass',
  lateUrls.length === 3
    && lateIntervals.length === 1
    && lateIntervals[0] === ACTIVITY_PROBE_MS,
)
lateLiveTeams = [{
  workspace: '',
  teamId: 'post-discovery-team',
  name: 'Post Discovery Team',
  captainSessionId: 'cold-captain',
  members: [],
  tasks: [],
  messageCount: 0,
  captainInbox: [],
}]
lateTick()
await new Promise((resolve) => setImmediate(resolve))
latePoller.stop()
check(
  'a team created after the discovery pass is picked up without a reload and upgrades to the live cadence',
  lateUrls.length === 4
    && latePublished.some((update) => update.teams?.some((team) => team.teamId === 'post-discovery-team'))
    && lateIntervals.length === 2
    && lateIntervals[1] === ACTIVITY_POLL_MS,
)

// Explicit card targets are demanded work: they start at the live cadence and
// are never downgraded to the low-frequency probe.
const cardIntervals = []
const cardPoller = startActivityPolling([{
  key: 'card-target',
  sessionId: 'card-session',
  teamId: 'card-team',
}], {
  fetchState: async () => ({ ok: true, json: async () => ({ teams: [] }) }),
  schedule: (_callback, intervalMs) => {
    cardIntervals.push(intervalMs)
    return 'card-timer'
  },
  cancel: () => {},
  publishSnapshots: () => {},
})
await cardPoller.firstTick
cardPoller.stop()
check(
  'explicit card targets poll at the live cadence from the start',
  cardIntervals.length === 1 && cardIntervals[0] === ACTIVITY_POLL_MS,
)

const pollTarget = { key: 'poll-target', sessionId: 'poll-session', teamId: 'poll-team' }
let resolveSlowLive
const slowLive = new Promise((resolve) => { resolveSlowLive = resolve })
const slowFetchSignals = []
let slowFetchCount = 0
let scheduledTick
let cancelledTimer = false
let latePublications = 0
const slowPoller = startActivityPolling([pollTarget], {
  fetchState: async (_url, init) => {
    slowFetchCount += 1
    slowFetchSignals.push(init.signal)
    return slowLive
  },
  schedule: (callback) => {
    scheduledTick = callback
    return 'slow-timer'
  },
  cancel: (timer) => { cancelledTimer = timer === 'slow-timer' },
  publishSnapshots: () => { latePublications += 1 },
})
scheduledTick?.()
scheduledTick?.()
await Promise.resolve()
check('a slow state request never overlaps the next interval', slowFetchCount === 1)
slowPoller.stop()
check(
  'stopping activity polling clears its timer and aborts the in-flight request',
  cancelledTimer && slowFetchSignals[0]?.aborted === true,
)
resolveSlowLive?.({ ok: true, json: async () => ({ teams: [] }) })
await slowPoller.firstTick
check('a late response after stop cannot publish snapshots', latePublications === 0)

const fallbackUrls = []
let fallbackResponseIndex = 0
const fallbackResponses = [
  { ok: true, json: async () => ({ teams: [] }) },
  { ok: true, json: async () => ({ teams: [] }) },
]
const fallbackPoller = startActivityPolling([pollTarget], {
  fetchState: async (url) => {
    fallbackUrls.push(url)
    return fallbackResponses[fallbackResponseIndex++]
  },
  schedule: () => 'fallback-timer',
  cancel: () => {},
  publishSnapshots: () => {},
})
await fallbackPoller.firstTick
fallbackPoller.stop()
check(
  'a live miss refreshes archive without retiring the mounted card target',
  fallbackUrls.length === 2
    && fallbackUrls[1]?.endsWith('?archived=1'),
)
const navigationCalls = []
const addressedNavigation = await openAgentTeamMember({
  open: (id) => { navigationCalls.push(['open', id]) },
  refreshSubagents: async (id) => { navigationCalls.push(['refresh', id]) },
  subagentAddress: () => undefined,
  openSubagent: (address) => { navigationCalls.push(['openSubagent', address]) },
}, 'captain-session', 'member-session')
check(
  'rc.8 member navigation refreshes the parent catalog and opens an addressed continuable child',
  addressedNavigation === 'subagent'
    && navigationCalls[0]?.[0] === 'refresh'
    && navigationCalls[1]?.[0] === 'openSubagent'
    && navigationCalls[1]?.[1]?.parentSessionId === 'captain-session'
    && navigationCalls[1]?.[1]?.childSessionId === 'member-session'
    && navigationCalls[1]?.[1]?.mode === 'continuable',
)
let retainedOneShotOpenCalls = 0
const retainedOneShot = await openAgentTeamMember({
  refreshSubagents: async () => {},
  subagentAddress: () => ({
    parentSessionId: 'captain-session',
    childSessionId: 'member-session',
    mode: 'one-shot',
  }),
  openSubagent: () => { retainedOneShotOpenCalls += 1 },
}, 'captain-session', 'member-session')
const mismatchedRetainedOneShot = await openAgentTeamMember({
  refreshSubagents: async () => {},
  subagentAddress: () => ({
    parentSessionId: 'different-captain',
    childSessionId: 'member-session',
    mode: 'one-shot',
  }),
  openSubagent: () => { retainedOneShotOpenCalls += 1 },
}, 'captain-session', 'member-session')
check(
  'retained one-shot member navigation is rejected without opening',
  retainedOneShot === undefined
    && mismatchedRetainedOneShot === undefined
    && retainedOneShotOpenCalls === 0,
)
const legacyNavigationCalls = []
const legacyNavigation = await openAgentTeamMember({
  open: (id) => { legacyNavigationCalls.push(id) },
}, 'captain-session', 'member-session')
check(
  'missing addressed member navigation does not open another session',
  legacyNavigation === undefined && legacyNavigationCalls.length === 0,
)
check(
  'agent team cards derive a stable id from the standard create tool call',
  JSON.stringify(parseAgentTeamsCreateArgs('{"name":" Repo Review 2W! "}'))
    === JSON.stringify({ teamId: 'repo-review-2w', name: 'Repo Review 2W!' }),
)
check('malformed create tool arguments do not create a card', parseAgentTeamsCreateArgs('{bad') === undefined)

const captainDeliveries = []
const captainSteered = steerCaptainReport(
  { steer: message => captainDeliveries.push(message) },
  'alice',
  'finished t1',
)
check(
  'member report delivery calls the live captain steer API',
  captainSteered
    && captainDeliveries.length === 1
    && captainDeliveries[0]?.content[0]?.type === 'text'
    && captainDeliveries[0]?.content[0]?.text === 'AgentTeams message from member alice:\n\nfinished t1',
)
check(
  'failed live captain delivery falls back to the durable mailbox',
  steerCaptainReport({ steer: () => { throw new Error('offline') } }, 'alice', 'finished t1') === false,
)

console.log('7/8 member model selection and continuation restore')
const rolePolicyCaptain = {
  id: 'role-policy-captain',
  options: { provider: 'birth-provider', model: 'birth-model' },
  session: {
    requestHeader: () => ({
      config: {
        provider: 'cpa',
        model: 'cheap-captain',
        reasoningEffort: 'high',
      },
    }),
  },
}
const rolePolicyCalls = []
const rolePolicyContext = {
  llm: {
    resolveCallConfig: async (config) => {
      rolePolicyCalls.push(config)
      return config
    },
  },
}
const rolePolicyMembers = [
  { provider: undefined, model: undefined, reasoningMode: 'target-default' },
  { provider: 'opencode-go', model: 'review-model', reasoningMode: 'explicit', reasoningEffort: 'max' },
]
const rolePolicySelections = await Promise.all(rolePolicyMembers.map((role) => (
  resolveMemberLlmSelection(rolePolicyContext, rolePolicyCaptain, role)
    .catch(() => undefined)
)))
check(
  'mixed-provider role policy resolves without global settings and preserves exact call inputs',
  rolePolicySelections[0]?.provider === 'cpa'
    && rolePolicySelections[0]?.model === 'cheap-captain'
    && rolePolicySelections[0]?.reasoningEffort === undefined
    && rolePolicySelections[1]?.provider === 'opencode-go'
    && rolePolicySelections[1]?.model === 'review-model'
    && rolePolicySelections[1]?.reasoningEffort === 'max'
    && rolePolicyCalls.length === 2
    && rolePolicyCalls[0]?.provider === 'cpa'
    && rolePolicyCalls[0]?.model === 'cheap-captain'
    && rolePolicyCalls[0]?.reasoningEffort === undefined
    && rolePolicyCalls[1]?.provider === 'opencode-go'
    && rolePolicyCalls[1]?.model === 'review-model'
    && rolePolicyCalls[1]?.reasoningEffort === 'max',
)

const captain = {
  id: 'captain-session',
  options: { provider: 'birth-provider', model: 'birth-model' },
  session: {
    requestHeader: () => ({
      config: {
        provider: 'captain-provider',
        model: 'captain-model',
        reasoningEffort: 'max',
      },
    }),
  },
}
const resolvedCalls = []
const routeDefaultEfforts = new Map([
  ['captain-provider/captain-model', 'high'],
  ['captain-provider/configured-member-model', 'medium'],
  ['other-provider/other-model', 'low'],
])
const selectionContext = {
  llm: {
    listProviders: () => [
      { id: 'captain-provider' },
      { id: 'other-provider' },
    ],
    resolveCallConfig: async (config) => {
      resolvedCalls.push(config)
      if (config.provider === 'guessed-provider') {
        throw new Error('no adapter registered for provider "guessed-provider"')
      }
      const route = `${config.provider}/${config.model}`
      if (route !== 'captain-provider/captain-model' && config.reasoningEffort === 'max') {
        const error = new Error(`provider/model route ${route} does not support reasoning effort "max"`)
        error.code = 'UNSUPPORTED_REASONING_EFFORT'
        throw error
      }
      const defaultEffort = routeDefaultEfforts.get(route)
      return config.reasoningEffort !== undefined || defaultEffort === undefined
        ? config
        : { ...config, reasoningEffort: defaultEffort }
    },
  },
}
const inheritedSelection = await resolveMemberLlmSelection(selectionContext, captain, { reasoningMode: 'route-aware' })
check(
  'ordinary member snapshots the captain current route and effort',
  inheritedSelection.provider === 'captain-provider'
    && inheritedSelection.model === 'captain-model'
    && inheritedSelection.reasoningEffort === 'max',
)
const schemaDefaultSelection = await resolveMemberLlmSelection(selectionContext, captain, { reasoningMode: 'target-default' })
const whitespaceSchemaDefaultSelection = await resolveMemberLlmSelection(selectionContext, captain, { reasoningMode: 'target-default' })
check(
  'target-default uses the captain route without sending an effort',
  schemaDefaultSelection.provider === 'captain-provider'
    && schemaDefaultSelection.model === 'captain-model'
    && schemaDefaultSelection.reasoningEffort === 'high'
    && whitespaceSchemaDefaultSelection.provider === 'captain-provider'
    && whitespaceSchemaDefaultSelection.model === 'captain-model'
    && whitespaceSchemaDefaultSelection.reasoningEffort === 'high'
    && resolvedCalls.at(-1)?.reasoningEffort === undefined,
)
const overriddenSelection = await resolveMemberLlmSelection(selectionContext, captain, {
  provider: 'other-provider',
  model: 'other-model',
  reasoningMode: 'route-aware',
})
check(
  'cross-provider route uses the target model default instead of captain effort',
  overriddenSelection.provider === 'other-provider'
    && overriddenSelection.model === 'other-model'
    && overriddenSelection.reasoningEffort === 'low'
    && resolvedCalls.at(-1)?.reasoningEffort === undefined,
)
const explicitEffortSelection = await resolveMemberLlmSelection(selectionContext, captain, {
  provider: 'other-provider',
  model: 'other-model',
  reasoningMode: 'explicit',
  reasoningEffort: 'high',
})
check(
  'explicit member effort overrides cross-provider target default',
  explicitEffortSelection.reasoningEffort === 'high'
    && resolvedCalls.at(-1)?.reasoningEffort === 'high',
)
let invalidRouteMessage = ''
try {
  await resolveMemberLlmSelection(selectionContext, captain, {
    provider: 'guessed-provider',
    model: 'guessed-model',
    reasoningMode: 'target-default',
  })
} catch (error) {
  invalidRouteMessage = error instanceof Error ? error.message : String(error)
}
check(
  'invalid heterogeneous route explains valid providers and captain-route inheritance',
  invalidRouteMessage.includes('Valid providers: captain-provider, other-provider')
    && invalidRouteMessage.includes('Omit provider/model to use the captain route'),
  invalidRouteMessage,
)
let providerWithoutModelRejected = false
try {
  await resolveMemberLlmSelection(selectionContext, captain, { provider: 'other-provider', reasoningMode: 'target-default' })
} catch {
  providerWithoutModelRejected = true
}
check('explicit provider without model is rejected', providerWithoutModelRejected)
let incompleteExplicitRejected = false
try {
  await resolveMemberLlmSelection(selectionContext, captain, {
    provider: 'other-provider', model: 'other-model', reasoningMode: 'explicit',
  })
} catch {
  incompleteExplicitRejected = true
}
check('incomplete explicit role policy is rejected before model resolution', incompleteExplicitRejected)

let catalogCalls = 0
await validateMemberLlmSelections({
  llm: {
    async listModels(provider) {
      catalogCalls += 1
      return [{ provider, id: 'known-model', name: 'Known model' }]
    },
  },
}, [
  { provider: 'known-provider', model: 'known-model' },
  { provider: 'known-provider', model: 'known-model' },
])
check('approval model preflight caches one catalog lookup per provider', catalogCalls === 1)
let unknownCatalogModelRejected = false
try {
  await validateMemberLlmSelections({
    llm: {
      async listModels(provider) {
        return [{ provider, id: 'known-model', name: 'Known model' }]
      },
    },
  }, [{ provider: 'known-provider', model: 'typo-model' }])
} catch (error) {
  unknownCatalogModelRejected = /unknown member model.*typo-model/i.test(String(error?.message ?? error))
}
check('approval model preflight rejects an unlisted typo before spawn', unknownCatalogModelRejected)

let startSpec
const spawnMemberRecord = {
  id: '',
  name: 'backend',
  role: 'engineer',
  provider: overriddenSelection.provider,
  model: overriddenSelection.model,
  reasoningEffort: overriddenSelection.reasoningEffort,
  joinedAt: Date.now(),
  status: 'idle',
}
const spawnTeam = {
  name: 'Spawn Verify',
  id: 'spawn-verify',
  captainSessionId: captain.id,
  createdAt: Date.now(),
  members: [],
  tasks: [],
  taskSeq: 0,
}
await spawnMember(
  {
    subagents: {
      getProvider: () => ({
        prepareContinuable: () => undefined,
        capabilities: { persona: true, toolFilter: true },
      }),
      list: () => ['spawn'],
      startContinuable: async (spec) => {
        startSpec = spec
        return { childId: 'spawned-member', messageId: 'welcome-message' }
      },
    },
  },
  { provider: 'spawn', maxDepth: 1 },
  {
    withPending: async (_parentId, _label, _selection, operation) => operation(),
  },
  overriddenSelection,
  captain,
  spawnTeam,
  spawnMemberRecord,
  '.agent-teams',
  new AbortController().signal,
)
check(
  '#20: spawn receives the resolved per-member provider and model',
  startSpec?.request?.agentOptions?.provider === 'other-provider'
    && startSpec?.request?.agentOptions?.model === 'other-model'
    && spawnMemberRecord.id === 'spawned-member',
)

function descriptorEvent(label, agentProvider = 'descriptor-provider', agentModel = 'descriptor-model') {
  return {
    type: 'subagent/descriptor',
    data: snapshotSubagentDescriptor({
      mode: 'continuable',
      provider: 'spawn',
      label,
      agentProvider,
      agentModel,
    }),
  }
}

function fakeChildContext({ label, parentSessionId, cwd, agentProvider, agentModel }) {
  const listeners = new Map()
  return {
    listeners,
    context: {
      agent: {
        session: {
          header: { parentSession: parentSessionId, cwd, seedLength: 0 },
          events: [descriptorEvent(label, agentProvider, agentModel)],
        },
      },
      on(name, listener) {
        listeners.set(name, listener)
        return () => listeners.delete(name)
      },
    },
  }
}

async function routedConfig(child, fallback = {
  provider: 'unselected-provider',
  model: 'unselected-model',
  reasoningEffort: 'low',
}) {
  const assemble = child.listeners.get('system-prompt/assemble')
  const request = child.listeners.get('agent/request')
  await assemble({}, {}, async () => ({ variables: {} }))
  return request({}, async () => fallback)
}

let setupMemberSelection
const selectionRuntime = installMemberSelectionRuntime({
  subagents: {
    registerContinuableSetup: (setup) => {
      setupMemberSelection = setup
      return () => undefined
    },
  },
}, '.agent-teams')
const freshChild = fakeChildContext({
  label: 'agent-teams:fresh-team:backend',
  parentSessionId: 'captain-session',
  cwd: process.cwd(),
})
let disposeFresh
await selectionRuntime.withPending(
  'captain-session',
  'agent-teams:fresh-team:backend',
  overriddenSelection,
  async () => {
    disposeFresh = setupMemberSelection(freshChild.context)
  },
)
const freshRoute = await routedConfig(freshChild)
check(
  'fresh child request receives the resolved reasoning effort',
  freshRoute.provider === 'other-provider'
    && freshRoute.model === 'other-model'
    && freshRoute.reasoningEffort === 'low',
)
disposeFresh()

const restoreWorkspace = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-selection-'))
try {
  const restoreStateRoot = join(restoreWorkspace, '.agent-teams')
  const alphaSnapshot = {
    provider: 'provider-a',
    model: 'model-a',
    reasoningMode: 'explicit',
    reasoningEffort: 'effort-a',
  }
  await createTeamDir(restoreStateRoot, {
    schemaVersion: 2,
    name: 'Restore Team',
    id: 'restore-team',
    captainSessionId: 'captain-session',
    createdAt: Date.now(),
    members: [{
      id: 'cold-member',
      name: 'alpha',
      ...alphaSnapshot,
      joinedAt: Date.now(),
      status: 'idle',
    }],
    tasks: [],
    taskSeq: 0,
    ...automaticRunningProvenance('restore-team'),
    phase: 'running',
  })
  const updatedSettingsFallback = {
    provider: 'provider-b',
    model: 'model-b',
    reasoningEffort: 'effort-b',
  }
  const coldChild = fakeChildContext({
    label: 'agent-teams:restore-team:alpha',
    parentSessionId: 'captain-session',
    cwd: restoreWorkspace,
    agentProvider: alphaSnapshot.provider,
    agentModel: alphaSnapshot.model,
  })
  const disposeCold = setupMemberSelection(coldChild.context)
  const coldRoute = await routedConfig(coldChild, updatedSettingsFallback)
  check(
    'cold-resumed alpha keeps its persisted route instead of updated settings',
    coldRoute.provider === alphaSnapshot.provider
      && coldRoute.model === alphaSnapshot.model
      && coldRoute.reasoningEffort === alphaSnapshot.reasoningEffort
      && coldRoute.provider !== updatedSettingsFallback.provider
      && coldRoute.model !== updatedSettingsFallback.model
      && coldRoute.reasoningEffort !== updatedSettingsFallback.reasoningEffort,
  )
  disposeCold()

  const validMaterializedColdPolicies = [
    { label: 'target-default materialized default effort', reasoningMode: 'target-default', reasoningEffort: 'default-effort' },
    { label: 'route-aware same-route inherited effort', reasoningMode: 'route-aware', reasoningEffort: 'inherited-effort' },
  ]
  for (const [index, policy] of validMaterializedColdPolicies.entries()) {
    const teamId = `valid-cold-${index}`
    await createTeamDir(restoreStateRoot, {
      schemaVersion: 2,
      name: teamId,
      id: teamId,
      captainSessionId: 'captain-session',
      createdAt: Date.now(),
      members: [{
        id: `cold-valid-${index}`,
        name: 'alpha',
        provider: 'provider-a',
        model: 'model-a',
        ...policy,
        joinedAt: Date.now(),
        status: 'idle',
      }],
      tasks: [],
      taskSeq: 0,
      ...automaticRunningProvenance(teamId),
      phase: 'running',
    })
    const validChild = fakeChildContext({
      label: `agent-teams:${teamId}:alpha`,
      parentSessionId: 'captain-session',
      cwd: restoreWorkspace,
      agentProvider: 'provider-a',
      agentModel: 'model-a',
    })
    let validResumeRejected = false
    let validRoute
    try {
      const disposeValid = setupMemberSelection(validChild.context)
      validRoute = await routedConfig(validChild)
      disposeValid()
    } catch {
      validResumeRejected = true
    }
    check(`cold recovery keeps ${policy.label}`, !validResumeRejected && validRoute?.reasoningEffort === policy.reasoningEffort)
    await removeTeamDir(restoreStateRoot, teamId)
  }

  const invalidColdPolicies = [
    { label: 'explicit-missing-effort', expected: /explicit.*reasoning.*effort/i, reasoningMode: 'explicit' },
    { label: 'reasoning-mode-missing', expected: /missing reasoning mode|AgentTeams V2 状态无效/i },
    { label: 'provider-only', expected: /provider.*model|route|状态无效/i, provider: 'provider-a', model: undefined, reasoningMode: 'target-default' },
    { label: 'model-only', expected: /provider.*model|route|状态无效/i, provider: undefined, model: 'model-a', reasoningMode: 'target-default' },
  ]
  for (const [index, policy] of invalidColdPolicies.entries()) {
    const { label, expected, ...rolePolicy } = policy
    const teamId = `invalid-cold-${index}`
    await createTeamDir(restoreStateRoot, {
      schemaVersion: 2,
      name: teamId,
      id: teamId,
      captainSessionId: 'captain-session',
      createdAt: Date.now(),
      members: [{
        id: `cold-invalid-${index}`,
        name: 'alpha',
        provider: 'provider-a',
        model: 'model-a',
        ...rolePolicy,
        joinedAt: Date.now(),
        status: 'idle',
      }],
      tasks: [],
      taskSeq: 0,
      ...automaticRunningProvenance(teamId),
      phase: 'running',
    })
    const invalidChild = fakeChildContext({
      label: `agent-teams:${teamId}:alpha`,
      parentSessionId: 'captain-session',
      cwd: restoreWorkspace,
      agentProvider: 'provider-a',
      agentModel: 'model-a',
    })
    let rejected = false
    try {
      setupMemberSelection(invalidChild.context)
    } catch (error) {
      rejected = expected.test(String(error?.message ?? error))
    }
    check(`cold recovery rejects invalid durable role policy: ${label}`, rejected)
    await removeTeamDir(restoreStateRoot, teamId)
  }
} finally {
  await rm(restoreWorkspace, { recursive: true, force: true })
}

console.log('8/8 state-file atomic write hardening (Windows EPERM fallback)')
// The durable state files (team.json, mailboxes, retired index) are replaced
// through `atomicWriteText` = write-temp + rename. On Windows a rename over an
// existing target throws EPERM while another process holds it open without
// FILE_SHARE_DELETE; the hardened path retries the rename a few times and then
// degrades to a direct overwrite (content-equivalent because the temp file was
// fully written). These checks pin that behavior through the injectable seam
// and, on Windows, against a real cross-process handle lock.
const atomicStateRoot = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-atomic-'))
try {
  const {
    replaceFileAtomicOrDirect,
    writeTeam,
  } = await import('../lib/state.js')
  const epermError = () => Object.assign(
    new Error("EPERM: operation not permitted, rename '.../team.json.tmp' -> '.../team.json'"),
    { code: 'EPERM' },
  )

  let renameCalls = 0
  let fallbackWrites = 0
  let fallbackRemovals = 0
  let fallbackContent = ''
  const fallbackTarget = join(atomicStateRoot, 'forced', 'team.json')
  await replaceFileAtomicOrDirect('forced.tmp', fallbackTarget, '{"fallback":1}', {
    rename: async () => { renameCalls += 1; throw epermError() },
    writeFile: async (_file, content) => { fallbackWrites += 1; fallbackContent = content },
    remove: async () => { fallbackRemovals += 1 },
  }, { retryDelayMs: 1 })
  check(
    'persistent EPERM exhausts the rename retries (1 initial + 3 retries)',
    renameCalls === 4,
    `renameCalls = ${renameCalls}`,
  )
  check(
    'persistent EPERM falls back to a direct overwrite of the target',
    fallbackWrites === 1 && fallbackContent === '{"fallback":1}',
    `fallbackWrites = ${fallbackWrites}`,
  )
  check('the temp file is removed after the fallback write', fallbackRemovals === 1)

  let transientCalls = 0
  let transientWrites = 0
  await replaceFileAtomicOrDirect('transient.tmp', join(atomicStateRoot, 'transient', 'team.json'), '{"retried":2}', {
    rename: async () => {
      transientCalls += 1
      if (transientCalls <= 2) throw epermError()
    },
    writeFile: async (file, content) => { transientWrites += 1; await writeFile(file, content) },
    remove: async () => undefined,
  }, { retryDelayMs: 1 })
  check(
    'a transient EPERM recovers via rename retries without the fallback',
    transientCalls === 3 && transientWrites === 0,
    `renameCalls = ${transientCalls}, fallbackWrites = ${transientWrites}`,
  )

  let aggregateThrown = false
  let dualRemovals = 0
  try {
    await replaceFileAtomicOrDirect('dual.tmp', join(atomicStateRoot, 'dual', 'team.json'), 'x', {
      rename: async () => { throw epermError() },
      writeFile: async () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }) },
      remove: async () => { dualRemovals += 1 },
    }, { retryDelayMs: 1 })
  } catch (error) {
    aggregateThrown = error instanceof AggregateError
  }
  check('failure of both the atomic and the direct path raises AggregateError', aggregateThrown)
  check('the temp file is removed even after a dual failure', dualRemovals === 1)

  if (process.platform === 'win32') {
    // Real cross-process lock: hold team.json with FileShare.ReadWrite (no
    // FILE_SHARE_DELETE) from a child .NET handle, then verify the public
    // write path still persists through the direct-write fallback.
    const lockedTeam = {
      schemaVersion: 2,
      name: 'Locked Team',
      id: 'locked-team',
      captainSessionId: 'sess-lock',
      createdAt: Date.now(),
      members: [],
      tasks: [],
      taskSeq: 0,
      ...automaticRunningProvenance('locked-team'),
      phase: 'running',
    }
    await createTeamDir(atomicStateRoot, lockedTeam)
    const lockedJson = join(atomicStateRoot, lockedTeam.id, 'team.json')
    const { spawn } = await import('node:child_process')
    const holder = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
        `$f = '${lockedJson.replaceAll("'", "''")}';
         $s = [System.IO.File]::Open($f, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite);
         [Console]::Out.WriteLine('HELD'); [Console]::Out.Flush();
         Start-Sleep -Seconds 45; $s.Dispose()`],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    const held = await new Promise((resolve, reject) => {
      let buffer = ''
      const onData = (chunk) => {
        buffer += chunk.toString()
        if (buffer.includes('HELD')) { cleanup(); resolve(true) }
      }
      const onExit = () => { cleanup(); reject(new Error('lock holder exited before arming')) }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('timed out waiting for the lock holder'))
      }, 15_000)
      function cleanup() {
        clearTimeout(timer)
        holder.stdout.off('data', onData)
        holder.off('exit', onExit)
      }
      holder.stdout.on('data', onData)
      holder.on('exit', onExit)
    })
    try {
      if (held) {
        lockedTeam.members.push({ id: 'sess-new', name: 'member', joinedAt: Date.now(), status: 'idle' })
        await writeTeam(atomicStateRoot, lockedTeam)
        const persisted = JSON.parse(await readFile(lockedJson, 'utf8'))
        const leftovers = (await readdir(join(atomicStateRoot, lockedTeam.id))).filter(name => name.endsWith('.tmp'))
        check(
          'writeTeam survives a real Windows lock without FILE_SHARE_DELETE',
          persisted.members.length === 1 && leftovers.length === 0,
          `members = ${persisted.members.length}, tmp leftovers = ${leftovers.join(', ') || 'none'}`,
        )
      }
      // Archive moves the whole team directory with `rename(source, target)`.
      // The same Windows delete-sharing EPERM applies when a file below the
      // directory is momentarily locked, so it retries the rename. A short
      // (≈150 ms) lock falls inside the retry window and must not abort the
      // archive.
      const { archiveTeamDir } = await import('../lib/state.js')
      const transientTeam = {
        schemaVersion: 2,
        name: 'Transient Lock Team',
        id: 'transient-lock',
        captainSessionId: 'sess-transient',
        createdAt: Date.now(),
        members: [],
        tasks: [],
        taskSeq: 0,
        ...automaticRunningProvenance('transient-lock'),
        phase: 'running',
      }
      await createTeamDir(atomicStateRoot, transientTeam)
      const transientJson = join(atomicStateRoot, transientTeam.id, 'team.json')
      const flasher = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command',
          `$f = '${transientJson.replaceAll("'", "''")}';
           $s = [System.IO.File]::Open($f, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite);
           [Console]::Out.WriteLine('HELD_T'); [Console]::Out.Flush();
           [Threading.Thread]::Sleep(140); $s.Dispose()`],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      )
      const flashed = await new Promise((resolve, reject) => {
        let buffer = ''
        const onData = (chunk) => {
          buffer += chunk.toString()
          if (buffer.includes('HELD_T')) { cleanup(); resolve(true) }
        }
        const onExit = () => { cleanup(); reject(new Error('transient holder exited before arming')) }
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error('timed out waiting for the transient lock holder'))
        }, 10_000)
        function cleanup() {
          clearTimeout(timer)
          flasher.stdout.off('data', onData)
          flasher.off('exit', onExit)
        }
        flasher.stdout.on('data', onData)
        flasher.on('exit', onExit)
      })
      try {
        // The flasher releases after ~140 ms; archiveTeamDir retries the
        // rename across that window, so archiving must still succeed.
        await archiveTeamDir(atomicStateRoot, transientTeam.id)
        const archived = await readFile(join(atomicStateRoot, 'archive', transientTeam.id, 'team.json'), 'utf8')
        check(
          'archiveTeamDir survives a transient Windows directory lock via rename retries',
          flashed && JSON.parse(archived).id === transientTeam.id,
        )
      } catch (error) {
        check(
          'archiveTeamDir survives a transient Windows directory lock via rename retries',
          false,
          String(error),
        )
      } finally {
        flasher.kill()
      }
    } finally {
      holder.kill()
      if (holder.exitCode === null && holder.signalCode === null) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 5_000)
          holder.once('exit', () => { clearTimeout(timer); resolve() })
        })
      }
    }
  } else {
    check('real Windows lock integration skipped on this platform', true)
  }
} finally {
  await rm(atomicStateRoot, { recursive: true, force: true }).catch(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await rm(atomicStateRoot, { recursive: true, force: true })
  })
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nall checks passed')
