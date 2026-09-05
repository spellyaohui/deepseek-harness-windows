export const POLICY_PREFIX = 'AgentTeams delegation policy:';
export const NATIVE_DELEGATION_TOOLS = [
    'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code',
    'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'ralph',
];
export function policyMarker(policy) {
    return `${POLICY_PREFIX} ${policy}`;
}
/** Policy-specific activation guidance placed before the shared AgentTeams protocol. */
export function delegationPolicyUsagePreamble(policy) {
    return policy === 'teams-v1'
        ? 'AgentTeams is the only genuine delegation path. Genuine delegation uses only agent_teams_* tools; ordinary single-agent work does not require creating a team. When genuine delegation is useful, you are the captain of a multi-agent team.'
        : 'When the user asks to run something with AgentTeams (e.g. "use AgentTeams to do X"), or an activation message from the /agent-teams slash command arrives, you are the captain of a multi-agent team.';
}
export function persistedPolicy(events) {
    let persisted;
    for (const event of events) {
        if (event?.type !== 'request/header')
            continue;
        const system = event.data.header.system;
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
/** Install one policy prompt and its model-visible tool restriction in an Agent scope. */
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
    try {
        if (policy === 'teams-v1') {
            const deny = NATIVE_DELEGATION_TOOLS.filter((name) => agent.ctx.tools.get(name, agent) !== undefined);
            if (deny.length > 0)
                disposeRestriction = agent.ctx.tools.restrict({ deny });
        }
    }
    catch (error) {
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
        disposeRestriction();
        disposePrompt();
    };
}
/** Resolve and install one Agent policy before any request assembly. */
export function resolveAndInstallDelegationPolicy(agent, parent, runtime) {
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
        text: runtime.text(policy),
    });
    return { policy, dispose };
}
/** Register the synchronous `agent/created` policy installer from the plugin root. */
export function registerDelegationPolicyLifecycle(ctx, runtime) {
    return ctx.on('agent/created', ({ agent }) => {
        const parentSession = agent.session.header.parentSession;
        const parent = parentSession === undefined ? undefined : ctx.agents.get(parentSession);
        resolveAndInstallDelegationPolicy(agent, parent, runtime);
    });
}
