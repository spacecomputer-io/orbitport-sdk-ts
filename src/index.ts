/**
 * Orbitport SDK - Official TypeScript SDK for SpaceComputer Orbitport
 *
 * @packageDocumentation
 */

export * from "./types";
export * from "./storage";
export * from "./utils/errors";
export * from "./utils/retry";
export * from "./utils/validation";

export { AuthService } from "./services/auth";
export { KMSService } from "./services/kms";
export { LosslessNumber, isLosslessNumber } from "lossless-json";
export {
  toBase64,
  fromBase64ToUtf8,
  fromBase64ToUint8Array,
} from "./utils/base64";

import type {
  OrbitportConfig,
  SDKInitOptions,
  SDKEventHandler,
  RequestOptions,
  CreateKeyRequest,
  EncryptRequest,
  DecryptRequest,
  DecryptResponseUtf8,
  DecryptResponseBytes,
  ServiceResult,
  SignRequest,
  GenerateDataKeyRequest,
  RotateKeyRequest,
  KeyStorePutRequest,
  KeyStoreGetRequest,
  KeyStoreListRequest,
  KeyStoreDeleteRequest,
} from "./types";
import { AuthService } from "./services/auth";
import { KMSService } from "./services/kms";
import { createDefaultStorage } from "./storage";
import { sanitizeConfig } from "./utils/validation";

/**
 * Main Orbitport SDK class.
 *
 * Provides key management through `sdk.kms` and authentication through
 * `sdk.auth`, with shared configuration and the `OrbitportSDKError` model.
 *
 * @example
 * ```typescript
 * import { OrbitportSDK } from '@spacecomputer-io/orbitport-sdk-ts';
 *
 * const sdk = new OrbitportSDK({
 *   config: {
 *     accessToken: 'your-access-token',
 *   },
 * });
 *
 * // KMS — create a key and sign with it
 * const key = await sdk.kms.createKey({
 *   alias: 'demo',
 *   keySpec: 'ECDSA_P256',
 *   keyUsage: 'SIGN_VERIFY',
 * });
 * const sig = await sdk.kms.sign({
 *   keyId: key.data.KeyMetadata.KeyId,
 *   message: 'hello orbitport',
 *   signingAlgorithm: 'ECDSA_SHA_256',
 * });
 * ```
 */
export class OrbitportSDK {
  private config: OrbitportConfig;
  private authService: AuthService;
  private kmsService: KMSService;
  private debug: boolean;

  /**
   * Creates a new Orbitport SDK instance
   *
   * @param options - SDK initialization options
   */
  constructor(options: SDKInitOptions) {
    // Validate and sanitize configuration
    this.config = sanitizeConfig(options.config);
    this.debug = options.debug || false;

    // Create storage instance
    const storage = options.storage || createDefaultStorage();

    // Initialize services
    this.authService = new AuthService(
      this.config,
      storage,
      options.eventHandler,
      this.debug
    );

    this.kmsService = new KMSService(
      this.config,
      () => this.authService.getValidToken(),
      this.debug
    );

    if (this.debug) {
      console.log("[OrbitportSDK] Initialized with config:", {
        ...this.config,
        accessToken: "[REDACTED]",
      });
    }
  }

  /**
   * Key Management Service (KMS)
   *
   * Talks JSON-RPC 2.0 to the gateway at `/api/v1/rpc`. Requires a bearer
   * token. Inputs are camelCase; outputs preserve the PascalCase
   * wire shape.
   *
   * @example
   * ```typescript
   * const key = await sdk.kms.createKey({
   *   alias: 'demo',
   *   keySpec: 'AES_256_GCM96',
   *   keyUsage: 'ENCRYPT_DECRYPT',
   * });
   * const enc = await sdk.kms.encrypt({
   *   keyId: key.data.KeyMetadata.KeyId,
   *   plaintext: 'hello',
   * });
   * const dec = await sdk.kms.decrypt({
   *   keyId: key.data.KeyMetadata.KeyId,
   *   ciphertextBlob: enc.data.CiphertextBlob,
   * });
   * console.log(dec.data.Plaintext); // "hello"
   *
   * // Binary fidelity:
   * const binary = await sdk.kms.decrypt({
   *   keyId, ciphertextBlob, encoding: 'bytes',
   * });
   * // binary.data.Plaintext is a Uint8Array
   * ```
   */
  get kms() {
    return {
      createKey: (req: CreateKeyRequest, options?: RequestOptions) =>
        this.kmsService.createKey(req, options),
      encrypt: (req: EncryptRequest, options?: RequestOptions) =>
        this.kmsService.encrypt(req, options),
      decrypt: ((
        req: DecryptRequest,
        options?: RequestOptions
      ): Promise<ServiceResult<DecryptResponseUtf8 | DecryptResponseBytes>> =>
        // Cast keeps the public type signature aligned with the service overloads.
        this.kmsService.decrypt(
          req as DecryptRequest & { encoding?: "utf8" },
          options
        )) as KMSService["decrypt"],
      sign: (req: SignRequest, options?: RequestOptions) =>
        this.kmsService.sign(req, options),
      generateDataKey: (req: GenerateDataKeyRequest, options?: RequestOptions) =>
        this.kmsService.generateDataKey(req, options),
      rotateKey: (req: RotateKeyRequest, options?: RequestOptions) =>
        this.kmsService.rotateKey(req, options),
      keyStore: {
        put: (req: KeyStorePutRequest, options?: RequestOptions) =>
          this.kmsService.putSecret(req, options),
        get: (req: KeyStoreGetRequest, options?: RequestOptions) =>
          this.kmsService.getSecret(req, options),
        list: (req: KeyStoreListRequest = {}, options?: RequestOptions) =>
          this.kmsService.listSecrets(req, options),
        delete: (req: KeyStoreDeleteRequest, options?: RequestOptions) =>
          this.kmsService.deleteSecret(req, options),
      },
      getCapabilities: (options?: RequestOptions) =>
        this.kmsService.getCapabilities(options),
    };
  }

  /**
   * Authentication service
   *
   * @example
   * ```typescript
   * // Check if token is valid
   * const isValid = await sdk.auth.isTokenValid();
   *
   * // Get token information
   * const tokenInfo = await sdk.auth.getTokenInfo();
   *
   * // Clear stored token
   * await sdk.auth.clearToken();
   * ```
   */
  get auth() {
    return {
      /**
       * Checks if the current token is valid
       */
      isTokenValid: () => this.authService.isTokenValid(),

      /**
       * Gets token information
       */
      getTokenInfo: () => this.authService.getTokenInfo(),

      /**
       * Clears the stored token
       */
      clearToken: () => this.authService.clearToken(),

      /**
       * Gets a valid access token (internal use)
       */
      getValidToken: () => this.authService.getValidToken(),
    };
  }

  /**
   * Updates the SDK configuration
   *
   * @param newConfig - Partial configuration to update
   *
   * @example
   * ```typescript
   * sdk.updateConfig({
   *   timeout: 60000,
   * });
   * ```
   */
  updateConfig(newConfig: Partial<OrbitportConfig>): void {
    const mergedConfig: Partial<OrbitportConfig> = {
      ...this.config,
      ...newConfig,
    };
    const updatedConfig = sanitizeConfig(mergedConfig);
    this.config = updatedConfig;
    this.authService.updateConfig(updatedConfig);
    this.kmsService.updateConfig(updatedConfig);

    if (this.debug) {
      console.log("[OrbitportSDK] Configuration updated:", {
        ...updatedConfig,
        accessToken: "[REDACTED]",
      });
    }
  }

  /**
   * Sets the event handler for SDK events
   *
   * @param handler - Event handler function
   *
   * @example
   * ```typescript
   * sdk.setEventHandler((event) => {
   *   console.log('SDK Event:', event);
   * });
   * ```
   */
  setEventHandler(handler: SDKEventHandler): void {
    this.authService.setEventHandler(handler);
  }

  /**
   * Sets debug mode
   *
   * @param debug - Whether to enable debug logging
   *
   * @example
   * ```typescript
   * sdk.setDebug(true);
   * ```
   */
  setDebug(debug: boolean): void {
    this.debug = debug;
    this.authService.setDebug(debug);
    this.kmsService.setDebug(debug);
  }

  /**
   * Gets the current configuration (with sensitive data redacted)
   *
   * @returns Current configuration object
   */
  getConfig(): Omit<OrbitportConfig, "accessToken"> & {
    accessToken: "[REDACTED]";
  } {
    return {
      ...this.config,
      accessToken: "[REDACTED]",
    };
  }
}

/**
 * Creates a new Orbitport SDK instance with default settings
 *
 * @param config - SDK configuration
 * @returns New OrbitportSDK instance
 *
 * @example
 * ```typescript
 * import { createOrbitportSDK } from '@spacecomputer-io/orbitport-sdk-ts';
 *
 * const sdk = createOrbitportSDK({
 *   accessToken: 'your-access-token'
 * });
 * ```
 */
export function createOrbitportSDK(config: OrbitportConfig): OrbitportSDK {
  return new OrbitportSDK({ config });
}

export default OrbitportSDK;
