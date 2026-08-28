import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Editable pre-run roster and DAG review for staged AgentTeams plans.
 *
 * This leaf owns only transient form/disclosure state. Durable truth remains
 * on the host and returns through the ordinary activity polling snapshot.
 * @module dsh-agent-teams/client/staging-plan
 */
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { buildStagedTaskMutationPayload } from "./staged-task-mutation.js";
import css from './ActivityPanel.module.css';
const PLAN_URL = '/plugins/dsh-agent-teams/plan';
const TASK_KIND_OPTIONS = [
    'work',
    'requirements',
    'implementation',
    'verification',
    'review',
    'repair',
    'integration',
];
function formatLineList(values) {
    return (values ?? []).join('\n');
}
function taskKindLabel(t, kind) {
    switch (kind) {
        case 'work': return t('plan.task.kind.work');
        case 'requirements': return t('plan.task.kind.requirements');
        case 'implementation': return t('plan.task.kind.implementation');
        case 'verification': return t('plan.task.kind.verification');
        case 'review': return t('plan.task.kind.review');
        case 'repair': return t('plan.task.kind.repair');
        case 'integration': return t('plan.task.kind.integration');
    }
}
function useDismissSuccess(feedback, setFeedback) {
    useEffect(() => {
        if (feedback?.tone !== 'success')
            return;
        const timeout = window.setTimeout(() => { setFeedback(undefined); }, 3_500);
        return () => { window.clearTimeout(timeout); };
    }, [feedback, setFeedback]);
}
async function mutatePlan(payload) {
    const response = await fetch(PLAN_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (response.ok)
        return;
    let message = `HTTP ${response.status}`;
    try {
        const body = await response.json();
        if (typeof body.error === 'string' && body.error.trim() !== '')
            message = body.error;
    }
    catch { }
    throw new Error(message);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function DisclosureChevron({ open }) {
    return (_jsx("svg", { className: css.planChevron, "data-open": open, width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": true, children: _jsx("path", { d: "M4 2.5 7.5 6 4 9.5" }) }));
}
function Feedback({ value }) {
    if (value === undefined)
        return null;
    return (_jsxs("span", { className: css.planFeedback, "data-tone": value.tone, role: value.tone === 'error' ? 'alert' : 'status', "aria-live": value.tone === 'error' ? 'assertive' : 'polite', children: [_jsx("span", { "aria-hidden": true, children: value.tone === 'success'
                    ? _jsx("svg", { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: _jsx("path", { d: "m2.5 6.2 2.2 2.2 4.8-5" }) })
                    : _jsx("svg", { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: _jsx("path", { d: "M6 2.3v4.1M6 8.8v.1" }) }) }), value.message] }));
}
function routeKey(provider, model) {
    return JSON.stringify([provider, model]);
}
const MODEL_MENU_OPEN_MODELS = 'open:models';
const MODEL_MENU_OPEN_EFFORT = 'open:effort';
const MODEL_MENU_BACK = 'navigate:back';
const MODEL_MENU_RETRY = 'action:retry';
function modelMenuId(provider, model) {
    return `model:${routeKey(provider, model)}`;
}
function effortMenuId(effort) {
    return `effort:${effort}`;
}
/**
 * Thin staged-plan adapter over the official model directory. It deliberately
 * reads only catalog metadata: choosing a member route must not change the
 * captain session's composer model.
 */
function StagedModelPicker({ directory, provider, model, reasoningMode, reasoningEffort, busy, onChange, t, }) {
    const state = useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot);
    const [open, setOpen] = useState(false);
    const [pane, setPane] = useState('root');
    const catalogRoutes = state.groups.flatMap((group) => group.models.map((candidate) => ({
        key: routeKey(group.id, candidate.id),
        provider: group.id,
        providerName: group.name,
        model: candidate,
    })));
    const selectedKey = routeKey(provider, model);
    const selected = catalogRoutes.find((candidate) => candidate.key === selectedKey);
    const efforts = selected?.model.reasoning?.efforts ?? [];
    const currentMissing = provider !== '' && model !== '' && selected === undefined;
    const defaultEffort = selected?.model.reasoning?.defaultEffort;
    const effectiveEffort = reasoningMode === 'explicit' ? reasoningEffort : undefined;
    const selectedEffort = efforts.find((effort) => effort.id === effectiveEffort);
    const modelLabel = selected?.model.name
        ?? (model === '' ? t('plan.model.choose') : model);
    const modeLabel = reasoningMode === 'target-default'
        ? t('settings.profiles.reasoning.target-default.label')
        : reasoningMode === 'route-aware'
            ? t('settings.profiles.reasoning.route-aware.label')
            : t('settings.profiles.reasoning.explicit.label');
    const effortLabel = reasoningMode === 'explicit'
        ? selectedEffort?.name ?? reasoningEffort
        : modeLabel;
    const unavailable = state.status === 'error' || state.failures.length > 0;
    const close = () => {
        setOpen(false);
        setPane('root');
    };
    const rootItems = [
        {
            id: MODEL_MENU_OPEN_MODELS,
            label: (_jsxs("span", { className: css.planModelMenuRow, children: [_jsx("span", { children: t('plan.member.model') }), _jsx("strong", { children: modelLabel }), _jsx(DisclosureChevron, { open: false })] })),
            disabled: state.status === 'loading' && catalogRoutes.length === 0,
        },
        {
            id: MODEL_MENU_OPEN_EFFORT,
            label: (_jsxs("span", { className: css.planModelMenuRow, children: [_jsx("span", { children: t('plan.member.reasoning') }), _jsx("strong", { children: effortLabel }), _jsx(DisclosureChevron, { open: false })] })),
            disabled: reasoningMode !== 'explicit' || efforts.length === 0,
        },
    ];
    const modelItems = [
        {
            id: MODEL_MENU_BACK,
            label: (_jsxs("span", { className: css.planModelMenuBack, children: [_jsx(DisclosureChevron, { open: false }), t('plan.model.back')] })),
        },
        { type: 'separator', id: 'models:separator' },
    ];
    if (catalogRoutes.length === 0) {
        modelItems.push({
            id: 'models:empty',
            label: state.status === 'loading' ? t('plan.model.loading') : t('plan.model.empty'),
            disabled: true,
        });
    }
    else {
        for (const group of state.groups) {
            modelItems.push({ type: 'label', id: `provider:${group.id}`, text: group.name });
            for (const candidate of group.models) {
                modelItems.push({
                    id: modelMenuId(group.id, candidate.id),
                    label: candidate.name,
                    disabled: reasoningMode === 'explicit' && (candidate.reasoning?.efforts.length ?? 0) === 0,
                });
            }
        }
    }
    const effortItems = [
        {
            id: MODEL_MENU_BACK,
            label: (_jsxs("span", { className: css.planModelMenuBack, children: [_jsx(DisclosureChevron, { open: false }), t('plan.model.back')] })),
        },
        { type: 'separator', id: 'effort:separator' },
        ...efforts.map((effort) => ({
            id: effortMenuId(effort.id),
            label: (_jsxs("span", { className: css.planModelEffortRow, children: [_jsx("span", { children: effort.name }), effort.description !== undefined && _jsx("small", { children: effort.description })] })),
        })),
    ];
    const items = pane === 'models' ? modelItems : pane === 'effort' ? effortItems : rootItems;
    const selectedId = pane === 'models'
        ? modelMenuId(provider, model)
        : pane === 'effort'
            ? effortMenuId(reasoningEffort)
            : undefined;
    const choose = (id) => {
        if (id === MODEL_MENU_OPEN_MODELS) {
            setPane('models');
            return;
        }
        if (id === MODEL_MENU_OPEN_EFFORT) {
            setPane('effort');
            return;
        }
        if (id === MODEL_MENU_BACK) {
            setPane('root');
            return;
        }
        if (id === MODEL_MENU_RETRY) {
            void directory.load().catch(() => undefined);
            return;
        }
        const nextModel = catalogRoutes.find((candidate) => modelMenuId(candidate.provider, candidate.model.id) === id);
        if (nextModel !== undefined) {
            close();
            if (nextModel.provider === provider && nextModel.model.id === model)
                return;
            onChange({
                provider: nextModel.provider,
                model: nextModel.model.id,
                reasoningMode,
                reasoningEffort: reasoningMode === 'explicit'
                    ? nextModel.model.reasoning?.defaultEffort ?? nextModel.model.reasoning?.efforts[0]?.id ?? ''
                    : '',
            });
            return;
        }
        const nextEffort = efforts.find((effort) => effortMenuId(effort.id) === id);
        if (nextEffort === undefined)
            return;
        close();
        if (nextEffort.id === reasoningEffort)
            return;
        onChange({ provider, model, reasoningMode, reasoningEffort: nextEffort.id });
    };
    return (_jsxs("div", { className: css.planModelPicker, "data-model-directory-status": state.status, children: [_jsxs("label", { children: [t('settings.profiles.reasoning.title'), _jsxs("select", { name: "reasoningMode", value: reasoningMode, disabled: busy, onChange: (event) => {
                            const nextMode = event.currentTarget.value;
                            if (nextMode === reasoningMode)
                                return;
                            const nextEffort = nextMode === 'explicit' ? defaultEffort ?? efforts[0]?.id ?? '' : '';
                            if (nextMode === 'explicit' && nextEffort === '')
                                return;
                            onChange({ provider, model, reasoningMode: nextMode, reasoningEffort: nextEffort });
                        }, children: [_jsx("option", { value: "target-default", children: t('settings.profiles.reasoning.target-default.label') }), _jsx("option", { value: "route-aware", children: t('settings.profiles.reasoning.route-aware.label') }), _jsx("option", { value: "explicit", disabled: efforts.length === 0 && reasoningMode !== 'explicit', children: t('settings.profiles.reasoning.explicit.label') })] })] }), _jsx(Menu, { open: open, portal: true, align: "end", compact: true, className: css.planModelMenu, items: items, footer: unavailable ? [{ id: MODEL_MENU_RETRY, label: t('plan.model.retry') }] : undefined, selectedId: selectedId, onSelect: choose, onClose: close, anchor: (_jsxs("button", { type: "button", className: css.planModelTrigger, "data-plan-model-trigger": true, "aria-label": t('plan.model.triggerAria', { model: modelLabel, effort: effortLabel }), "aria-haspopup": "menu", "aria-expanded": open, disabled: busy, onClick: () => {
                        if (open)
                            close();
                        else {
                            setPane('root');
                            setOpen(true);
                            void directory.load().catch(() => undefined);
                        }
                    }, children: [_jsxs("span", { className: css.planModelTriggerCopy, children: [_jsx("strong", { children: state.status === 'loading' && catalogRoutes.length === 0 ? t('plan.model.loading') : modelLabel }), _jsx("span", { children: effortLabel })] }), _jsx(DisclosureChevron, { open: open })] })) }), _jsx("small", { className: css.planModelHint, children: currentMissing
                    ? t('plan.model.currentUnavailable', { provider, model })
                    : selected?.model.description ?? t('plan.model.route', { provider, model }) }), unavailable && (_jsxs("span", { className: css.planModelNotice, role: state.status === 'error' ? 'alert' : 'status', children: [_jsx("span", { children: state.error ?? t('plan.model.partialFailure', { count: state.failures.length }) }), _jsx("button", { type: "button", disabled: busy || state.status === 'loading', onClick: () => { void directory.load().catch(() => undefined); }, children: t('plan.model.retry') })] }))] }));
}
function StagedMemberEditor({ team, member, modelDirectory, onPendingChange, t }) {
    const bodyId = useId();
    const [open, setOpen] = useState(false);
    const [role, setRole] = useState(member.role);
    const [provider, setProvider] = useState(member.provider ?? '');
    const [model, setModel] = useState(member.model ?? '');
    const [reasoningMode, setReasoningMode] = useState(member.reasoningMode);
    const [reasoningEffort, setReasoningEffort] = useState(member.reasoningMode === 'explicit' ? member.reasoningEffort ?? '' : '');
    const [executionPrompt, setExecutionPrompt] = useState(member.executionPrompt ?? '');
    const remoteSignature = JSON.stringify([
        member.role,
        member.provider ?? '',
        member.model ?? '',
        member.reasoningMode,
        member.reasoningMode === 'explicit' ? member.reasoningEffort ?? '' : '',
        member.executionPrompt ?? '',
    ]);
    const [savedSignature, setSavedSignature] = useState(remoteSignature);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState();
    useDismissSuccess(feedback, setFeedback);
    const signature = JSON.stringify([role, provider, model, reasoningMode, reasoningEffort, executionPrompt]);
    const dirty = signature !== savedSignature;
    useEffect(() => {
        onPendingChange(`member:${member.name}`, dirty || busy);
        return () => { onPendingChange(`member:${member.name}`, false); };
    }, [busy, dirty, member.name, onPendingChange]);
    useEffect(() => {
        setRole(member.role);
        setProvider(member.provider ?? '');
        setModel(member.model ?? '');
        setReasoningMode(member.reasoningMode);
        setReasoningEffort(member.reasoningMode === 'explicit' ? member.reasoningEffort ?? '' : '');
        setExecutionPrompt(member.executionPrompt ?? '');
        setSavedSignature(remoteSignature);
    }, [member.role, member.provider, member.model, member.reasoningMode, member.reasoningEffort, member.executionPrompt, remoteSignature]);
    const markEdited = () => { setFeedback(undefined); };
    const persist = async (selection = { provider, model, reasoningMode, reasoningEffort }) => {
        const nextSignature = JSON.stringify([
            role,
            selection.provider,
            selection.model,
            selection.reasoningMode,
            selection.reasoningEffort,
            executionPrompt,
        ]);
        setProvider(selection.provider);
        setModel(selection.model);
        setReasoningMode(selection.reasoningMode);
        setReasoningEffort(selection.reasoningEffort);
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'update_member',
                memberName: member.name,
                role,
                provider: selection.provider,
                model: selection.model,
                reasoningMode: selection.reasoningMode,
                ...selection.reasoningMode === 'explicit' ? { reasoningEffort: selection.reasoningEffort } : {},
                executionPrompt,
            });
            setSavedSignature(nextSignature);
            setFeedback({ tone: 'success', message: t('plan.saved') });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
        }
        finally {
            setBusy(false);
        }
    };
    const save = async (event) => {
        event.preventDefault();
        await persist();
    };
    const route = `${provider}/${model}`.replace(/^\//u, '');
    return (_jsxs("article", { className: css.planCard, "data-plan-member": member.name, "data-open": open, children: [_jsxs("button", { type: "button", className: css.planCardHeader, "aria-expanded": open, "aria-controls": bodyId, onClick: () => { setOpen((current) => !current); }, children: [_jsxs("span", { className: css.planCardIdentity, children: [_jsx("strong", { children: member.name }), _jsx("span", { children: role || t('plan.member.roleFallback') })] }), _jsx("span", { className: css.planCardMeta, title: route, children: route }), dirty && _jsx("em", { className: css.planDirty, children: t('plan.unsaved') }), _jsx(DisclosureChevron, { open: open })] }), open && (_jsxs("form", { id: bodyId, className: css.planCardBody, onSubmit: (event) => { void save(event); }, children: [_jsxs("fieldset", { disabled: busy, children: [_jsxs("label", { children: [t('plan.member.role'), _jsx("input", { name: "role", value: role, onChange: (event) => { setRole(event.currentTarget.value); markEdited(); } })] }), _jsx(StagedModelPicker, { directory: modelDirectory, provider: provider, model: model, reasoningMode: reasoningMode, reasoningEffort: reasoningEffort, busy: busy, onChange: (selection) => { void persist(selection); }, t: t }), _jsxs("label", { children: [t('plan.member.prompt'), _jsx("textarea", { name: "executionPrompt", value: executionPrompt, onChange: (event) => { setExecutionPrompt(event.currentTarget.value); markEdited(); }, rows: 3 })] })] }), _jsxs("span", { className: css.planActions, children: [_jsx(Feedback, { value: feedback }), _jsx("button", { type: "submit", disabled: busy || !dirty || provider.trim() === '' || model.trim() === '' || (reasoningMode === 'explicit' && reasoningEffort.trim() === ''), children: busy ? t('plan.saving') : t('plan.save') })] })] }))] }));
}
function StagedTaskEditor({ team, task, onPendingChange, t }) {
    const bodyId = useId();
    const taskDependencies = task.dependencies.join(', ');
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState(task.subject);
    const [description, setDescription] = useState(task.description ?? '');
    const [assignee, setAssignee] = useState(task.assignee);
    const [dependencies, setDependencies] = useState(taskDependencies);
    const [kind, setKind] = useState(task.kind ?? 'work');
    const [round, setRound] = useState(task.round?.toString() ?? '');
    const [objective, setObjective] = useState(task.objective ?? '');
    const [inScope, setInScope] = useState(formatLineList(task.inScope));
    const [outOfScope, setOutOfScope] = useState(formatLineList(task.outOfScope));
    const [acceptance, setAcceptance] = useState(formatLineList(task.acceptance));
    const [verify, setVerify] = useState(formatLineList(task.verify));
    const [deliverables, setDeliverables] = useState(formatLineList(task.deliverables));
    const [nonGoals, setNonGoals] = useState(formatLineList(task.nonGoals));
    const [reviewedTaskId, setReviewedTaskId] = useState(task.reviewedTaskId ?? '');
    const [sourceTaskId, setSourceTaskId] = useState(task.sourceTaskId ?? '');
    const [sourceFindingIds, setSourceFindingIds] = useState(formatLineList(task.sourceFindingIds));
    const [coverageOf, setCoverageOf] = useState(formatLineList(task.coverageOf));
    const taskContractSignature = [
        task.kind ?? 'work',
        task.round?.toString() ?? '',
        task.objective ?? '',
        formatLineList(task.inScope),
        formatLineList(task.outOfScope),
        formatLineList(task.acceptance),
        formatLineList(task.verify),
        formatLineList(task.deliverables),
        formatLineList(task.nonGoals),
        task.reviewedTaskId ?? '',
        task.sourceTaskId ?? '',
        formatLineList(task.sourceFindingIds),
        formatLineList(task.coverageOf),
    ];
    const remoteSignature = JSON.stringify([
        task.subject,
        task.description ?? '',
        task.assignee,
        taskDependencies,
        ...taskContractSignature,
    ]);
    const [savedSignature, setSavedSignature] = useState(remoteSignature);
    const [busy, setBusy] = useState(false);
    const [confirmingRemove, setConfirmingRemove] = useState(false);
    const [feedback, setFeedback] = useState();
    useDismissSuccess(feedback, setFeedback);
    const signature = JSON.stringify([
        subject,
        description,
        assignee,
        dependencies,
        kind,
        round,
        objective,
        inScope,
        outOfScope,
        acceptance,
        verify,
        deliverables,
        nonGoals,
        reviewedTaskId,
        sourceTaskId,
        sourceFindingIds,
        coverageOf,
    ]);
    const dirty = signature !== savedSignature;
    useEffect(() => {
        onPendingChange(`task:${task.id}`, dirty || busy);
        return () => { onPendingChange(`task:${task.id}`, false); };
    }, [busy, dirty, onPendingChange, task.id]);
    useEffect(() => {
        setSubject(task.subject);
        setDescription(task.description ?? '');
        setAssignee(task.assignee);
        setDependencies(taskDependencies);
        setKind(task.kind ?? 'work');
        setRound(task.round?.toString() ?? '');
        setObjective(task.objective ?? '');
        setInScope(formatLineList(task.inScope));
        setOutOfScope(formatLineList(task.outOfScope));
        setAcceptance(formatLineList(task.acceptance));
        setVerify(formatLineList(task.verify));
        setDeliverables(formatLineList(task.deliverables));
        setNonGoals(formatLineList(task.nonGoals));
        setReviewedTaskId(task.reviewedTaskId ?? '');
        setSourceTaskId(task.sourceTaskId ?? '');
        setSourceFindingIds(formatLineList(task.sourceFindingIds));
        setCoverageOf(formatLineList(task.coverageOf));
        setSavedSignature(remoteSignature);
    }, [remoteSignature]);
    const markEdited = () => {
        setFeedback(undefined);
        setConfirmingRemove(false);
    };
    const save = async (event) => {
        event.preventDefault();
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan(buildStagedTaskMutationPayload({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                taskId: task.id,
                subject,
                description,
                assignee,
                dependencies,
                kind,
                round,
                objective,
                inScope,
                outOfScope,
                acceptance,
                verify,
                deliverables,
                nonGoals,
                reviewedTaskId,
                sourceTaskId,
                sourceFindingIds,
                coverageOf,
            }));
            setSavedSignature(signature);
            setFeedback({ tone: 'success', message: t('plan.saved') });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
        }
        finally {
            setBusy(false);
        }
    };
    const remove = async () => {
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'remove_task',
                taskId: task.id,
            });
            setFeedback({ tone: 'success', message: t('plan.removed') });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
            setBusy(false);
        }
    };
    const dependencySummary = task.dependencies.length === 0
        ? t('plan.dependencies.none')
        : t('plan.dependencies.count', { count: task.dependencies.length });
    const roundValid = round.trim() === '' || (/^[1-9]\d*$/u.test(round.trim()) && Number.isSafeInteger(Number(round)));
    return (_jsxs("article", { className: css.planCard, "data-plan-task": task.id, "data-open": open, children: [_jsxs("button", { type: "button", className: css.planCardHeader, "aria-expanded": open, "aria-controls": bodyId, onClick: () => { setOpen((current) => !current); }, children: [_jsx("span", { className: css.planTaskId, children: task.id }), _jsx("span", { className: css.planTaskSummary, title: subject, children: subject }), _jsxs("span", { className: css.planCardMeta, children: [assignee || t('plan.task.unassigned'), " \u00B7 ", dependencySummary] }), dirty && _jsx("em", { className: css.planDirty, children: t('plan.unsaved') }), _jsx(DisclosureChevron, { open: open })] }), open && (_jsxs("form", { id: bodyId, className: css.planCardBody, onSubmit: (event) => { void save(event); }, children: [_jsxs("fieldset", { disabled: busy, children: [_jsxs("label", { children: [t('plan.task.subject'), _jsx("input", { name: "subject", required: true, value: subject, onChange: (event) => { setSubject(event.currentTarget.value); markEdited(); } })] }), _jsxs("label", { children: [t('plan.task.description'), _jsx("textarea", { name: "description", value: description, onChange: (event) => { setDescription(event.currentTarget.value); markEdited(); }, rows: 3 })] }), _jsxs("span", { className: css.planGrid, children: [_jsxs("label", { children: [t('plan.task.kind'), _jsx("select", { name: "kind", value: kind, onChange: (event) => { setKind(event.currentTarget.value); markEdited(); }, children: TASK_KIND_OPTIONS.map((candidate) => _jsx("option", { value: candidate, children: taskKindLabel(t, candidate) }, candidate)) })] }), _jsxs("label", { children: [t('plan.task.round'), _jsx("input", { name: "round", type: "number", min: "1", step: "1", value: round, onChange: (event) => { setRound(event.currentTarget.value); markEdited(); } })] })] }), _jsxs("span", { className: css.planGrid, children: [_jsxs("label", { children: [t('plan.task.assignee'), _jsxs("select", { name: "assignee", value: assignee, onChange: (event) => { setAssignee(event.currentTarget.value); markEdited(); }, children: [_jsx("option", { value: "", children: t('plan.task.unassigned') }), team.members.map((member) => _jsx("option", { value: member.name, children: member.name }, member.name))] })] }), _jsxs("label", { children: [t('plan.task.dependencies'), _jsx("input", { name: "dependencies", value: dependencies, onChange: (event) => { setDependencies(event.currentTarget.value); markEdited(); } }), _jsx("small", { children: t('plan.task.dependenciesHint') })] })] }), kind !== 'work' && (_jsxs(_Fragment, { children: [_jsxs("label", { children: [t('plan.task.objective'), _jsx("textarea", { name: "objective", value: objective, onChange: (event) => { setObjective(event.currentTarget.value); markEdited(); }, rows: 2 })] }), _jsxs("span", { className: css.planGrid, children: [_jsxs("label", { children: [t('plan.task.inScope'), _jsx("textarea", { name: "inScope", value: inScope, onChange: (event) => { setInScope(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] }), _jsxs("label", { children: [t('plan.task.outOfScope'), _jsx("textarea", { name: "outOfScope", value: outOfScope, onChange: (event) => { setOutOfScope(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] })] }), _jsxs("span", { className: css.planGrid, children: [_jsxs("label", { children: [t('plan.task.acceptance'), _jsx("textarea", { name: "acceptance", value: acceptance, onChange: (event) => { setAcceptance(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] }), _jsxs("label", { children: [t('plan.task.verify'), _jsx("textarea", { name: "verify", value: verify, onChange: (event) => { setVerify(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] })] }), _jsxs("span", { className: css.planGrid, children: [_jsxs("label", { children: [t('plan.task.deliverables'), _jsx("textarea", { name: "deliverables", value: deliverables, onChange: (event) => { setDeliverables(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] }), _jsxs("label", { children: [t('plan.task.nonGoals'), _jsx("textarea", { name: "nonGoals", value: nonGoals, onChange: (event) => { setNonGoals(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] })] }), _jsxs("label", { children: [t('plan.task.coverageOf'), _jsx("textarea", { name: "coverageOf", value: coverageOf, onChange: (event) => { setCoverageOf(event.currentTarget.value); markEdited(); }, rows: 2 }), _jsx("small", { children: t('plan.task.listHint') })] }), kind === 'review' && (_jsxs("label", { children: [t('plan.task.reviewedTaskId'), _jsx("input", { name: "reviewedTaskId", value: reviewedTaskId, onChange: (event) => { setReviewedTaskId(event.currentTarget.value); markEdited(); } })] })), kind === 'repair' && (_jsxs("span", { className: css.planGrid, children: [_jsxs("label", { children: [t('plan.task.sourceTaskId'), _jsx("input", { name: "sourceTaskId", value: sourceTaskId, onChange: (event) => { setSourceTaskId(event.currentTarget.value); markEdited(); } })] }), _jsxs("label", { children: [t('plan.task.sourceFindingIds'), _jsx("textarea", { name: "sourceFindingIds", value: sourceFindingIds, onChange: (event) => { setSourceFindingIds(event.currentTarget.value); markEdited(); }, rows: 3 }), _jsx("small", { children: t('plan.task.listHint') })] })] }))] }))] }), confirmingRemove && (_jsxs("span", { className: css.planConfirm, role: "alert", children: [_jsx("span", { children: t('plan.removeWarning', { task: task.id }) }), _jsx("button", { type: "button", onClick: () => { setConfirmingRemove(false); }, children: t('plan.cancel') }), _jsx("button", { type: "button", "data-danger": true, "data-confirming": true, onClick: () => { void remove(); }, children: t('plan.removeConfirm') })] })), _jsxs("span", { className: css.planActions, children: [_jsx(Feedback, { value: feedback }), _jsx("button", { type: "button", "data-danger": true, onClick: () => { setConfirmingRemove(true); setFeedback(undefined); }, disabled: busy || confirmingRemove, children: t('plan.remove') }), _jsx("button", { type: "submit", disabled: busy || !dirty || subject.trim() === '' || !roundValid, children: busy ? t('plan.saving') : t('plan.save') })] })] }))] }));
}
export function StagingPlanEditor({ team, modelDirectory, onContinuePlanning, onDiscarded, t }) {
    const membersId = useId();
    const tasksId = useId();
    const [membersOpen, setMembersOpen] = useState(true);
    const [tasksOpen, setTasksOpen] = useState(true);
    const [newTask, setNewTask] = useState('');
    const [busy, setBusy] = useState(false);
    const [discardArmed, setDiscardArmed] = useState(false);
    const [pendingEditors, setPendingEditors] = useState(new Set());
    const [feedback, setFeedback] = useState();
    useDismissSuccess(feedback, setFeedback);
    const dependencyLinks = team.tasks.reduce((total, task) => total + task.dependencies.length, 0);
    const runnable = team.members.length > 0 && team.tasks.length > 0;
    const hasPendingEdits = pendingEditors.size > 0 || newTask.trim() !== '';
    const waitingForFeedback = team.planReviewState === 'awaiting_feedback';
    useEffect(() => {
        void modelDirectory.load().catch(() => undefined);
    }, [modelDirectory]);
    const onPendingChange = useCallback((key, pending) => {
        setPendingEditors((current) => {
            if (pending === current.has(key))
                return current;
            const next = new Set(current);
            if (pending)
                next.add(key);
            else
                next.delete(key);
            return next;
        });
    }, []);
    const addTask = async (event) => {
        event.preventDefault();
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'add_task',
                subject: newTask,
                dependencies: [],
            });
            setNewTask('');
            setFeedback({ tone: 'success', message: t('plan.taskAdded') });
            setTasksOpen(true);
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
        }
        finally {
            setBusy(false);
        }
    };
    const approve = async () => {
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'approve',
            });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
            setBusy(false);
        }
    };
    const continueInChat = async () => {
        if (waitingForFeedback) {
            onContinuePlanning();
            return;
        }
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'continue',
            });
            onContinuePlanning();
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
            setBusy(false);
        }
    };
    const discard = async () => {
        setBusy(true);
        setFeedback(undefined);
        try {
            await mutatePlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'discard',
            });
            onDiscarded();
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('plan.failed', { message: errorMessage(error) }) });
            setBusy(false);
            setDiscardArmed(false);
        }
    };
    return (_jsxs("section", { className: css.planEditor, "data-staging-editor": true, children: [_jsxs("header", { className: css.planHeader, children: [_jsxs("span", { children: [_jsxs("span", { children: [_jsx("strong", { children: t('plan.title') }), _jsx("small", { children: t('plan.readySummary', { members: team.members.length, tasks: team.tasks.length, links: dependencyLinks }) })] }), _jsx("em", { children: t('plan.badge') })] }), _jsx("p", { children: t('plan.description') })] }), _jsxs("ol", { className: css.planFlow, "aria-label": t('plan.flow.aria'), children: [_jsxs("li", { "data-active": true, children: [_jsx("span", { children: "1" }), t('plan.flow.review')] }), _jsxs("li", { children: [_jsx("span", { children: "2" }), t('plan.flow.spawn')] }), _jsxs("li", { children: [_jsx("span", { children: "3" }), t('plan.flow.run')] })] }), _jsxs("section", { className: css.planSection, children: [_jsxs("button", { type: "button", className: css.planSectionToggle, "aria-expanded": membersOpen, "aria-controls": membersId, onClick: () => { setMembersOpen((current) => !current); }, children: [_jsxs("span", { children: [_jsx("strong", { children: t('plan.members.title') }), _jsx("small", { children: t('plan.members.count', { count: team.members.length }) })] }), _jsx(DisclosureChevron, { open: membersOpen })] }), membersOpen && (_jsx("div", { id: membersId, className: css.planList, children: team.members.length === 0
                            ? _jsx("p", { className: css.planEmpty, children: t('plan.members.empty') })
                            : team.members.map((member) => (_jsx(StagedMemberEditor, { team: team, member: member, modelDirectory: modelDirectory, onPendingChange: onPendingChange, t: t }, member.name))) }))] }), _jsxs("section", { className: css.planSection, children: [_jsxs("button", { type: "button", className: css.planSectionToggle, "aria-expanded": tasksOpen, "aria-controls": tasksId, onClick: () => { setTasksOpen((current) => !current); }, children: [_jsxs("span", { children: [_jsx("strong", { children: t('plan.tasks.title') }), _jsx("small", { children: t('plan.tasks.count', { count: team.tasks.length, links: dependencyLinks }) })] }), _jsx(DisclosureChevron, { open: tasksOpen })] }), tasksOpen && (_jsx("div", { id: tasksId, className: css.planList, children: team.tasks.length === 0
                            ? _jsx("p", { className: css.planEmpty, children: t('plan.tasks.empty') })
                            : team.tasks.map((task) => _jsx(StagedTaskEditor, { team: team, task: task, onPendingChange: onPendingChange, t: t }, task.id)) }))] }), _jsxs("form", { className: css.planNewTask, onSubmit: (event) => { void addTask(event); }, children: [_jsxs("label", { children: [_jsx("span", { children: t('plan.newTaskLabel') }), _jsx("input", { name: "newTask", value: newTask, onChange: (event) => { setNewTask(event.currentTarget.value); setFeedback(undefined); }, placeholder: t('plan.newTask'), disabled: busy })] }), _jsx("button", { type: "submit", disabled: busy || newTask.trim() === '', children: busy ? t('plan.adding') : t('plan.addTask') })] }), _jsxs("div", { className: css.planApproveRow, "data-armed": discardArmed || undefined, "data-discard": discardArmed || undefined, "data-review-state": waitingForFeedback ? 'awaiting-feedback' : 'awaiting-review', children: [_jsxs("span", { className: css.planApproveCopy, children: [_jsx("strong", { children: discardArmed
                                    ? t('plan.discardConfirmTitle')
                                    : waitingForFeedback
                                        ? t('plan.feedbackTitle')
                                        : t('plan.approveTitle') }), _jsx("small", { children: discardArmed
                                    ? t('plan.discardWarning')
                                    : waitingForFeedback
                                        ? t('plan.feedbackHint')
                                        : hasPendingEdits
                                            ? t('plan.pendingEdits')
                                            : t('plan.approveHint', { members: team.members.length, tasks: team.tasks.length }) })] }), _jsx(Feedback, { value: feedback }), discardArmed ? (_jsxs("span", { className: css.planApproveActions, children: [_jsx("button", { type: "button", disabled: busy, onClick: () => { setDiscardArmed(false); }, children: t('plan.cancel') }), _jsx("button", { type: "button", "data-plan-discard": true, "data-danger": true, "data-confirming": true, disabled: busy, onClick: () => { void discard(); }, children: busy ? t('plan.discarding') : t('plan.discardConfirm') })] })) : (_jsxs("span", { className: css.planReviewActions, children: [_jsx("button", { type: "button", "data-plan-approve": true, disabled: busy || !runnable || hasPendingEdits, onClick: () => { void approve(); }, children: t('plan.approve') }), _jsxs("span", { className: css.planSecondaryActions, children: [_jsx("button", { type: "button", "data-plan-continue": true, disabled: busy, onClick: () => { void continueInChat(); }, children: t(waitingForFeedback ? 'plan.returnToChat' : 'plan.continue') }), _jsx("button", { type: "button", "data-plan-discard": true, "data-danger": true, disabled: busy, onClick: () => { setDiscardArmed(true); setFeedback(undefined); }, children: t('plan.discard') })] })] }))] })] }));
}
