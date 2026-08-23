export async function loadModelCatalog(fetcher = fetch, timeoutMs = 10_000) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
        const response = await fetcher('/plugins/dsh-agent-teams/models', { signal: abort.signal });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        const models = Array.isArray(body.models) ? body.models : [];
        return models.length === 0
            ? { status: 'empty', models, error: null }
            : { status: 'ready', models, error: null };
    }
    catch (error) {
        const message = abort.signal.aborted
            ? `模型目录请求超过 ${timeoutMs}ms`
            : error instanceof Error ? error.message : String(error);
        return { status: 'error', models: [], error: message };
    }
    finally {
        clearTimeout(timer);
    }
}
