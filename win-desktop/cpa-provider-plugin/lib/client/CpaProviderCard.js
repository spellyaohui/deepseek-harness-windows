import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { mergeCpaCandidates } from "../profile.js";
import { applyCapacityDrafts, capacityDraftsFromModels, mergeCapacityDrafts, } from "./capacity.js";
import { createCpaController } from "./controller.js";
import { cpaSettingsView } from "./view-model.js";
import styles from './CpaProviderCard.module.css';
export function CpaProviderCard(props) {
    const { api, controller, useSnapshot, cpaT, cardName } = props;
    const snapshot = useSnapshot(state => state);
    const view = cpaSettingsView(snapshot);
    const cpa = useMemo(() => createCpaController(api), [api]);
    const initialized = useRef(false);
    const [baseURL, setBaseURL] = useState('');
    const [token, setToken] = useState('');
    const [models, setModels] = useState([]);
    const [capacities, setCapacities] = useState(new Map());
    const [operation, setOperation] = useState({ kind: 'idle' });
    const [profileLocked, setProfileLocked] = useState(false);
    useEffect(() => {
        if (initialized.current || view.status !== 'ready')
            return;
        initialized.current = true;
        setBaseURL(view.baseURL);
        setModels(view.models);
        setCapacities(capacityDraftsFromModels(view.models));
    }, [view]);
    const busy = operation.kind === 'discovering'
        || operation.kind === 'saving-profile'
        || operation.kind === 'saving-credential';
    const selectedCount = models.filter(model => model.selected !== false).length;
    const tokenAvailable = token.trim() !== '' || view.credentialConfigured;
    const editable = view.writable && !busy;
    const canDiscover = editable && !profileLocked && baseURL.trim() !== '' && tokenAvailable;
    const canApply = editable && baseURL.trim() !== '' && tokenAvailable && selectedCount > 0;
    const discover = async () => {
        setOperation({ kind: 'discovering' });
        try {
            const found = await cpa.discover({ baseURL, token });
            setModels(current => mergeCpaCandidates(current, found));
            setCapacities(current => mergeCapacityDrafts(current, found));
            setOperation({ kind: 'idle' });
        }
        catch (error) {
            setOperation({
                kind: 'error',
                stage: 'discovery',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
    const save = async () => {
        if (view.revision === undefined)
            return;
        const parsed = applyCapacityDrafts(models, capacities);
        if (!parsed.ok) {
            const field = cpaT(parsed.field === 'contextWindow' ? 'modelContextWindow' : 'modelMaxTokens');
            setOperation({
                kind: 'error',
                stage: 'profile',
                message: `${parsed.modelId}: ${field} ${cpaT('capacityInvalid')}`,
            });
            return;
        }
        const result = await cpa.save({ baseURL, token, models: parsed.models }, view.revision, (stage) => {
            setOperation({ kind: stage === 'profile' ? 'saving-profile' : 'saving-credential' });
        });
        if (!result.ok) {
            if (result.stage === 'credential')
                setProfileLocked(true);
            setOperation({ kind: 'error', stage: result.stage, message: result.message });
            return;
        }
        setProfileLocked(false);
        setToken('');
        setOperation({ kind: 'saved' });
        await controller.load();
    };
    const toggleModel = (id) => {
        setModels(current => current.map(model => (model.id === id ? { ...model, selected: model.selected === false } : model)));
    };
    const editCapacity = (id, field, value) => {
        setCapacities(current => {
            const next = new Map(current);
            const draft = next.get(id) ?? { contextWindow: '', maxTokens: '' };
            next.set(id, { ...draft, [field]: value });
            return next;
        });
    };
    if (view.status === 'idle' || view.status === 'loading') {
        return _jsx("section", { className: styles['card'], children: _jsx("p", { role: "status", children: cpaT('loading') }) });
    }
    if (view.status === 'error' || view.revision === undefined) {
        return _jsx("section", { className: styles['card'], children: _jsx("p", { role: "alert", children: cpaT('unavailable') }) });
    }
    const validation = baseURL.trim() === '' ? cpaT('addressRequired')
        : !tokenAvailable ? cpaT('tokenRequired')
            : selectedCount === 0 ? cpaT('modelRequired') : undefined;
    const operationText = operation.kind === 'discovering' ? cpaT('fetchingModels')
        : operation.kind === 'saving-profile' ? cpaT('savingProfile')
            : operation.kind === 'saving-credential' ? cpaT('savingCredential')
                : operation.kind === 'saved' ? cpaT('saved') : undefined;
    return (_jsxs("section", { className: styles['card'], "aria-busy": busy, "aria-labelledby": "cpa-provider-title", children: [_jsxs("header", { className: styles['header'], children: [_jsxs("div", { children: [_jsx("h3", { id: "cpa-provider-title", className: styles['title'], children: cardName }), _jsx("p", { className: styles['intro'], children: cpaT('intro') })] }), _jsxs("span", { className: styles['credential'], children: [_jsx("span", { className: view.credentialConfigured ? styles['dotReady'] : styles['dotMissing'], "aria-hidden": "true" }), cpaT(view.credentialConfigured ? 'credentialConfigured' : 'credentialMissing')] })] }), !view.writable ? _jsx("p", { className: styles['notice'], children: cpaT('readOnly') }) : null, _jsxs("div", { className: styles['fields'], children: [_jsxs("label", { className: styles['field'], htmlFor: "cpa-base-url", children: [_jsx("span", { children: cpaT('apiAddress') }), _jsx("input", { id: "cpa-base-url", className: styles['input'], value: baseURL, placeholder: cpaT('apiPlaceholder'), disabled: !editable || profileLocked, onChange: event => { setBaseURL(event.currentTarget.value); } })] }), _jsxs("label", { className: styles['field'], htmlFor: "cpa-token", children: [_jsx("span", { children: cpaT('token') }), _jsx("input", { id: "cpa-token", className: styles['input'], type: "password", autoComplete: "off", value: token, placeholder: cpaT('tokenPlaceholder'), disabled: !editable, onChange: event => { setToken(event.currentTarget.value); } })] })] }), _jsxs("div", { className: styles['modelHeader'], children: [_jsx("span", { children: cpaT('models') }), _jsxs("div", { className: styles['actions'], children: [_jsx("button", { type: "button", className: styles['linkButton'], disabled: !canDiscover, onClick: () => { void discover(); }, children: operation.kind === 'discovering' ? cpaT('fetchingModels') : cpaT('fetchModels') }), _jsx("button", { type: "button", className: styles['linkButton'], disabled: !editable || profileLocked || models.length === 0, onClick: () => { setModels(current => current.map(model => ({ ...model, selected: true }))); }, children: cpaT('selectAll') }), _jsx("button", { type: "button", className: styles['linkButton'], disabled: !editable || profileLocked || models.length === 0, onClick: () => { setModels(current => current.map(model => ({ ...model, selected: false }))); }, children: cpaT('clearAll') })] })] }), models.length === 0
                ? _jsx("p", { className: styles['empty'], children: cpaT('emptyModels') })
                : (_jsx("ul", { className: styles['models'], children: models.map(model => (_jsx("li", { children: _jsxs("div", { className: styles['model'], children: [_jsxs("label", { className: styles['modelIdentity'], children: [_jsx("input", { type: "checkbox", checked: model.selected !== false, disabled: !editable || profileLocked, onChange: () => { toggleModel(model.id); } }), _jsx("span", { children: model.name || model.id }), _jsx("code", { children: model.id })] }), _jsxs("div", { className: styles['modelCapacities'], children: [_jsxs("label", { className: styles['capacityField'], children: [_jsx("span", { children: cpaT('modelContextWindow') }), _jsx("input", { className: styles['capacityInput'], type: "text", inputMode: "numeric", value: capacities.get(model.id)?.contextWindow ?? '', disabled: !editable || profileLocked, onChange: event => { editCapacity(model.id, 'contextWindow', event.currentTarget.value); } })] }), _jsxs("label", { className: styles['capacityField'], children: [_jsx("span", { children: cpaT('modelMaxTokens') }), _jsx("input", { className: styles['capacityInput'], type: "text", inputMode: "numeric", value: capacities.get(model.id)?.maxTokens ?? '', disabled: !editable || profileLocked, onChange: event => { editCapacity(model.id, 'maxTokens', event.currentTarget.value); } })] })] })] }) }, model.id))) })), _jsx("p", { className: styles['help'], children: cpaT('reasoningHelp') }), operation.kind === 'error' ? _jsx("p", { className: styles['error'], role: "alert", children: operation.message }) : null, operationText === undefined ? null : _jsx("p", { className: styles['status'], role: "status", "aria-live": "polite", children: operationText }), _jsxs("footer", { className: styles['footer'], children: [validation === undefined ? null : _jsx("span", { className: styles['validation'], children: validation }), _jsx("button", { type: "button", className: styles['primaryButton'], disabled: !canApply, onClick: () => { void save(); }, children: operation.kind === 'error' ? cpaT('retry') : cpaT('apply') })] })] }));
}
