import { createHash } from 'node:crypto';
export function statusFingerprint(value) {
    const team = value;
    const summary = {
        team_name: team.team_name,
        description: team.description?.slice(0, 240),
        profile: team.profile === undefined
            ? undefined
            : { name: team.profile.name, task_planning: team.profile.task_planning },
        viewer: team.viewer,
        members: team.members.map((member) => ({
            name: member.name,
            role: member.role,
            status: member.status,
            activity: member.activity,
        })),
        tasks: team.tasks.map((task) => ({
            id: task.id,
            subject: task.subject,
            status: task.status,
            assignee: task.assignee,
            dependencies: task.dependencies,
            attempt: task.attempt,
            attempt_id: task.attempt_id,
            reassigning: task.reassigning,
            seed_id: task.seed_id,
            kind: task.kind,
            round: task.round,
            verdict: task.verdict,
            findings_open: task.findings_open,
        })),
        captain_inbox: team.captain_inbox.map((message) => ({
            from: message.from,
            content: message.content.slice(0, 200),
        })),
        member_inboxes: Object.fromEntries(Object.entries(team.member_inboxes).map(([name, inbox]) => [name, {
                count: inbox.count,
                latest: inbox.latest.slice(0, 120),
            }])),
        mailbox_warnings: team.mailbox_warnings,
        mailbox_warning_count: team.mailbox_warning_count,
        halted: team.halted,
        escalated: team.escalated,
        loop_state: team.loop_state,
        loop_summary: team.loop_summary?.slice(0, 300),
        deliverable: team.deliverable,
        coverage: team.coverage?.map((row) => ({
            goal_item: row.goal_item,
            status: row.status,
            task_ids: row.task_ids,
        })),
        delivery: team.delivery,
    };
    return createHash('sha256').update(JSON.stringify(summary)).digest('hex');
}
/** Render the status snapshot for the model at the requested detail level. */
export function renderStatus(value, detail = 'summary') {
    const team = value;
    return detail === 'full' ? renderFullStatus(team) : renderSummaryStatus(team);
}
function statusFlags(team) {
    return [
        team.halted ? 'halted' : undefined,
        team.escalated ? 'escalated' : undefined,
        team.deliverable ? 'deliverable' : undefined,
        team.loop_state && team.loop_state !== 'running' && team.loop_state !== 'halted' && team.loop_state !== 'escalated'
            ? team.loop_state
            : undefined,
    ].filter((item) => item !== undefined);
}
function renderSummaryStatus(team) {
    const flags = statusFlags(team);
    if (team.status_summary_unchanged === true) {
        const working = team.members.filter((member) => member.activity === 'running' || member.status === 'working').length;
        const blocked = team.tasks.filter((task) => task.status === 'blocked').length;
        const running = team.tasks.filter((task) => task.status === 'in_progress' || task.status === 'claimed').length;
        const completed = team.tasks.filter((task) => task.status === 'completed').length;
        return [
            'No summary-visible Team state changes since the previous status query.',
            `Team "${team.team_name}"${flags.length > 0 ? ` [${flags.join(', ')}]` : ''}: ${working}/${team.members.length} members active; tasks ${running} running, ${blocked} blocked, ${completed} completed.`,
            ...team.delivery === undefined ? [] : [`Delivery: ${team.delivery.ok ? 'ok' : `blocked (${team.delivery.blockers.join('; ')})`}`],
            `Captain inbox: ${team.captain_inbox.length} new; member inboxes: ${Object.values(team.member_inboxes).reduce((total, inbox) => total + inbox.count, 0)} new.`,
            'Use agent_teams_status({ detail: "full" }) when task outputs, provider/model details, or profile protocol are required.',
        ].join('\n');
    }
    const lines = [
        `Team "${team.team_name}"${team.description ? ` — ${team.description.slice(0, 240)}` : ''}${flags.length > 0 ? ` [${flags.join(', ')}]` : ''}`,
        ...team.profile === undefined ? [] : [`Profile: ${team.profile.name}${team.profile.task_planning ? ` [${team.profile.task_planning}]` : ''}`],
        ...team.loop_summary ? [`Loop: ${team.loop_state ?? ''} — ${team.loop_summary.slice(0, 300)}`.replace(/^Loop:  — /u, 'Loop: ')] : [],
        `Viewing as: ${team.viewer}`,
        `Members (${team.members.length}):`,
        ...team.members.map((member) => `  - ${member.name} [${member.role}] ${member.status}/${member.activity}`),
        `Tasks (${team.tasks.length}):`,
        ...team.tasks.map((task) => {
            const deps = task.dependencies.length > 0 ? ` (deps: ${task.dependencies.join(',')})` : '';
            const details = [
                task.kind,
                task.round === undefined ? undefined : `r${task.round}`,
                task.verdict === undefined ? undefined : `verdict ${task.verdict}`,
                task.findings_open === undefined || task.findings_open === 0 ? undefined : `findings ${task.findings_open}`,
                task.reassigning ? 'reassigning' : undefined,
            ].filter((item) => item !== undefined);
            const suffix = details.length > 0 ? ` ${details.join(' ')}` : '';
            const seed = task.seed_id === undefined || task.seed_id === '' ? '' : ` seed ${task.seed_id}`;
            const attemptId = task.attempt_id === '' ? '' : ` id ${task.attempt_id}`;
            return `  - ${task.id} [${task.status}]${suffix} attempt ${task.attempt}${attemptId}${seed} ${task.subject} → ${task.assignee || 'unassigned'}${deps}`;
        }),
        'Task outputs omitted in summary; call agent_teams_status({ detail: "full" }) when reviewing reports or verification evidence.',
        ...team.coverage === undefined || team.coverage.length === 0 ? [] : [
            'Coverage:',
            ...team.coverage.map((row) => `  - ${row.goal_item}: ${row.status} (${row.task_ids.join(',') || 'none'})`),
        ],
        ...team.delivery === undefined ? [] : [
            `Delivery: ${team.delivery.ok ? 'ok' : `blocked (${team.delivery.blockers.join('; ')})`}`,
        ],
        `Captain inbox (${team.captain_inbox.length}):`,
        ...team.captain_inbox.map((message) => `  - [${message.from}] ${message.content.slice(0, 200)}`),
    ];
    for (const [name, inbox] of Object.entries(team.member_inboxes)) {
        lines.push(`Member inbox ${name} (${inbox.count}): latest — ${inbox.latest.slice(0, 120)}`);
    }
    if (team.mailbox_warning_count > 0) {
        lines.push(`Mailbox warnings (${team.mailbox_warning_count}; malformed lines were skipped; showing up to 10):`, ...team.mailbox_warnings.map((warning) => `  - ${warning}`));
    }
    return lines.join('\n');
}
function renderFullStatus(team) {
    const flags = statusFlags(team);
    const lines = [
        `Team "${team.team_name}"${team.description ? ` — ${team.description}` : ''}${flags.length > 0 ? ` [${flags.join(', ')}]` : ''}`,
        ...team.profile === undefined ? [] : [`Profile: ${team.profile.name}${team.profile.task_planning ? ` [${team.profile.task_planning}]` : ''}${team.profile.protocol ? ` — ${team.profile.protocol}` : ''}`],
        ...team.loop_summary ? [`Loop: ${team.loop_state ?? ''} — ${team.loop_summary}`.replace(/^Loop:  — /u, 'Loop: ')] : [],
        `Viewing as: ${team.viewer}`,
        `Members (${team.members.length}):`,
        ...team.members.map((member) => {
            const route = member.provider && member.model ? ` · ${member.provider}/${member.model}` : '';
            const effort = member.reasoning_effort ? ` · reasoning ${member.reasoning_effort}` : '';
            return `  - ${member.name} [${member.role}] ${member.status}/${member.activity}${route}${effort}`;
        }),
        `Tasks (${team.tasks.length}):`,
        ...team.tasks.map((task) => {
            const deps = task.dependencies.length > 0 ? ` (deps: ${task.dependencies.join(',')})` : '';
            const output = task.output !== undefined ? `\n      output: ${task.output}` : '';
            const handoff = task.reassigning ? ' (reassigning)' : '';
            const seed = task.seed_id === undefined || task.seed_id === '' ? '' : ` seed ${task.seed_id}`;
            const kind = task.kind ? ` ${task.kind}` : '';
            const round = task.round === undefined ? '' : ` r${task.round}`;
            const verdict = task.verdict === undefined ? '' : ` verdict ${task.verdict}`;
            return `  - ${task.id} [${task.status}]${kind}${round}${verdict} attempt ${task.attempt}${handoff}${seed} ${task.subject} → ${task.assignee || 'unassigned'}${deps}${output}`;
        }),
        ...team.coverage === undefined || team.coverage.length === 0 ? [] : [
            'Coverage:',
            ...team.coverage.map((row) => `  - ${row.goal_item}: ${row.status} (${row.task_ids.join(',') || 'none'})`),
        ],
        ...team.delivery === undefined ? [] : [
            `Delivery: ${team.delivery.ok ? 'ok' : `blocked (${team.delivery.blockers.join('; ')})`}`,
        ],
        `Captain inbox (${team.captain_inbox.length}):`,
        ...team.captain_inbox.map((message) => `  - [${message.from}] ${message.content}`),
    ];
    for (const [name, inbox] of Object.entries(team.member_inboxes)) {
        lines.push(`Member inbox ${name} (${inbox.count}): latest — ${inbox.latest.slice(0, 120)}`);
    }
    if (team.mailbox_warning_count > 0) {
        lines.push(`Mailbox warnings (${team.mailbox_warning_count}; malformed lines were skipped; showing up to 10):`, ...team.mailbox_warnings.map((warning) => `  - ${warning}`));
    }
    return lines.join('\n');
}
