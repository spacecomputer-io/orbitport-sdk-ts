/**
 * JSON-RPC 2.0 transport for the Orbitport SDK.
 *
 * Pure transport — takes a token (not a getToken callback). Maps HTTP and
 * JSON-RPC error codes to typed OrbitportSDKError instances and preserves the
 * raw RPC code in `error.details.jsonRpcCode` so service layers can branch
 * (e.g., KMS getCapabilities falls back to a static list on -32601).
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
      throw mapHttpError(response.status, args.url);
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

    if ('error' in body && body.error) {
      throw mapJsonRpcError(body.error);
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

function mapHttpError(status: number, url: string): OrbitportSDKError {
  if (status === 401 || status === 403) {
    return new OrbitportSDKError(
      `JSON-RPC authentication failed (HTTP ${status})`,
      ERROR_CODES.AUTH_FAILED,
      status,
    );
  }
  if (status === 404) {
    return new OrbitportSDKError(
      `KMS JSON-RPC route not deployed at ${url}`,
      ERROR_CODES.API_ERROR,
      status,
    );
  }
  if (status === 429) {
    return new OrbitportSDKError(
      'JSON-RPC rate limit exceeded',
      ERROR_CODES.RATE_LIMITED,
      status,
    );
  }
  if (status >= 500) {
    return new OrbitportSDKError(
      `JSON-RPC service unavailable (HTTP ${status})`,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      status,
    );
  }
  return new OrbitportSDKError(
    `JSON-RPC HTTP error ${status}`,
    ERROR_CODES.API_ERROR,
    status,
  );
}

/**
 * Maps a JSON-RPC error payload to an OrbitportSDKError.
 *
 * Always preserves the raw RPC code in `error.details.jsonRpcCode` so service
 * layers can branch (e.g., -32601 → static capabilities fallback).
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
