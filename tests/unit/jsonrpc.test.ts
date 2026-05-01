import { jsonRpcCall, mapJsonRpcError, nextRpcId } from '../../src/utils/jsonrpc';
import { OrbitportSDKError, ERROR_CODES } from '../../src/utils/errors';

global.fetch = jest.fn();

const URL = 'https://api.example.com/api/v1/rpc';

function ok(result: unknown, id = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id, result }),
  } as unknown as Response;
}

function rpcErr(error: { code: number; message: string; data?: unknown }, id = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id, error }),
  } as unknown as Response;
}

function http(status: number, body: unknown = {}) {
  return {
    ok: false,
    status,
    statusText: 'err',
    json: async () => body,
  } as unknown as Response;
}

describe('jsonRpcCall — envelope and headers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds a JSON-RPC 2.0 envelope and sets bearer auth', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(ok({ ping: 'pong' }));

    await jsonRpcCall(
      { url: URL, method: 'kms.Ping', params: { x: 1 }, token: 'abc' },
      { timeout: 1000 },
    );

    const [calledUrl, init] = (fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer abc');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('kms.Ping');
    expect(body.params).toEqual({ x: 1 });
    expect(typeof body.id).toBe('number');
  });

  it('returns the result on success', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(ok({ KeyId: 'k1' }));
    const result = await jsonRpcCall<{ KeyId: string }>(
      { url: URL, method: 'kms.GetKey', params: {}, token: 't' },
      { timeout: 1000 },
    );
    expect(result.KeyId).toBe('k1');
  });
});

describe('nextRpcId', () => {
  it('is monotonic', () => {
    const a = nextRpcId();
    const b = nextRpcId();
    const c = nextRpcId();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('jsonRpcCall — HTTP error mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  const cases: { status: number; code: string }[] = [
    { status: 401, code: ERROR_CODES.AUTH_FAILED },
    { status: 403, code: ERROR_CODES.AUTH_FAILED },
    { status: 429, code: ERROR_CODES.RATE_LIMITED },
    { status: 500, code: ERROR_CODES.SERVICE_UNAVAILABLE },
    { status: 502, code: ERROR_CODES.SERVICE_UNAVAILABLE },
    { status: 418, code: ERROR_CODES.API_ERROR },
  ];
  for (const { status, code } of cases) {
    it(`maps HTTP ${status} → ${code}`, async () => {
      (fetch as jest.Mock).mockResolvedValueOnce(http(status));
      await expect(
        jsonRpcCall(
          { url: URL, method: 'kms.X', params: {}, token: 't' },
          { timeout: 1000 },
        ),
      ).rejects.toMatchObject({ code, status });
    });
  }

  it('maps HTTP 404 → API_ERROR with route-not-deployed hint', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(http(404));
    await expect(
      jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 1000 },
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.API_ERROR,
      status: 404,
      message: expect.stringContaining('KMS JSON-RPC route not deployed'),
    });
  });
});

describe('jsonRpcCall — JSON-RPC error mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps -32602 → VALIDATION_ERROR and preserves jsonRpcCode', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32602, message: 'invalid params' }),
    );
    try {
      await jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 1000 },
      );
      fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(OrbitportSDKError);
      const err = e as OrbitportSDKError;
      expect(err.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect((err.details as { jsonRpcCode: number }).jsonRpcCode).toBe(-32602);
    }
  });

  it('maps -32603 → API_ERROR', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32603, message: 'internal' }),
    );
    await expect(
      jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 1000 },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.API_ERROR });
  });

  it('maps -32601 (method not found) → API_ERROR', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32601, message: 'unknown variant kms.GetCapabilities' }),
    );
    try {
      await jsonRpcCall(
        { url: URL, method: 'kms.GetCapabilities', params: {}, token: 't' },
        { timeout: 1000 },
      );
      fail('should throw');
    } catch (e) {
      const err = e as OrbitportSDKError;
      expect(err.code).toBe(ERROR_CODES.API_ERROR);
      expect((err.details as { jsonRpcCode: number }).jsonRpcCode).toBe(-32601);
    }
  });

  it('maps vendor -32000 → KMS_ERROR', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32000, message: 'kms vendor error' }),
    );
    await expect(
      jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 1000 },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.KMS_ERROR });
  });

  it('upgrades message /not found/ → KMS_KEY_NOT_FOUND', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32603, message: 'key not found: alias kms:foo' }),
    );
    await expect(
      jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 1000 },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.KMS_KEY_NOT_FOUND });
  });

  it('upgrades message /disabled|pending/ → KMS_INVALID_KEY_STATE', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32603, message: 'key is disabled' }),
    );
    await expect(
      jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 1000 },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.KMS_INVALID_KEY_STATE });
  });

  it('mapJsonRpcError preserves details for unit-level checks', () => {
    const e = mapJsonRpcError({ code: -32601, message: 'no method' });
    expect(e).toBeInstanceOf(OrbitportSDKError);
    expect((e.details as { jsonRpcCode: number }).jsonRpcCode).toBe(-32601);
  });
});

describe('jsonRpcCall — abort and signals', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws TIMEOUT when internal abort fires', async () => {
    (fetch as jest.Mock).mockImplementationOnce(
      (_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    await expect(
      jsonRpcCall(
        { url: URL, method: 'kms.X', params: {}, token: 't' },
        { timeout: 5 },
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.TIMEOUT });
  });

  it('cancels via external AbortSignal', async () => {
    const ext = new AbortController();
    (fetch as jest.Mock).mockImplementationOnce(
      (_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const p = jsonRpcCall(
      { url: URL, method: 'kms.X', params: {}, token: 't' },
      { timeout: 30000, signal: ext.signal },
    );
    ext.abort();
    await expect(p).rejects.toMatchObject({ code: ERROR_CODES.TIMEOUT });
  });
});
