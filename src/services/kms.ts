/**
 * Key Management Service (KMS) — JSON-RPC 2.0 client.
 *
 * Mirrors the CTRNGService construction shape (config + token factory).
 * Unlike CTRNG, KMS requires authentication — no IPFS fallback.
 */

import type {
  OrbitportConfig,
  RequestOptions,
  ResponseMetadata,
  ServiceResult,
  CreateKeyRequest,
  CreateKeyResponse,
  EncryptRequest,
  EncryptResponse,
  DecryptRequest,
  DecryptResponseUtf8,
  DecryptResponseBytes,
  SignRequest,
  SignResponse,
  GenerateDataKeyRequest,
  GenerateDataKeyResponse,
  RotateKeyRequest,
  RotateKeyResponse,
  GetCapabilitiesResponse,
  SchemeCapability,
} from '../types';
import { OrbitportSDKError, ERROR_CODES } from '../utils/errors';
import { jsonRpcCall } from '../utils/jsonrpc';
import {
  toBase64,
  fromBase64ToUtf8,
  fromBase64ToUint8Array,
} from '../utils/base64';
import {
  sanitizeCreateKeyRequest,
  sanitizeEncryptRequest,
  sanitizeDecryptRequest,
  sanitizeSignRequest,
  sanitizeGenerateDataKeyRequest,
  sanitizeRotateKeyRequest,
} from '../utils/validation';

/**
 * Static capability list — used as fallback when the gateway returns
 * `-32601` for `kms.GetCapabilities` (older op-dev builds expose KMS without
 * the introspection method). Matches the kms_starter reference client.
 */
const STATIC_CAPABILITIES: SchemeCapability[] = [
  {
    Scheme: 'TRANSIT',
    KeySpecs: [
      'AES_256_GCM96',
      'ECDSA_P256',
      'ECDSA_P384',
      'ED25519',
      'RSA_4096',
    ],
    KeyUsages: ['ENCRYPT_DECRYPT', 'SIGN_VERIFY'],
    EncryptionAlgorithms: ['AES_256_GCM96'],
    DataKeySpecs: ['AES_128', 'AES_256'],
    SigningCapabilities: [
      { SigningAlgorithm: 'ECDSA_SHA_256', MessageTypes: ['RAW', 'DIGEST'] },
      { SigningAlgorithm: 'ECDSA_SHA_384', MessageTypes: ['RAW', 'DIGEST'] },
      { SigningAlgorithm: 'ED25519', MessageTypes: ['RAW'] },
      {
        SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
        MessageTypes: ['RAW', 'DIGEST'],
      },
      { SigningAlgorithm: 'RSASSA_PSS_SHA_256', MessageTypes: ['RAW', 'DIGEST'] },
    ],
    SupportsEncrypt: true,
    SupportsDecrypt: true,
    SupportsGenerateDataKey: true,
    SupportsRotateKey: true,
  },
  {
    Scheme: 'ETHEREUM',
    KeySpecs: ['ECC_SECG_P256K1'],
    KeyUsages: ['SIGN_VERIFY'],
    EncryptionAlgorithms: [],
    DataKeySpecs: [],
    SigningCapabilities: [
      {
        SigningAlgorithm: 'ETHEREUM_SECP256K1',
        MessageTypes: ['RAW', 'DIGEST', 'EIP191'],
      },
    ],
    SupportsEncrypt: false,
    SupportsDecrypt: false,
    SupportsGenerateDataKey: false,
    SupportsRotateKey: true,
  },
];

export class KMSService {
  private config: OrbitportConfig;
  private getToken: () => Promise<string | null>;
  private debug: boolean;

  constructor(
    config: OrbitportConfig,
    getToken: () => Promise<string | null>,
    debug = false,
  ) {
    this.config = config;
    this.getToken = getToken;
    this.debug = debug;
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
  }

  async createKey(
    req: CreateKeyRequest,
    options: RequestOptions = {},
  ): Promise<ServiceResult<CreateKeyResponse>> {
    const params = sanitizeCreateKeyRequest(req);
    return this._call<CreateKeyResponse>('kms.CreateKey', params, options);
  }

  async encrypt(
    req: EncryptRequest,
    options: RequestOptions = {},
  ): Promise<ServiceResult<EncryptResponse>> {
    const sanitized = sanitizeEncryptRequest(req);
    const params: Record<string, unknown> = {
      KeyId: sanitized.keyId,
      Plaintext: toBase64(sanitized.plaintext),
    };
    if (sanitized.encryptionAlgorithm !== undefined) {
      params.EncryptionAlgorithm = sanitized.encryptionAlgorithm;
    }
    return this._call<EncryptResponse>('kms.Encrypt', params, options);
  }

  decrypt(
    req: DecryptRequest & { encoding: 'bytes' },
    options?: RequestOptions,
  ): Promise<ServiceResult<DecryptResponseBytes>>;
  decrypt(
    req: DecryptRequest & { encoding?: 'utf8' },
    options?: RequestOptions,
  ): Promise<ServiceResult<DecryptResponseUtf8>>;
  async decrypt(
    req: DecryptRequest,
    options: RequestOptions = {},
  ): Promise<ServiceResult<DecryptResponseUtf8 | DecryptResponseBytes>> {
    const { encoding, params } = sanitizeDecryptRequest(req);
    const wire = await this._callRaw<{
      Plaintext: string;
      KeyId: string;
      EncryptionAlgorithm: string;
    }>('kms.Decrypt', params, options);

    const data: DecryptResponseUtf8 | DecryptResponseBytes =
      encoding === 'bytes'
        ? {
          Plaintext: fromBase64ToUint8Array(wire.result.Plaintext),
          KeyId: wire.result.KeyId,
          EncryptionAlgorithm: wire.result.EncryptionAlgorithm,
        }
        : {
          Plaintext: fromBase64ToUtf8(wire.result.Plaintext),
          KeyId: wire.result.KeyId,
          EncryptionAlgorithm: wire.result.EncryptionAlgorithm,
        };

    return { data, metadata: wire.metadata, success: true };
  }

  async sign(
    req: SignRequest,
    options: RequestOptions = {},
  ): Promise<ServiceResult<SignResponse>> {
    const sanitized = sanitizeSignRequest(req);
    const params: Record<string, unknown> = {
      KeyId: sanitized.keyId,
      Message: toBase64(sanitized.message),
      SigningAlgorithm: sanitized.signingAlgorithm,
      MessageType: sanitized.messageType,
    };
    return this._call<SignResponse>('kms.Sign', params, options);
  }

  async generateDataKey(
    req: GenerateDataKeyRequest,
    options: RequestOptions = {},
  ): Promise<ServiceResult<GenerateDataKeyResponse>> {
    const params = sanitizeGenerateDataKeyRequest(req);
    return this._call<GenerateDataKeyResponse>(
      'kms.GenerateDataKey',
      params,
      options,
    );
  }

  async rotateKey(
    req: RotateKeyRequest,
    options: RequestOptions = {},
  ): Promise<ServiceResult<RotateKeyResponse>> {
    const params = sanitizeRotateKeyRequest(req);
    return this._call<RotateKeyResponse>('kms.RotateKey', params, options);
  }

  async getCapabilities(
    options: RequestOptions = {},
  ): Promise<ServiceResult<GetCapabilitiesResponse>> {
    try {
      return await this._call<GetCapabilitiesResponse>(
        'kms.GetCapabilities',
        {},
        options,
      );
    } catch (error) {
      if (this._isMethodNotFound(error)) {
        if (this.debug) {
          console.log(
            '[OrbitportSDK] kms.GetCapabilities not available; returning static capabilities',
          );
        }
        return {
          data: { Schemes: STATIC_CAPABILITIES },
          metadata: { timestamp: Date.now() },
          success: true,
        };
      }
      throw error;
    }
  }

  /**
   * Wraps a JSON-RPC call into the SDK's ServiceResult envelope.
   */
  private async _call<T>(
    method: string,
    params: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<ServiceResult<T>> {
    const { result, metadata } = await this._callRaw<T>(method, params, options);
    return { data: result, metadata, success: true };
  }

  private async _callRaw<T>(
    method: string,
    params: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<{ result: T; metadata: ResponseMetadata }> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new OrbitportSDKError(
        'KMS requires API credentials (clientId and clientSecret)',
        ERROR_CODES.AUTH_FAILED,
      );
    }

    const token = await this.getToken();
    if (!token) {
      throw new OrbitportSDKError(
        'No valid authentication token available',
        ERROR_CODES.AUTH_FAILED,
      );
    }

    const timeout = options.timeout || this.config.timeout || 30000;
    const url = `${this.config.apiUrl}/api/v1/rpc`;

    if (this.debug) {
      console.log('[OrbitportSDK] KMS', method, '→', url);
    }

    const result = await jsonRpcCall<T>(
      { url, method, params, token },
      {
        timeout,
        headers: options.headers,
        debug: this.debug,
      },
    );

    return { result, metadata: { timestamp: Date.now() } };
  }

  private _isMethodNotFound(error: unknown): boolean {
    if (!(error instanceof OrbitportSDKError)) return false;
    const details = error.details as { jsonRpcCode?: number } | undefined;
    if (details?.jsonRpcCode === -32601) return true;
    return /unknown variant.*kms\.GetCapabilities/i.test(error.message);
  }
}
