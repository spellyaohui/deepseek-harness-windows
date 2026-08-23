/** Normalize one CPA endpoint to the OpenAI-compatible `/v1` API root. */
export function normalizeCpaBaseURL(raw) {
    const input = raw.trim();
    if (input === '')
        throw new Error('CPA API address is required');
    let url;
    try {
        url = new URL(input);
    }
    catch {
        throw new Error('CPA API address must be a valid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('CPA API address must use http or https');
    }
    if (url.username !== '' || url.password !== '') {
        throw new Error('CPA API address must not contain embedded credentials');
    }
    if (url.search !== '')
        throw new Error('CPA API address must not contain a query string');
    if (url.hash !== '')
        throw new Error('CPA API address must not contain a fragment');
    const trimmedPath = url.pathname.replace(/\/+$/, '');
    url.pathname = /\/v1$/i.test(trimmedPath) ? trimmedPath : `${trimmedPath}/v1`;
    return url.toString().replace(/\/$/, '');
}
