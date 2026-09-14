import { sessionOwnEvents } from "./harness-compat.js";
export const POLICY_PREFIX = 'AgentTeams delegation policy:';
export const NATIVE_DELEGATION_TOOLS = [
    'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code',
    'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'ralph',
];
const nativeDelegationToolNames = new Set(NATIVE_DELEGATION_TOOLS);
export function policyMarker(policy) {
    return `${POLICY_PREFIX} ${policy}`;
}
/** Policy-specific activation guidance placed before the shared AgentTeams protocol. */
export function delegationPolicyUsagePreamble(policy) {
    return policy === 'teams-v1'
        ? 'AgentTeams is the only genuine delegation path. Genuine delegation uses only agent_teams_* tools; ordinary single-agent work does not require creating a team. When genuine delegation is useful, you are the captain of a multi-agent team.'
        : 'When the user asks to run something with AgentTeams (e.g. "use AgentTeams to do X"), or an activation message from the /agent-teams slash command arrives, you are the captain of a multi-agent team.';
}
/** Read the durable system prompt across the V2 header and V3 system-message layouts. */
function persistedSystemText(event) {
    if (event.type === 'request/header') {
        // Session format V3 retires header.system; retain a narrow read only for
        // legacy logs that reached this plugin before the official migration.
        const legacy = event.data.header;
        return typeof legacy.system === 'string' ? legacy.system : undefined;
    }
    if (event.type !== 'system/message' || event.data.message.role !== 'system')
        return undefined;
    const text = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text);
    return text.length > 0 ? text.join('\n') : undefined;
}
export function persistedPolicy(events) {
    let persisted;
    for (const event of events) {
        const system = persistedSystemText(event);
        if (system === undefined)
            continue;
        for (const line of system.split(/\r\n?|\n/u)) {
            const match = /^AgentTeams delegation policy: (\S+)$/u.exec(line);
            if (match?.[1] === undefined)
                continue;
            if (match[1] === 'teams-v1' || match[1] === 'native-v1') {
                persisted = match[1];
                continue;
            }
            throw new Error('agent-teams: request header contains an unknown delegation policy marker');
        }
    }
    return persisted;
}
export function resolveDelegationPolicy(input) {
    return persistedPolicy(input.events)
        ?? input.parentPolicy
        ?? (input.defaultMode === 'teams' ? 'teams-v1' : 'native-v1');
}
const installedPolicies = new WeakMap();
function sessionEvents(agent) {
    const session = agent.session;
    return typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : session.events ?? [];
}
/** Return the in-scope policy already installed before an Agent's first request. */
export function installedDelegationPolicy(agent) {
    return installedPolicies.get(agent);
}
/** Resolve a live Agent's durable policy, including its unpublished installation. */
export function liveDelegationPolicy(agent, defaultMode) {
    const events = sessionEvents(agent);
    return persistedPolicy(events)
        ?? installedDelegationPolicy(agent)
        ?? resolveDelegationPolicy({ events, defaultMode });
}
/** Install one policy prompt plus Team-mode native-delegation enforcement in an Agent scope. */
export function installDelegationPolicy(input) {
    const { agent, policy } = input;
    const installed = installedPolicies.get(agent);
    if (installed !== undefined) {
        if (installed !== policy) {
            throw new Error(`agent-teams: agent already has delegation policy ${installed}, cannot install ${policy}`);
        }
        return () => undefined;
    }
    const disposePrompt = agent.ctx.systemPrompt.section({
        name: 'agent-teams:usage',
        order: input.order,
        text: input.text,
    });
    let disposeRestriction = () => undefined;
    let disposeGuard = () => undefined;
    try {
        if (policy === 'teams-v1') {
            // `restrict()` can only name inherited/global registrations. The built-in
            // `subagent` Host tool is scope-local in Harness 0.1.5, so it must never
            // enter the global deny list; the scoped execution guard below owns it.
            const deny = NATIVE_DELEGATION_TOOLS.filter((name) => name !== 'subagent' && agent.ctx.tools.get(name) !== undefined);
            if (deny.length > 0)
                disposeRestriction = agent.ctx.tools.restrict({ deny });
            // Scoped tools deliberately survive `restrict()`. Guard every native
            // delegation name at execution time so a scope-local registration cannot
            // bypass the Team-only AgentTeams delegation policy.
            disposeGuard = agent.ctx.tools.guard((execution) => (nativeDelegationToolNames.has(execution.name)
                ? `AgentTeams Team policy forbids native delegation tool "${execution.name}"; use agent_teams_* tools`
                : undefined));
        }
    }
    catch (error) {
        disposeGuard();
        disposeRestriction();
        disposePrompt();
        throw error;
    }
    installedPolicies.set(agent, policy);
    let active = true;
    return () => {
        if (!active)
            return;
        active = false;
        installedPolicies.delete(agent);
        disposeGuard();
        disposeRestriction();
        disposePrompt();
    };
}
/** Resolve and install one Agent policy before any request assembly. */
export function resolveAndInstallDelegationPolicy(agent, parent, runtime, options = {}) {
    const defaultMode = runtime.defaultMode();
    const events = sessionEvents(agent);
    const policy = resolveDelegationPolicy({
        events,
        defaultMode,
        ...(parent === undefined ? {} : { parentPolicy: liveDelegationPolicy(parent, defaultMode) }),
    });
    const dispose = installDelegationPolicy({
        agent,
        policy,
        order: runtime.order,
        text: options.member ? (runtime.memberText?.(policy) ?? runtime.text(policy)) : runtime.text(policy),
    });
    return { policy, dispose };
}
/** Register the synchronous `agent/created` policy installer from the plugin root. */
export function registerDelegationPolicyLifecycle(ctx, runtime) {
    return ctx.on('agent/created', ({ agent }) => {
        // AgentTeams' member runtime installs the member-scoped policy itself
        // after validating the durable descriptor and pending role selection.
        // Skipping this early captain installation prevents the child from
        // assembling captain-only guidance during its first request.
        const ownEvents = sessionOwnEvents(agent.session);
        if (ownEvents.some(event => event?.type === 'subagent/descriptor'
            && typeof event.data?.label === 'string'
            && event.data.label.startsWith('agent-teams:')))
            return;
        const parentSession = agent.session.header.parentSession;
        const parent = parentSession === undefined ? undefined : ctx.agents.get(parentSession);
        resolveAndInstallDelegationPolicy(agent, parent, runtime);
    });
}
