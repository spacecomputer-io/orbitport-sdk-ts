/**
 * Orbitport SDK - Official TypeScript SDK for SpaceComputer Orbitport
 *
 * @packageDocumentation
 */

// Export all types
export * from "./types";

// Export storage implementations
export * from "./storage";

// Export utility functions
export * from "./utils/errors";
export * from "./utils/retry";
export * from "./utils/validation";

// Export services
export { AuthService } from "./services/auth";
export { CTRNGService } from "./services/ctrng";

// Main SDK class
import type {
  OrbitportConfig,
  SDKInitOptions,
  SDKEventHandler,
  CTRNGRequest,
  RequestOptions,
} from "./types";
import { AuthService } from "./services/auth";
import { CTRNGService } from "./services/ctrng";
import { createDefaultStorage } from "./storage";
import { sanitizeConfig } from "./utils/validation";

/**
 * Main Orbitport SDK class
 *
 * @example
 * ```typescript
 * import { OrbitportSDK } from '@spacecomputer/orbitport-sdk';
 *
 * const sdk = new OrbitportSDK({
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret'
 * });
 *
 * // Generate random data
 * const result = await sdk.ctrng.random();
 * console.log(result.data);
 * ```
 */
export class OrbitportSDK {
  private config: OrbitportConfig;
  private authService: AuthService;
  private ctrngService: CTRNGService;
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

    this.ctrngService = new CTRNGService(
      this.config.apiUrl!,
      () => this.authService.getValidToken(),
      this.config.timeout,
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
   * // Generate random data using default source (trng)
   * const result = await sdk.ctrng.random();
   *
   * // Generate random data with specific source
   * const result = await sdk.ctrng.random({ src: 'rng' });
   * ```
   */
  get ctrng() {
    return {
      /**
       * Generates true random numbers using cosmic sources
       * @param request - Request parameters (src: "trng" or "rng", defaults to "trng")
       * @param options - Request options (timeout, retries, headers)
       * @returns Promise resolving to ServiceResult with CTRNGResponse
       */
      random: (request?: Partial<CTRNGRequest>, options?: RequestOptions) =>
        this.ctrngService.random(request, options),
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
   *   timeout: 60000
   * });
   * ```
   */
  updateConfig(newConfig: Partial<OrbitportConfig>): void {
    const updatedConfig = sanitizeConfig({ ...this.config, ...newConfig });
    this.config = updatedConfig;
    this.authService.updateConfig(updatedConfig);

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
 * import { createOrbitportSDK } from '@spacecomputer/orbitport-sdk';
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

// Default export
export default OrbitportSDK;
