var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { capabilityPatchFromChecks } from "./capability-contract.js";
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
const DEFAULT_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const ONE_BY_ONE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const ONE_BY_ONE_DATA_URL = `data:image/png;base64,${ONE_BY_ONE_PNG}`;
const PROBE_TEXT = 'model capability probe';
const NEVER_ABORTED = new AbortController().signal;
function supportedProtocol(value) {
    return value === 'openai-completions'
        || value === 'openai-responses'
        || value === 'anthropic-messages';
}
function endpointFor(baseURL, protocol) {
    const root = baseURL.trim().replace(/\/+$/, '');
    const path = protocol === 'openai-responses'
        ? '/responses'
        : protocol === 'anthropic-messages' ? '/messages' : '/chat/completions';
    return `${root}${path}`;
}
function headersFor(protocol, apiKey) {
    const headers = {
        'content-type': 'application/json',
    };
    if (apiKey === undefined || apiKey.length === 0)
        return headers;
    if (protocol === 'anthropic-messages') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
    }
    else {
        headers.authorization = `Bearer ${apiKey}`;
    }
    return headers;
}
function check(status, summary, field) {
    return {
        status,
        summary,
        ...field === undefined ? {} : { error: field },
    };
}
function notApplicableChecks() {
    return {
        text: check('not-applicable', 'protocol is not supported by the generic probe'),
        image: check('not-applicable', 'protocol is not supported by the generic probe'),
        reasoning: check('not-applicable', 'protocol is not supported by the generic probe'),
        developer: check('not-applicable', 'protocol is not supported by the generic probe'),
        strict: check('not-applicable', 'protocol is not supported by the generic probe'),
        store: check('not-applicable', 'protocol is not supported by the generic probe'),
        streamingUsage: check('not-applicable', 'protocol is not supported by the generic probe'),
        maxTokens: check('not-applicable', 'protocol is not supported by the generic probe'),
    };
}
function asObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
}
function reasoningEffortCandidates(candidate) {
    const raw = candidate?.['reasoningEfforts'];
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const values = Object.entries(raw)
            .filter(([key, value]) => key !== 'off' && typeof value === 'string' && value.trim().length > 0)
            .map(([, value]) => String(value));
        if (values.length > 0)
            return [...new Set(values)];
    }
    return [...DEFAULT_REASONING_EFFORTS];
}
function requestPayload(protocol, modelId, kind, effort, maxTokensField) {
    if (protocol === 'anthropic-messages') {
        const payload = {
            model: modelId,
            max_tokens: 8,
            messages: [{ role: 'user', content: PROBE_TEXT }],
        };
        if (kind === 'image') {
            payload.messages = [{
                    role: 'user',
                    content: [
                        { type: 'text', text: PROBE_TEXT },
                        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: ONE_BY_ONE_PNG } },
                    ],
                }];
        }
        if (kind === 'developer')
            payload.system = 'developer capability probe';
        if (kind === 'strict') {
            payload.tools = [{
                    name: 'capability_probe',
                    description: 'minimal capability probe',
                    input_schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
                }];
        }
        if (kind === 'streamingUsage')
            payload.stream = true;
        if (maxTokensField === 'max_tokens')
            payload.max_tokens = 8;
        return payload;
    }
    if (protocol === 'openai-responses') {
        const payload = {
            model: modelId,
            input: PROBE_TEXT,
            max_output_tokens: 8,
        };
        if (kind === 'image') {
            payload.input = [{
                    role: 'user',
                    content: [
                        { type: 'input_text', text: PROBE_TEXT },
                        { type: 'input_image', image_url: ONE_BY_ONE_DATA_URL },
                    ],
                }];
        }
        if (kind === 'developer') {
            payload.input = [
                { role: 'developer', content: 'developer capability probe' },
                { role: 'user', content: PROBE_TEXT },
            ];
        }
        if (kind === 'strict') {
            payload.tools = [{
                    type: 'function',
                    name: 'capability_probe',
                    description: 'minimal capability probe',
                    parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
                    strict: true,
                }];
        }
        if (kind === 'store')
            payload.store = true;
        if (kind === 'streamingUsage')
            payload.stream = true;
        if (kind === 'reasoning' && effort !== undefined)
            payload.reasoning = { effort };
        if (maxTokensField === 'max_output_tokens')
            payload.max_output_tokens = 8;
        return payload;
    }
    const payload = {
        model: modelId,
        messages: [{ role: 'user', content: PROBE_TEXT }],
        max_tokens: 8,
    };
    if (kind === 'image') {
        payload.messages = [{
                role: 'user',
                content: [
                    { type: 'text', text: PROBE_TEXT },
                    { type: 'image_url', image_url: { url: ONE_BY_ONE_DATA_URL } },
                ],
            }];
    }
    if (kind === 'developer')
        payload.messages = [
            { role: 'developer', content: 'developer capability probe' },
            { role: 'user', content: PROBE_TEXT },
        ];
    if (kind === 'strict') {
        payload.tools = [{
                type: 'function',
                function: {
                    name: 'capability_probe',
                    description: 'minimal capability probe',
                    parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
                    strict: true,
                },
            }];
    }
    if (kind === 'store')
        payload.store = true;
    if (kind === 'streamingUsage') {
        payload.stream = true;
        payload.stream_options = { include_usage: true };
    }
    if (kind === 'reasoning' && effort !== undefined)
        payload.reasoning_effort = effort;
    if (maxTokensField === 'max_tokens')
        payload.max_tokens = 8;
    if (maxTokensField === 'max_completion_tokens')
        payload.max_completion_tokens = 8;
    return payload;
}
function isAbortError(error) {
    return typeof error === 'object'
        && error !== null
        && 'name' in error
        && error.name === 'AbortError';
}
async function attempt(fetcher, url, headers, payload, signal, field) {
    if (signal.aborted) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    try {
        const response = await fetcher(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal,
        });
        if (response.status >= 200 && response.status < 300)
            return { status: 'supported', field };
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
            return { status: 'unsupported', field };
        }
        return { status: 'inconclusive', field };
    }
    catch (error) {
        if (signal.aborted || isAbortError(error))
            throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        return { status: 'inconclusive', field };
    }
}
function checkFromAttempt(result, summary) {
    return check(result.status, summary, result.field);
}
function reasoningCheck(attempts, omitted, none) {
    const efforts = {};
    for (const { effort, result } of attempts) {
        if (result.status === 'supported')
            efforts[effort] = effort;
    }
    const anySupported = Object.keys(efforts).length > 0;
    const allUnsupported = attempts.length > 0 && attempts.every(({ result }) => result.status === 'unsupported');
    const status = anySupported || omitted.status === 'supported'
        ? 'supported'
        : allUnsupported && none.status === 'unsupported' ? 'unsupported' : 'inconclusive';
    return {
        status,
        summary: anySupported ? 'one or more reasoning efforts accepted' : 'reasoning effort results were inconclusive',
        efforts,
        ...allUnsupported ? { allEffortsUnsupported: true } : {},
        ...none.status === 'unsupported' ? { noneRejected: true } : {},
        ...omitted.status === 'supported' ? { omittedReasoningSupported: true } : {},
    };
}
/** Execute the bounded, provider-neutral capability matrix for one model. */
export async function probeModelCapabilities(request, dependencies = {}) {
    const protocol = request.protocol.trim();
    if (!supportedProtocol(protocol)) {
        const checks = notApplicableChecks();
        return { modelId: request.modelId, protocol, checks, patch: {} };
    }
    const signal = request.signal ?? NEVER_ABORTED;
    const fetcher = dependencies.fetch ?? globalThis.fetch;
    const apiKey = request.apiKey?.trim().length
        ? request.apiKey.trim()
        : request.credentialRef === undefined
            ? undefined
            : await dependencies.resolveCredential?.(request.credentialRef);
    const url = endpointFor(request.baseURL, protocol);
    const headers = headersFor(protocol, apiKey);
    const checks = {};
    const text = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'text'), signal);
    checks.text = checkFromAttempt(text, 'minimal text request');
    const image = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'image'), signal);
    checks.image = checkFromAttempt(image, 'fixed 1x1 image request');
    if (protocol === 'anthropic-messages') {
        checks.reasoning = check('not-applicable', 'generic Anthropic reasoning levels are not expressed by this probe');
    }
    else {
        const effortResults = [];
        for (const effort of reasoningEffortCandidates(request.candidate)) {
            const result = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'reasoning', effort), signal);
            effortResults.push({ effort, result });
        }
        const none = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'reasoning', 'none'), signal);
        checks.reasoning = reasoningCheck(effortResults, text, none);
    }
    const developer = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'developer'), signal);
    checks.developer = checkFromAttempt(developer, 'developer/system role request');
    const strict = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'strict'), signal);
    checks.strict = checkFromAttempt(strict, 'strict function tool request');
    const store = protocol === 'anthropic-messages'
        ? { status: 'not-applicable' }
        : await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'store'), signal);
    checks.store = store.status === 'not-applicable'
        ? check('not-applicable', 'store is not part of this protocol')
        : checkFromAttempt(store, 'store request');
    const streamingUsage = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'streamingUsage'), signal);
    checks.streamingUsage = checkFromAttempt(streamingUsage, 'streaming usage request');
    let maxTokens;
    if (protocol === 'openai-responses') {
        maxTokens = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'maxTokens', undefined, 'max_output_tokens'), signal, 'max_output_tokens');
    }
    else if (protocol === 'anthropic-messages') {
        maxTokens = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'maxTokens', undefined, 'max_tokens'), signal, 'max_tokens');
    }
    else {
        const maxTokensResult = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'maxTokens', undefined, 'max_tokens'), signal, 'max_tokens');
        const maxCompletionResult = await attempt(fetcher, url, headers, requestPayload(protocol, request.modelId, 'maxTokens', undefined, 'max_completion_tokens'), signal, 'max_completion_tokens');
        maxTokens = maxTokensResult.status === 'supported' && maxCompletionResult.status !== 'supported'
            ? maxTokensResult
            : maxCompletionResult.status === 'supported' && maxTokensResult.status !== 'supported'
                ? maxCompletionResult
                : { status: maxTokensResult.status === 'supported' || maxCompletionResult.status === 'supported' ? 'supported' : maxTokensResult.status, field: undefined };
    }
    checks.maxTokens = checkFromAttempt(maxTokens, maxTokens.field === undefined ? 'output token field is ambiguous' : `accepted ${maxTokens.field}`);
    const patch = capabilityPatchFromChecks(checks);
    return { modelId: request.modelId, protocol, checks, patch };
}
/** Build the Host handler so credential lookup stays injectable and testable. */
export function createCapabilityProbeHandler(dependencies = {}) {
    return async (request, signal) => {
        const supplied = request.apiKey?.trim();
        const apiKey = supplied === undefined || supplied.length === 0
            ? request.credentialRef === undefined
                ? undefined
                : await dependencies.resolveCredential?.(request.credentialRef)
            : supplied;
        return probeModelCapabilities({ ...request, apiKey, signal }, { fetch: dependencies.fetch });
    };
}
/** Host service exposing the one provider-neutral probe method to the Models page. */
let ModelCapabilityProbeService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _probe_decorators;
    return class ModelCapabilityProbeService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _probe_decorators = [Remote('probe')];
            __esDecorate(this, null, _probe_decorators, { kind: "method", name: "probe", static: false, private: false, access: { has: obj => "probe" in obj, get: obj => obj.probe }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['credentials'];
        constructor(ctx) {
            super(ctx, 'modelCapabilityProbe', { namespace: 'model-capabilities' });
            __runInitializers(this, _instanceExtraInitializers);
        }
        async probe(request, signal) {
            const handler = createCapabilityProbeHandler({
                fetch: globalThis.fetch,
                resolveCredential: async (reference) => {
                    const resolved = await this.ctx.credentials.resolve(reference);
                    return resolved?.value;
                },
            });
            return handler(request, signal);
        }
    };
})();
export { ModelCapabilityProbeService };
