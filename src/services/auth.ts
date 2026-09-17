/**
 * Authentication service for caller-supplied bearer tokens
 */

import type { OrbitportConfig, TokenStorage, SDKEvent, SDKEventHandler } from '../types';
import { OrbitportSDKError, ERROR_CODES } from '../utils/errors';
import { isTokenExpired, isValidJWT } from '../utils/validation';

/**
 * Authentication service class
 */
export class AuthService {
  private config: OrbitportConfig;
  private storage: TokenStorage;
  private eventHandler?: SDKEventHandler;
  private debug: boolean;

  constructor(
    config: OrbitportConfig,
    storage: TokenStorage,
    eventHandler?: SDKEventHandler,
    debug: boolean = false,
  ) {
    this.config = config;
    this.storage = storage;
    this.eventHandler = eventHandler || (() => {});
    this.debug = debug;
  }

  /**
   * Gets the configured or stored bearer token without acquiring or refreshing it.
   */
  async getValidToken(): Promise<string | null> {
    const token = this.config.accessToken || await this.storage.get();
    if (!token) {
      return null;
    }
    if (isValidJWT(token) && isTokenExpired(token)) {
      throw new OrbitportSDKError(
        'Access token is expired; provide a new accessToken',
        ERROR_CODES.TOKEN_EXPIRED,
      );
    }
    return token;
  }

  /**
   * Clears the stored token
   */
  async clearToken(): Promise<void> {
    await this.storage.clear();

    this.emitEvent({
      type: 'token_cleared',
      timestamp: Date.now(),
      data: { action: 'cleared' },
    });
  }

  /**
   * Checks if the current token is valid
   */
  async isTokenValid(): Promise<boolean> {
    try {
      const token = await this.getValidToken();
      return token !== null;
    } catch {
      return false;
    }
  }

  /**
   * Gets token information
   */
  async getTokenInfo(): Promise<{ valid: boolean; expiresAt?: number }> {
    try {
      const token = this.config.accessToken || await this.storage.get();
      if (!token) {
        return { valid: false };
      }

      if (!isValidJWT(token)) {
        return { valid: true };
      }

      if (isTokenExpired(token)) {
        return { valid: false };
      }

      // Parse a JWT to return its expiration time.
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        return { valid: true, expiresAt: payload.exp };
      }

      return { valid: true };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Emits an SDK event
   */
  private emitEvent(event: SDKEvent): void {
    if (this.eventHandler) {
      try {
        this.eventHandler(event);
      } catch (error) {
        if (this.debug) {
          console.warn('[OrbitportSDK] Event handler error:', error);
        }
      }
    }
  }

  /**
   * Updates the configuration
   */
  updateConfig(newConfig: Partial<OrbitportConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Updates the event handler
   */
  setEventHandler(handler: SDKEventHandler): void {
    this.eventHandler = handler;
  }

  /**
   * Sets debug mode
   */
  setDebug(debug: boolean): void {
    this.debug = debug;
  }
}
