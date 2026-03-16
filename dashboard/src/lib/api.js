/**
 * API client for PBR Dashboard.
 * Uses window.location.origin as base URL so it works with both
 * the Vite dev proxy and production builds served by Express.
 */

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

/**
 * Fetch wrapper that prepends /api, sets JSON headers, and throws on non-OK responses.
 * @param {string} endpoint - API path (with or without /api prefix)
 * @param {RequestInit} options - Standard fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiFetch(endpoint, options = {}) {
  const path = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = response.statusText || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

/**
 * PUT helper — serialises body as JSON and delegates to apiFetch.
 * @param {string} endpoint - API path
 * @param {any} body - Object to serialise
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiPut(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * POST helper — serialises body as JSON and delegates to apiFetch.
 * @param {string} endpoint - API path
 * @param {any} body - Object to serialise
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiPost(endpoint, body) {
  return apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * DELETE helper — delegates to apiFetch with optional JSON body.
 * @param {string} endpoint - API path
 * @param {any} [body] - Optional object to serialise
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiDelete(endpoint, body) {
  const options = { method: 'DELETE' };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  return apiFetch(endpoint, options);
}

/**
 * PUT helper with custom headers and conflict-aware response handling.
 * On 409 (conflict): returns { conflict: true, currentMtime } without throwing.
 * On success: returns { conflict: false, ...parsedBody }.
 * On other errors: throws as usual.
 * @param {string} endpoint - API path
 * @param {any} body - Object to serialise
 * @param {Record<string, string>} headers - Additional headers to include
 * @returns {Promise<{ conflict: boolean, currentMtime?: number } & Record<string, any>>}
 */
export async function apiPutWithHeaders(endpoint, body, headers = {}) {
  const path = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 409) {
    return { conflict: true, currentMtime: data.currentMtime };
  }

  if (!response.ok) {
    throw new Error(data.error || response.statusText || `HTTP ${response.status}`);
  }

  return { conflict: false, ...data };
}

export { API_BASE };
export default apiFetch;
