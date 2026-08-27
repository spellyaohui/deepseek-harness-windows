import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { loadModelCatalog } from "./model-catalog.js";
import { TeamProfilesEditor } from "./TeamProfilesEditor.js";
import { planDelegationModeChange, planModelChange, planProviderChange, planReasoningEffortChange, planReasoningModeChange, runAgentTeamsSettingsAction, } from "./settings-write.js";
import css from './AgentTeamsSettingsSection.module.css';
const SETTINGS_PLAN_ERROR_KEY = {
    'model-unavailable': 'settings.write.modelUnavailable',
    'no-efforts': 'settings.write.noEfforts',
    'no-models': 'settings.write.noModels',
    'unsupported-effort': 'settings.write.unsupportedEffort',
};
const DEFAULT_SETTINGS = {
    delegationMode: 'teams',
    memberLlmProvider: '',
    memberModel: '',
    memberReasoningMode: 'target-default',
    memberReasoningEffort: '',
    migrationVersion: 0,
};
function supportsEffort(model, effort) {
    return effort === '' || model?.efforts.some((candidate) => candidate.id === effort) === true;
}
export function AgentTeamsSettingsSection({ settings, writer, t, }) {
    const subscribe = useCallback((listener) => settings.subscribe(listener), [settings]);
    const getSnapshot = useCallback(() => settings.getSnapshot(), [settings]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const value = snapshot.value ?? DEFAULT_SETTINGS;
    const [catalogAttempt, setCatalogAttempt] = useState(0);
    const [catalog, setCatalog] = useState({
        status: 'loading', models: [], error: null,
    });
    const [writeView, setWriteView] = useState({
        status: 'idle', ops: null, error: null,
    });
    useEffect(() => {
        let active = true;
        setCatalog({ status: 'loading', models: [], error: null });
        void loadModelCatalog().then((next) => {
            if (active)
                setCatalog(next);
        });
        return () => { active = false; };
    }, [catalogAttempt]);
    const providers = useMemo(() => [...new Set(catalog.models.map((model) => model.provider))], [catalog.models]);
    const providerModels = useMemo(() => catalog.models.filter((model) => model.provider === value.memberLlmProvider), [catalog.models, value.memberLlmProvider]);
    const selectedModel = catalog.models.find((model) => (model.provider === value.memberLlmProvider && model.id === value.memberModel));
    const settingsReady = snapshot.status === 'ready';
    const writable = settingsReady && snapshot.writable;
    const controlsDisabled = !writable || writeView.status === 'busy';
    const catalogReady = catalog.status === 'ready';
    const runWrite = useCallback(async (ops) => {
        await runAgentTeamsSettingsAction(writer, ops, setWriteView);
    }, [writer]);
    const planErrorCopy = useCallback((error) => {
        return t(SETTINGS_PLAN_ERROR_KEY[error]);
    }, [t]);
    const runPlan = useCallback(async (plan) => {
        if (!plan.ok) {
            setWriteView({ status: 'error', ops: null, error: planErrorCopy(plan.error) });
            return;
        }
        await runWrite(plan.ops);
    }, [planErrorCopy, runWrite]);
    const setDelegationMode = async (mode) => {
        await runPlan(planDelegationModeChange(mode));
    };
    const setProvider = async (provider) => {
        await runPlan(planProviderChange(value, provider, catalog.models));
    };
    const setModel = async (modelId) => {
        await runPlan(planModelChange(value, value.memberLlmProvider, modelId, catalog.models));
    };
    const setReasoningMode = async (mode) => {
        if (mode === value.memberReasoningMode)
            return;
        await runPlan(planReasoningModeChange(value, mode, selectedModel));
    };
    const setReasoningEffort = async (effort) => {
        await runPlan(planReasoningEffortChange(effort, selectedModel));
    };
    const statusCopy = snapshot.status === 'loading'
        ? t('settings.state.loading')
        : snapshot.status === 'unavailable'
            ? t('settings.state.unavailable')
            : !snapshot.writable ? t('settings.state.readOnly') : null;
    const visibleWriteError = writeView.status === 'error'
        && writeView.error === 'settings revision is not ready'
        ? t('settings.write.noRevision')
        : writeView.status === 'error' ? writeView.error : null;
    return (_jsxs("div", { className: css.root, "aria-busy": snapshot.status === 'loading' || catalog.status === 'loading' || writeView.status === 'busy', children: [_jsxs("header", { className: css.header, children: [_jsx("h2", { className: css.pageTitle, children: t('settings.title') }), _jsx("p", { className: css.intro, children: t('settings.intro') }), statusCopy !== null && (_jsx("p", { className: css.settingsStatus, role: "status", "aria-live": "polite", children: statusCopy })), writeView.status === 'busy' && (_jsx("p", { className: css.settingsStatus, role: "status", "aria-live": "polite", children: t('settings.write.saving') })), writeView.status === 'error' && (_jsxs("div", { className: css.writeError, role: "alert", children: [_jsx("span", { children: t('settings.write.error', { message: visibleWriteError ?? writeView.error }) }), writeView.ops !== null && (_jsx(Button, { type: "button", variant: "outline", size: "sm", disabled: !writable, onClick: async () => {
                                    if (writeView.ops !== null)
                                        await runWrite(writeView.ops);
                                }, children: t('settings.write.retry') }))] }))] }), _jsxs("section", { className: css.section, "aria-labelledby": "agent-teams-delegation-title", children: [_jsx("h3", { id: "agent-teams-delegation-title", className: css.sectionTitle, children: t('settings.delegation.title') }), _jsx("p", { className: css.help, children: t('settings.delegation.help') }), _jsxs("fieldset", { className: css.choices, disabled: controlsDisabled, children: [_jsx("legend", { className: css.visuallyHidden, children: t('settings.delegation.title') }), ['teams', 'native'].map((mode) => (_jsxs("label", { className: css.choice, children: [_jsx("input", { type: "radio", name: "agent-teams-delegation-mode", value: mode, checked: value.delegationMode === mode, onChange: async () => { await setDelegationMode(mode); } }), _jsxs("span", { children: [_jsx("strong", { children: t(`settings.delegation.${mode}.label`) }), _jsx("small", { children: t(`settings.delegation.${mode}.description`) })] })] }, mode)))] })] }), _jsxs("section", { className: css.section, "aria-labelledby": "agent-teams-model-title", children: [_jsx("h3", { id: "agent-teams-model-title", className: css.sectionTitle, children: t('settings.model.title') }), _jsx("p", { className: css.help, children: t('settings.model.help') }), catalog.status === 'loading' && (_jsx("p", { className: css.catalogStatus, role: "status", "aria-live": "polite", children: t('settings.catalog.loading') })), catalog.status === 'empty' && (_jsx("p", { className: css.catalogStatus, role: "status", children: t('settings.catalog.empty') })), catalog.status === 'error' && (_jsxs("div", { className: css.catalogError, role: "alert", children: [_jsx("span", { children: t('settings.catalog.error', { message: catalog.error }) }), _jsx(Button, { type: "button", variant: "outline", size: "sm", onClick: () => setCatalogAttempt((attempt) => attempt + 1), children: t('settings.catalog.retry') })] })), _jsxs("div", { className: css.fields, children: [_jsxs("label", { className: css.field, htmlFor: "agent-teams-member-provider", children: [_jsx("span", { children: t('settings.model.provider') }), _jsxs("select", { id: "agent-teams-member-provider", value: value.memberLlmProvider, disabled: controlsDisabled || !catalogReady, onChange: async (event) => { await setProvider(event.currentTarget.value); }, children: [_jsx("option", { value: "", children: t('settings.model.followCaptain') }), value.memberLlmProvider !== '' && !providers.includes(value.memberLlmProvider) && (_jsx("option", { value: value.memberLlmProvider, children: t('settings.model.unavailable', { value: value.memberLlmProvider }) })), providers.map((provider) => _jsx("option", { value: provider, children: provider }, provider))] })] }), _jsxs("label", { className: css.field, htmlFor: "agent-teams-member-model", children: [_jsx("span", { children: t('settings.model.model') }), _jsxs("select", { id: "agent-teams-member-model", value: value.memberModel, disabled: controlsDisabled || !catalogReady || value.memberLlmProvider === '', onChange: async (event) => { await setModel(event.currentTarget.value); }, children: [value.memberLlmProvider === '' && (_jsx("option", { value: "", children: t('settings.model.followCaptain') })), value.memberModel !== '' && !providerModels.some((model) => model.id === value.memberModel) && (_jsx("option", { value: value.memberModel, children: t('settings.model.unavailable', { value: value.memberModel }) })), providerModels.map((model) => (_jsx("option", { value: model.id, children: model.name || model.id }, model.id)))] })] })] })] }), _jsxs("section", { className: css.section, "aria-labelledby": "agent-teams-reasoning-title", children: [_jsx("h3", { id: "agent-teams-reasoning-title", className: css.sectionTitle, children: t('settings.reasoning.title') }), _jsxs("fieldset", { className: css.choices, disabled: controlsDisabled, children: [_jsx("legend", { className: css.visuallyHidden, children: t('settings.reasoning.title') }), ['target-default', 'route-aware', 'explicit'].map((mode) => (_jsxs("label", { className: `${css.choice} ${mode === 'explicit' && (selectedModel?.efforts.length ?? 0) === 0
                                    ? css.choiceDisabled
                                    : ''}`, children: [_jsx("input", { type: "radio", name: "agent-teams-reasoning-mode", value: mode, checked: value.memberReasoningMode === mode, disabled: mode === 'explicit' && (selectedModel?.efforts.length ?? 0) === 0, onChange: async () => { await setReasoningMode(mode); } }), _jsxs("span", { children: [_jsx("strong", { children: t(`settings.reasoning.${mode}.label`) }), _jsx("small", { children: t(`settings.reasoning.${mode}.description`) })] })] }, mode)))] }), _jsxs("label", { className: css.field, htmlFor: "agent-teams-member-effort", children: [_jsx("span", { children: t('settings.reasoning.effort') }), _jsx("select", { id: "agent-teams-member-effort", value: value.memberReasoningEffort, disabled: controlsDisabled
                                    || value.memberReasoningMode !== 'explicit'
                                    || (selectedModel?.efforts.length ?? 0) === 0, onChange: async (event) => { await setReasoningEffort(event.currentTarget.value); }, children: selectedModel?.efforts.length
                                    ? _jsxs(_Fragment, { children: [!supportsEffort(selectedModel, value.memberReasoningEffort) && (_jsx("option", { value: value.memberReasoningEffort, disabled: true, children: t('settings.reasoning.unsupportedEffort', { effort: value.memberReasoningEffort }) })), selectedModel.efforts.map((effort) => (_jsx("option", { value: effort.id, children: effort.name }, effort.id)))] })
                                    : _jsx("option", { value: "", children: t('settings.reasoning.noEfforts') }) })] })] }), _jsx(TeamProfilesEditor, { catalog: catalog.models, t: t, writable: writable }), _jsxs("section", { className: css.section, "aria-labelledby": "agent-teams-scope-title", children: [_jsx("h3", { id: "agent-teams-scope-title", className: css.sectionTitle, children: t('settings.scope.title') }), _jsx("p", { className: css.help, children: t('settings.scope.description') })] })] }));
}
