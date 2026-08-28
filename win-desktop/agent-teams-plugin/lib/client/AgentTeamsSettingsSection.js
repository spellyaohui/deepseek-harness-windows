import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { loadModelCatalog } from "./model-catalog.js";
import { TeamProfilesEditor } from "./TeamProfilesEditor.js";
import { planDelegationModeChange, runAgentTeamsSettingsAction, } from "./settings-write.js";
import css from './AgentTeamsSettingsSection.module.css';
const DEFAULT_SETTINGS = { delegationMode: 'teams' };
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
    const settingsReady = snapshot.status === 'ready';
    const writable = settingsReady && snapshot.writable;
    const controlsDisabled = !writable || writeView.status === 'busy';
    const runWrite = useCallback(async (ops) => {
        await runAgentTeamsSettingsAction(writer, ops, setWriteView);
    }, [writer]);
    const runPlan = useCallback(async (plan) => {
        await runWrite(plan.ops);
    }, [runWrite]);
    const setDelegationMode = async (mode) => {
        await runPlan(planDelegationModeChange(mode));
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
                                }, children: t('settings.write.retry') }))] }))] }), _jsxs("section", { className: css.section, "aria-labelledby": "agent-teams-delegation-title", children: [_jsx("h3", { id: "agent-teams-delegation-title", className: css.sectionTitle, children: t('settings.delegation.title') }), _jsx("p", { className: css.help, children: t('settings.delegation.help') }), _jsxs("fieldset", { className: css.choices, disabled: controlsDisabled, children: [_jsx("legend", { className: css.visuallyHidden, children: t('settings.delegation.title') }), ['teams', 'native'].map((mode) => (_jsxs("label", { className: css.choice, children: [_jsx("input", { type: "radio", name: "agent-teams-delegation-mode", value: mode, checked: value.delegationMode === mode, onChange: async () => { await setDelegationMode(mode); } }), _jsxs("span", { children: [_jsx("strong", { children: t(`settings.delegation.${mode}.label`) }), _jsx("small", { children: t(`settings.delegation.${mode}.description`) })] })] }, mode)))] })] }), _jsx(TeamProfilesEditor, { catalog: catalog, onRetryCatalog: () => setCatalogAttempt((attempt) => attempt + 1), t: t, writable: writable })] }));
}
