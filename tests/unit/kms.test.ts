import { KMSService } from '../../src/services/kms';
import { ERROR_CODES, OrbitportSDKError } from '../../src/utils/errors';
import {
  toBase64,
  fromBase64ToUtf8,
  fromBase64ToUint8Array,
} from '../../src/utils/base64';
import type { OrbitportConfig } from '../../src/types';

global.fetch = jest.fn();

const baseConfig: OrbitportConfig = {
  clientId: 'cid',
  clientSecret: 'csec',
  apiUrl: 'https://api.example.com',
  timeout: 30000,
};

function rpcOk(result: unknown, id = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id, result }),
  } as unknown as Response;
}

function rpcErr(error: { code: number; message: string }, id = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id, error }),
  } as unknown as Response;
}

function makeService(opts?: { config?: OrbitportConfig; token?: string | null }) {
  const cfg = opts?.config || baseConfig;
  const token = opts?.token === undefined ? 'tok' : opts.token;
  const getToken = jest.fn().mockResolvedValue(token);
  return { svc: new KMSService(cfg, getToken, false), getToken };
}

function lastBody(): { jsonrpc: string; id: number; method: string; params: unknown } {
  const calls = (fetch as jest.Mock).mock.calls;
  const init = calls[calls.length - 1][1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('KMSService — auth gating', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws AUTH_FAILED synchronously when credentials missing (no fetch)', async () => {
    const { svc } = makeService({
      config: { apiUrl: 'https://api.example.com' },
      token: null,
    });
    await expect(
      svc.createKey({ alias: 'k', keySpec: 'AES_256_GCM96', keyUsage: 'ENCRYPT_DECRYPT' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.AUTH_FAILED });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws AUTH_FAILED when token factory returns null', async () => {
    const { svc } = makeService({ token: null });
    await expect(
      svc.createKey({ alias: 'k', keySpec: 'AES_256_GCM96', keyUsage: 'ENCRYPT_DECRYPT' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.AUTH_FAILED });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('KMSService — createKey', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends a JSON-RPC 2.0 envelope with PascalCase params', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({
        KeyMetadata: {
          KeyId: 'k1',
          Description: '',
          KeySpec: 'AES_256_GCM96',
          KeyUsage: 'ENCRYPT_DECRYPT',
          Enabled: true,
          PrimaryVersion: 1,
          CreationDate: 'now',
          Tags: [],
          Scheme: 'TRANSIT',
          Alias: 'demo-1',
        },
      }),
    );
    const { svc } = makeService();
    const res = await svc.createKey({
      alias: 'demo-1',
      keySpec: 'AES_256_GCM96',
      keyUsage: 'ENCRYPT_DECRYPT',
      scheme: 'TRANSIT',
      description: 'd',
      tags: [{ TagKey: 'env', TagValue: 'test' }],
    });

    const body = lastBody();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('kms.CreateKey');
    expect(body.params).toEqual({
      Alias: 'demo-1',
      KeySpec: 'AES_256_GCM96',
      KeyUsage: 'ENCRYPT_DECRYPT',
      Scheme: 'TRANSIT',
      Description: 'd',
      Tags: [{ TagKey: 'env', TagValue: 'test' }],
    });
    expect(typeof body.id).toBe('number');
    expect(res.success).toBe(true);
    expect(res.data.KeyMetadata.KeyId).toBe('k1');
  });

  it('uses monotonic ids for sequential calls', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(rpcOk({ Schemes: [] }))
      .mockResolvedValueOnce(rpcOk({ Schemes: [] }));
    const { svc } = makeService();
    await svc.getCapabilities();
    await svc.getCapabilities();
    const ids = (fetch as jest.Mock).mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string).id,
    );
    expect(ids[1]).toBeGreaterThan(ids[0]);
  });

  it('rejects alias with spaces or kms: prefix', async () => {
    const { svc } = makeService();
    await expect(
      svc.createKey({ alias: 'has space', keySpec: 'AES_256_GCM96', keyUsage: 'ENCRYPT_DECRYPT' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await expect(
      svc.createKey({ alias: 'kms:demo', keySpec: 'AES_256_GCM96', keyUsage: 'ENCRYPT_DECRYPT' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('KMSService — encrypt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('default encoding "utf8" base64-encodes a UTF-8 string', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({ CiphertextBlob: 'X', KeyId: 'k1', EncryptionAlgorithm: 'AES_256_GCM96' }),
    );
    const { svc } = makeService();
    await svc.encrypt({ keyId: 'k1', plaintext: 'hello — 🚀' });
    const body = lastBody();
    expect(body.method).toBe('kms.Encrypt');
    const params = body.params as { KeyId: string; Plaintext: string };
    expect(params.KeyId).toBe('k1');
    expect(fromBase64ToUtf8(params.Plaintext)).toBe('hello — 🚀');
  });

  it('encoding "bytes" base64-encodes raw Uint8Array', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({ CiphertextBlob: 'X', KeyId: 'k1', EncryptionAlgorithm: 'AES_256_GCM96' }),
    );
    const { svc } = makeService();
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]);
    await svc.encrypt({ keyId: 'k1', plaintext: bytes, encoding: 'bytes' });
    const body = lastBody();
    const params = body.params as { Plaintext: string };
    expect(fromBase64ToUint8Array(params.Plaintext)).toEqual(bytes);
  });

  it('rejects encoding "bytes" with string plaintext', async () => {
    const { svc } = makeService();
    await expect(
      // @ts-expect-error mismatched encoding/plaintext on purpose
      svc.encrypt({ keyId: 'k1', plaintext: 'oops', encoding: 'bytes' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('KMSService — decrypt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('default encoding "utf8" returns a UTF-8 string Plaintext', async () => {
    const text = 'hello — 🚀';
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({
        Plaintext: toBase64(text),
        KeyId: 'k1',
        EncryptionAlgorithm: 'AES_256_GCM96',
      }),
    );
    const { svc } = makeService();
    const res = await svc.decrypt({ ciphertextBlob: 'cipher', keyId: 'k1' });
    expect(typeof res.data.Plaintext).toBe('string');
    expect(res.data.Plaintext).toBe(text);
  });

  it('encoding "bytes" returns Uint8Array Plaintext (lossless)', async () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x80, 0xff]);
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({
        Plaintext: toBase64(bytes),
        KeyId: 'k1',
        EncryptionAlgorithm: 'AES_256_GCM96',
      }),
    );
    const { svc } = makeService();
    const res = await svc.decrypt({
      ciphertextBlob: 'cipher',
      keyId: 'k1',
      encoding: 'bytes',
    });
    expect(res.data.Plaintext).toBeInstanceOf(Uint8Array);
    expect(res.data.Plaintext).toEqual(bytes);
  });

  it('round-trips encrypt → decrypt over mocked transport', async () => {
    const original = 'round-trip 🌌';
    (fetch as jest.Mock)
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse((init as RequestInit).body as string);
        const params = body.params as { Plaintext: string };
        return rpcOk({
          CiphertextBlob: params.Plaintext, // echo back as cipher
          KeyId: 'k1',
          EncryptionAlgorithm: 'AES_256_GCM96',
        });
      })
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse((init as RequestInit).body as string);
        const params = body.params as { CiphertextBlob: string };
        return rpcOk({
          Plaintext: params.CiphertextBlob, // echo back as plaintext
          KeyId: 'k1',
          EncryptionAlgorithm: 'AES_256_GCM96',
        });
      });

    const { svc } = makeService();
    const enc = await svc.encrypt({ keyId: 'k1', plaintext: original });
    const dec = await svc.decrypt({
      ciphertextBlob: enc.data.CiphertextBlob,
      keyId: 'k1',
    });
    expect(dec.data.Plaintext).toBe(original);
  });
});

describe('KMSService — sign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults MessageType to "RAW" and base64-encodes the message', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({ KeyId: 'k1', Signature: 'sig', SigningAlgorithm: 'ECDSA_SHA_256' }),
    );
    const { svc } = makeService();
    await svc.sign({ keyId: 'k1', message: 'hi', signingAlgorithm: 'ECDSA_SHA_256' });
    const body = lastBody();
    const params = body.params as { Message: string; MessageType: string };
    expect(params.MessageType).toBe('RAW');
    expect(fromBase64ToUtf8(params.Message)).toBe('hi');
  });

  it('rejects EIP191 with non-ETHEREUM signing algorithm (no fetch)', async () => {
    const { svc } = makeService();
    await expect(
      svc.sign({
        keyId: 'k1',
        message: 'hi',
        signingAlgorithm: 'ECDSA_SHA_256',
        messageType: 'EIP191',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('KMSService — generateDataKey', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when both dataKeySpec and numberOfBytes are set', async () => {
    const { svc } = makeService();
    await expect(
      svc.generateDataKey({ keyId: 'k1', dataKeySpec: 'AES_256', numberOfBytes: 32 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it('rejects when neither is set', async () => {
    const { svc } = makeService();
    await expect(svc.generateDataKey({ keyId: 'k1' })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it('returns Plaintext as raw base64 (binary key material, no auto-decode)', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({ KeyId: 'k1', Plaintext: 'AAECAwQF', CiphertextBlob: 'CIPH' }),
    );
    const { svc } = makeService();
    const res = await svc.generateDataKey({ keyId: 'k1', dataKeySpec: 'AES_256' });
    expect(res.data.Plaintext).toBe('AAECAwQF');
    expect(res.data.CiphertextBlob).toBe('CIPH');
  });
});

describe('KMSService — rotateKey + getCapabilities', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rotateKey passes through wire response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({
        KeyMetadata: {
          KeyId: 'k1',
          Description: '',
          KeySpec: 'AES_256_GCM96',
          KeyUsage: 'ENCRYPT_DECRYPT',
          Enabled: true,
          PrimaryVersion: 2,
          CreationDate: 'now',
          Tags: [],
          Scheme: 'TRANSIT',
          Alias: 'a',
        },
      }),
    );
    const { svc } = makeService();
    const res = await svc.rotateKey({ keyId: 'k1' });
    expect(res.data.KeyMetadata.PrimaryVersion).toBe(2);
  });

  it('getCapabilities returns wire result on success', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcOk({
        Schemes: [
          {
            Scheme: 'TRANSIT',
            KeySpecs: ['AES_256_GCM96'],
            KeyUsages: ['ENCRYPT_DECRYPT'],
            EncryptionAlgorithms: ['AES_256_GCM96'],
            DataKeySpecs: ['AES_256'],
            SigningCapabilities: [],
            SupportsEncrypt: true,
            SupportsDecrypt: true,
            SupportsGenerateDataKey: true,
            SupportsRotateKey: true,
          },
        ],
      }),
    );
    const { svc } = makeService();
    const res = await svc.getCapabilities();
    expect(res.data.Schemes[0].Scheme).toBe('TRANSIT');
  });

  it('getCapabilities falls back to STATIC_CAPABILITIES on -32601', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32601, message: 'method not found' }),
    );
    const { svc } = makeService();
    const res = await svc.getCapabilities();
    expect(res.data.Schemes.map((s) => s.Scheme).sort()).toEqual([
      'ETHEREUM',
      'TRANSIT',
    ]);
  });

  it('getCapabilities falls back when message matches /unknown variant/', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32603, message: 'unknown variant kms.GetCapabilities' }),
    );
    const { svc } = makeService();
    const res = await svc.getCapabilities();
    expect(res.data.Schemes.length).toBeGreaterThan(0);
  });

  it('getCapabilities surfaces non-method-not-found errors', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      rpcErr({ code: -32603, message: 'internal' }),
    );
    const { svc } = makeService();
    await expect(svc.getCapabilities()).rejects.toBeInstanceOf(OrbitportSDKError);
  });
});
