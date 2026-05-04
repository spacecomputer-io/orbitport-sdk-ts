/**
 * Key Management Service (KMS) — JSON-RPC 2.0 client.
 *
 * Mirrors the CTRNGService construction shape (config + token factory).
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
} from '../types';
import { OrbitportSDKError, ERROR_CODES } from '../utils/errors';
import { jsonRpcCall } from '../utils/jsonrpc';
import { withRetry, RETRY_STRATEGIES } from '../utils/retry';
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
    return this._call<GetCapabilitiesResponse>(
      'kms.GetCapabilities',
      {},
      options,
    );
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

    // Retries are opt-in. KMS write methods (CreateKey, Sign, etc.) are not
    // generally idempotent, so we only retry when the caller explicitly asks
    // (`options.retries > 1`). The shared retry helper's `isRetryableError`
    // predicate further restricts retries to transient classes (network,
    // timeout, 5xx, rate-limited) — never on validation/auth/server errors.
    const call = () =>
      jsonRpcCall<T>(
        { url, method, params, token },
        {
          timeout,
          headers: options.headers,
          debug: this.debug,
        },
      );

    const result =
      options.retries && options.retries > 1
        ? await withRetry(
          call,
          { ...RETRY_STRATEGIES.standard, maxAttempts: options.retries },
          (error, attempt) => {
            if (this.debug) {
              console.warn(
                `[OrbitportSDK] KMS ${method} attempt ${attempt} failed:`,
                error.message,
              );
            }
          },
        )
        : await call();

    return { result, metadata: { timestamp: Date.now() } };
  }
}
