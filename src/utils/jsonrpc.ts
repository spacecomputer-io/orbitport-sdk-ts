/**
 * JSON-RPC 2.0 transport for the Orbitport SDK.
 *
 * Pure transport — takes a token (not a getToken callback). Maps HTTP and
 * JSON-RPC error codes to typed OrbitportSDKError instances and preserves the
 * raw RPC code in `error.details.jsonRpcCode` for advanced branching.
 */

import { OrbitportSDKError, ERROR_CODES, createNetworkError } from './errors';
import type { ErrorCode } from './errors';

let nextId = 1;

/**
 * Returns a process-local monotonic JSON-RPC id.
 *
 * JSON-RPC ids only need uniqueness per request/response pair, and we match
 * per-fetch, so this never collides across SDK instances.
 */
export function nextRpcId(): number {
  return nextId++;
}

export interface JsonRpcCallArgs<TParams> {
  url: string;
  method: string;
  params: TParams;
  token: string;
}

export interface JsonRpcCallOptions {
  timeout: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  debug?: boolean;
}

interface JsonRpcEnvelope {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcSuccessResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result: T;
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number | null;
  error: JsonRpcErrorPayload;
}

type JsonRpcResponse<T> = JsonRpcSuccessResponse<T> | JsonRpcErrorResponse;

/**
 * Executes a JSON-RPC 2.0 call.
 */
export async function jsonRpcCall<TResult, TParams = Record<string, unknown>>(
  args: JsonRpcCallArgs<TParams>,
  options: JsonRpcCallOptions,
): Promise<TResult> {
  const envelope: JsonRpcEnvelope = {
    jsonrpc: '2.0',
    id: nextRpcId(),
    method: args.method,
    params: args.params,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  if (options.debug) {
    console.log('[OrbitportSDK] JSON-RPC →', args.url, envelope.method, envelope.id);
  }

  try {
    const response = await fetch(args.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Read the response body so callers see the gateway's error text (e.g.
      // "Request body deserialize error: missing field `Description`"), which
      // is plain text and never reaches the JSON-RPC error path below.
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        bodyText = '';
      }
      if (options.debug && bodyText) {
        console.log('[OrbitportSDK] JSON-RPC ← HTTP', response.status, bodyText);
      }
      throw mapHttpError(response.status, args.url, bodyText);
    }

    let body: JsonRpcResponse<TResult>;
    try {
      body = (await response.json()) as JsonRpcResponse<TResult>;
    } catch {
      throw new OrbitportSDKError(
        'Invalid JSON-RPC response: failed to parse JSON body',
        ERROR_CODES.INVALID_RESPONSE,
        response.status,
      );
    }

    // JSON-RPC 2.0 invariant: `jsonrpc` must be the literal string "2.0".
    if (!body || typeof body !== 'object' || (body as { jsonrpc?: unknown }).jsonrpc !== '2.0') {
      throw new OrbitportSDKError(
        'Invalid JSON-RPC response: missing or wrong "jsonrpc" version',
        ERROR_CODES.INVALID_RESPONSE,
        response.status,
      );
    }

    // Match the response id to our envelope id so a proxy/cache can't replay
    // a stale response. Error responses are allowed to carry id=null (server
    // failed to parse the request and couldn't echo our id back).
    const responseId = (body as { id: number | null }).id;
    const isErrorBody = 'error' in body && body.error;
    if (responseId !== envelope.id && !(isErrorBody && responseId === null)) {
      throw new OrbitportSDKError(
        `Invalid JSON-RPC response: id mismatch (expected ${envelope.id}, got ${String(responseId)})`,
        ERROR_CODES.INVALID_RESPONSE,
        response.status,
      );
    }

    if (isErrorBody) {
      throw mapJsonRpcError((body as JsonRpcErrorResponse).error);
    }

    if (!('result' in body)) {
      throw new OrbitportSDKError(
        'Invalid JSON-RPC response: missing result',
        ERROR_CODES.INVALID_RESPONSE,
        response.status,
      );
    }

    return body.result;
  } catch (error) {
    if (error instanceof OrbitportSDKError) throw error;
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new OrbitportSDKError(
          'JSON-RPC request timeout',
          ERROR_CODES.TIMEOUT,
        );
      }
      throw createNetworkError(error);
    }
    throw new OrbitportSDKError(
      'Unknown error during JSON-RPC request',
      ERROR_CODES.UNKNOWN_ERROR,
      undefined,
      error,
    );
  } finally {
    clearTimeout(timeoutId);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

const MAX_HTTP_BODY_IN_ERROR = 2048;

/**
 * Maps a non-OK HTTP response to a typed OrbitportSDKError.
 *
 * When the server sent a (plain-text) body — e.g. a Warp body-deserialization
 * rejection — it is appended to the message and preserved verbatim in
 * `error.details.httpBody` so callers can react to it programmatically.
 */
function mapHttpError(status: number, url: string, bodyText?: string): OrbitportSDKError {
  const body = (bodyText ?? '').trim();
  const truncated =
    body.length > MAX_HTTP_BODY_IN_ERROR ? `${body.slice(0, MAX_HTTP_BODY_IN_ERROR)}…` : body;
  const suffix = truncated ? `: ${truncated}` : '';
  const details = body ? { httpBody: body } : undefined;

  if (status === 401 || status === 403) {
    return new OrbitportSDKError(
      `JSON-RPC authentication failed (HTTP ${status})${suffix}`,
      ERROR_CODES.AUTH_FAILED,
      status,
      details,
    );
  }
  if (status === 404) {
    return new OrbitportSDKError(
      `JSON-RPC endpoint not found at ${url}${suffix}`,
      ERROR_CODES.API_ERROR,
      status,
      details,
    );
  }
  if (status === 429) {
    return new OrbitportSDKError(
      `JSON-RPC rate limit exceeded${suffix}`,
      ERROR_CODES.RATE_LIMITED,
      status,
      details,
    );
  }
  if (status >= 500) {
    return new OrbitportSDKError(
      `JSON-RPC service unavailable (HTTP ${status})${suffix}`,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      status,
      details,
    );
  }
  return new OrbitportSDKError(
    `JSON-RPC HTTP error ${status}${suffix}`,
    ERROR_CODES.API_ERROR,
    status,
    details,
  );
}

/**
 * Maps a JSON-RPC error payload to an OrbitportSDKError.
 *
 * Preserves the raw RPC code in `error.details.jsonRpcCode` for advanced
 * branching by callers.
 */
export function mapJsonRpcError(err: JsonRpcErrorPayload): OrbitportSDKError {
  let code: ErrorCode = ERROR_CODES.JSON_RPC_ERROR;

  if (err.code === -32700) {
    code = ERROR_CODES.INVALID_RESPONSE;
  } else if (err.code === -32600) {
    code = ERROR_CODES.INVALID_REQUEST;
  } else if (err.code === -32601) {
    code = ERROR_CODES.API_ERROR;
  } else if (err.code === -32602) {
    code = ERROR_CODES.VALIDATION_ERROR;
  } else if (err.code === -32603) {
    code = ERROR_CODES.API_ERROR;
  } else if (err.code <= -32000 && err.code >= -32099) {
    code = ERROR_CODES.KMS_ERROR;
  }

  // Message-pattern hints upgrade the code to something more specific.
  if (/not found/i.test(err.message)) {
    code = ERROR_CODES.KMS_KEY_NOT_FOUND;
  } else if (/disabled|pending/i.test(err.message)) {
    code = ERROR_CODES.KMS_INVALID_KEY_STATE;
  }

  return new OrbitportSDKError(err.message, code, undefined, {
    jsonRpcCode: err.code,
    jsonRpcMessage: err.message,
    jsonRpcData: err.data,
  });
}
