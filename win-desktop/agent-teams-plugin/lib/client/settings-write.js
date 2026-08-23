const SETTINGS_NAMESPACE = 'agent-teams';
class BoundedCallError extends Error {
    constructor(label, timeoutMs) {
        super(`${label} timed out after ${timeoutMs}ms`);
        this.name = 'BoundedCallError';
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function bounded(promise, label, timeoutMs) {
    return new Promise((resolve, reject) => {
        let open = true;
        const timer = setTimeout(() => {
            if (!open)
                return;
            open = false;
            reject(new BoundedCallError(label, timeoutMs));
        }, timeoutMs);
        void promise.then((value) => {
            if (!open)
                return;
            open = false;
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            if (!open)
                return;
            open = false;
            clearTimeout(timer);
            reject(error);
        });
    });
}
function laterRevision(left, right) {
    if (left === undefined)
        return right;
    if (right === undefined)
        return left;
    return Math.max(left, right);
}
class SerializedAgentTeamsSettingsWriter {
    options;
    tail = Promise.resolve();
    revision;
    uncertain = false;
    generation = 0;
    timeoutMs;
    constructor(options) {
        this.options = options;
        this.revision = options.scope.getSnapshot().revision;
        this.timeoutMs = options.timeoutMs ?? 10_000;
    }
    write(ops) {
        const run = this.tail.then(() => this.perform([...ops]));
        this.tail = run.then(() => undefined, () => undefined);
        return run;
    }
    async perform(ops) {
        if (this.uncertain) {
            const recoveryError = await this.recover();
            if (recoveryError !== null) {
                return { status: 'error', error: `settings recovery failed: ${recoveryError}` };
            }
        }
        this.revision = laterRevision(this.revision, this.options.scope.getSnapshot().revision);
        if (this.revision === undefined) {
            this.uncertain = true;
            return { status: 'error', error: 'settings revision is not ready' };
        }
        const expectedRevision = this.revision;
        const generation = ++this.generation;
        let response;
        try {
            response = await bounded(this.options.api.settings.mutate({
                ns: SETTINGS_NAMESPACE,
                ops: [...ops],
                expectedRevision,
            }), 'settings mutation', this.timeoutMs);
        }
        catch (error) {
            if (generation === this.generation)
                this.generation += 1;
            return this.failAndRecover(errorMessage(error));
        }
        if (!response.result.ok) {
            if (generation === this.generation)
                this.generation += 1;
            return this.failAndRecover(response.result.error.message);
        }
        const next = response.result.value;
        const knownRevision = laterRevision(expectedRevision, laterRevision(this.revision, this.options.scope.getSnapshot().revision)) ?? expectedRevision;
        if (generation !== this.generation
            || next.ns !== SETTINGS_NAMESPACE
            || next.revision < knownRevision) {
            return this.failAndRecover('settings mutation returned a stale or mismatched view');
        }
        this.revision = next.revision;
        this.uncertain = false;
        this.options.describe.acceptView(next);
        return { status: 'ready', error: null };
    }
    async failAndRecover(writeError) {
        this.uncertain = true;
        const recoveryError = await this.recover();
        return {
            status: 'error',
            error: recoveryError === null
                ? writeError
                : `${writeError}; recovery failed: ${recoveryError}`,
        };
    }
    async recover() {
        ++this.generation;
        let response;
        try {
            response = await bounded(this.options.api.settings.describe({}), 'settings recovery', this.timeoutMs);
        }
        catch (error) {
            return errorMessage(error);
        }
        if (!response.result.ok)
            return response.result.error.message;
        const recovered = response.result.value.namespaces.find((entry) => entry.ns === SETTINGS_NAMESPACE);
        if (recovered === undefined)
            return 'agent-teams namespace is unavailable';
        const heldRevision = laterRevision(this.revision, this.options.scope.getSnapshot().revision);
        if (heldRevision === undefined || recovered.revision >= heldRevision) {
            this.options.describe.acceptView(recovered);
            this.revision = recovered.revision;
        }
        else {
            this.revision = heldRevision;
        }
        this.uncertain = false;
        return null;
    }
}
export function createAgentTeamsSettingsWriter(options) {
    return new SerializedAgentTeamsSettingsWriter(options);
}
function set(field, value) {
    return { op: 'set', path: [field], value };
}
function compareIds(left, right) {
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
function supportsEffort(model, effort) {
    return effort !== '' && model?.efforts.some((candidate) => candidate.id === effort) === true;
}
function explicitReset(settings, model) {
    return settings.memberReasoningMode === 'explicit'
        && !supportsEffort(model, settings.memberReasoningEffort)
        ? [
            set('memberReasoningEffort', ''),
            set('memberReasoningMode', 'target-default'),
        ]
        : [];
}
export function planDelegationModeChange(mode) {
    return { ok: true, ops: [set('delegationMode', mode)] };
}
export function planProviderChange(settings, provider, catalog) {
    if (provider === '') {
        const reset = settings.memberReasoningMode === 'explicit'
            ? [set('memberReasoningEffort', ''), set('memberReasoningMode', 'target-default')]
            : [];
        return {
            ok: true,
            ops: [...reset, set('memberModel', ''), set('memberLlmProvider', '')],
        };
    }
    const models = catalog.filter((candidate) => candidate.provider === provider).sort(compareIds);
    const model = models.find((candidate) => candidate.id === settings.memberModel) ?? models[0];
    if (model === undefined)
        return { ok: false, error: 'no-models' };
    return {
        ok: true,
        ops: [
            ...explicitReset(settings, model),
            set('memberModel', model.id),
            set('memberLlmProvider', provider),
        ],
    };
}
export function planModelChange(settings, provider, modelId, catalog) {
    const model = catalog.find((candidate) => candidate.provider === provider && candidate.id === modelId);
    if (model === undefined)
        return { ok: false, error: 'model-unavailable' };
    return {
        ok: true,
        ops: [
            ...explicitReset(settings, model),
            set('memberModel', model.id),
            set('memberLlmProvider', provider),
        ],
    };
}
export function planReasoningModeChange(settings, mode, model) {
    if (mode === 'explicit') {
        if (model === undefined || model.efforts.length === 0)
            return { ok: false, error: 'no-efforts' };
        const effort = model.efforts.find((candidate) => candidate.id === settings.memberReasoningEffort)
            ?? model.efforts.find((candidate) => candidate.id === model.defaultEffort)
            ?? [...model.efforts].sort(compareIds)[0];
        if (effort === undefined)
            return { ok: false, error: 'no-efforts' };
        return {
            ok: true,
            ops: [set('memberReasoningEffort', effort.id), set('memberReasoningMode', 'explicit')],
        };
    }
    return {
        ok: true,
        ops: [set('memberReasoningEffort', ''), set('memberReasoningMode', mode)],
    };
}
export function planReasoningEffortChange(effort, model) {
    if (!supportsEffort(model, effort))
        return { ok: false, error: 'unsupported-effort' };
    return {
        ok: true,
        ops: [set('memberReasoningEffort', effort), set('memberReasoningMode', 'explicit')],
    };
}
export async function runAgentTeamsSettingsAction(writer, ops, publish) {
    const retryOps = [...ops];
    publish({ status: 'busy', ops: retryOps, error: null });
    let result;
    try {
        result = await writer.write(ops);
    }
    catch (error) {
        result = { status: 'error', error: errorMessage(error) };
    }
    finally {
        if (result === undefined)
            result = { status: 'error', error: 'settings write did not settle' };
        publish(result.status === 'ready'
            ? { status: 'idle', ops: null, error: null }
            : { status: 'error', ops: retryOps, error: result.error });
    }
    return result;
}
