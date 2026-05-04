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
export { CTRNGService } from "./services/ctrng";
export { BeaconService } from "./services/ipfs";
export { KMSService } from "./services/kms";
export {
  toBase64,
  fromBase64ToUtf8,
  fromBase64ToUint8Array,
} from "./utils/base64";

import type {
  OrbitportConfig,
  SDKInitOptions,
  SDKEventHandler,
  CTRNGRequest,
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
} from "./types";
import { AuthService } from "./services/auth";
import { CTRNGService } from "./services/ctrng";
import { BeaconService } from "./services/beacon";
import { KMSService } from "./services/kms";
import { createDefaultStorage } from "./storage";
import { sanitizeConfig } from "./utils/validation";

/**
 * Main Orbitport SDK class.
 *
 * Single facade over every Orbitport product. Each product is a peer
 * namespace under the same client: `sdk.ctrng`, `sdk.kms`, etc. They share
 * configuration, authentication, and the `OrbitportSDKError` model.
 *
 * @example
 * ```typescript
 * import { OrbitportSDK } from '@spacecomputer-io/orbitport-sdk-ts';
 *
 * const sdk = new OrbitportSDK({
 *   config: {
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *   },
 * });
 *
 * // cTRNG — cosmic randomness
 * const random = await sdk.ctrng.random();
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
  private ctrngService: CTRNGService;
  private beaconService: BeaconService;
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

    this.beaconService = new BeaconService(this.config.ipfs || {}, this.debug);

    this.ctrngService = new CTRNGService(
      this.config,
      () => this.authService.getValidToken(),
      this.beaconService,
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
        clientId: "[REDACTED]",
        clientSecret: "[REDACTED]",
      });
    }
  }

  /**
   * cTRNG (cosmic True Random Number Generator) service
   *
   * @example
   * ```typescript
   * // Generate random data (API first if credentials provided, then IPFS fallback)
   * const result = await sdk.ctrng.random();
   *
   * // Generate random data with specific API source
   * const result = await sdk.ctrng.random({ src: 'rng' });
   *
   * // Generate random data from IPFS beacon only
   * const result = await sdk.ctrng.random({ src: 'ipfs' });
   *
   * // Generate random data from specific IPFS beacon
   * const result = await sdk.ctrng.random({
   *   src: 'ipfs',
   *   beaconPath: '/ipns/your-beacon-cid'
   * });
   *
   * // Generate random data from specific cTRNG value in beacon array
   * const result = await sdk.ctrng.random({
   *   src: 'ipfs',
   *   index: 2 // Select the 3rd value (0-based)
   * });
   *
   * // Generate random data from specific block with specific index
   * const result = await sdk.ctrng.random({
   *   src: 'ipfs',
   *   block: 10012, // Traverse to block 10012
   *   index: 1 // Select the 2nd value from that block
   * });
   * ```
   */
  get ctrng() {
    return {
      /**
       * Generates true random numbers using cosmic sources
       *
       * Behavior:
       * - If API credentials provided: tries API first, falls back to IPFS
       * - If no API credentials: uses IPFS only
       * - IPFS always reads from both gateway and API sources and compares them
       * - Returns the selected cTRNG value from the beacon array (default: first value)
       *
       * @param request - Request parameters
       *   - src: "trng", "rng", or "ipfs" (source selection)
       *   - For IPFS requests (src: "ipfs"):
       *     - beaconPath: Custom IPFS beacon path
       *     - block: Block number to traverse to ("INF" for latest, default)
       *     - index: Index of cTRNG value to select from beacon array (0-based, uses modulo if out of bounds)
       * @param options - Request options (timeout, retries, headers)
       * @returns Promise resolving to ServiceResult with CTRNGResponse
       */
      random: (request?: Partial<CTRNGRequest>, options?: RequestOptions) =>
        this.ctrngService.random(request, options),
    };
  }

  /**
   * Key Management Service (KMS)
   *
   * Talks JSON-RPC 2.0 to the gateway at `/api/v1/rpc`. Requires API
   * credentials. Inputs are camelCase; outputs preserve the PascalCase
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
       * Gets token information without refreshing
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
   *   environment: 'staging',
   *   timeout: 60000,
   *   ipfs: {
   *     gateway: 'https://gateway.pinata.cloud',
   *     apiUrl: 'https://api.pinata.cloud'
   *   }
   * });
   * ```
   */
  updateConfig(newConfig: Partial<OrbitportConfig>): void {
    const updatedConfig = sanitizeConfig({ ...this.config, ...newConfig });
    this.config = updatedConfig;
    this.authService.updateConfig(updatedConfig);

    // Update IPFS configuration if provided
    if (newConfig.ipfs) {
      this.ctrngService.updateIPFSConfig(newConfig.ipfs);
      this.beaconService.updateConfig(newConfig.ipfs);
    }

    if (this.debug) {
      console.log("[OrbitportSDK] Configuration updated:", {
        ...updatedConfig,
        clientSecret: "[REDACTED]",
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
  getConfig(): Omit<OrbitportConfig, "clientSecret"> & {
    clientId: "[REDACTED]";
    clientSecret: "[REDACTED]";
  } {
    return {
      ...this.config,
      clientId: "[REDACTED]",
      clientSecret: "[REDACTED]",
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
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret'
 * });
 * ```
 */
export function createOrbitportSDK(config: OrbitportConfig): OrbitportSDK {
  return new OrbitportSDK({ config });
}

export default OrbitportSDK;
