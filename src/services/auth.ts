/**
 * Authentication service for the Orbitport SDK
 */

import type {
  OrbitportConfig,
  TokenResponse,
  TokenData,
  TokenStorage,
  SDKEvent,
  SDKEventHandler,
  APIError,
} from '../types';
import {
  OrbitportSDKError,
  ERROR_CODES,
  createErrorFromAPIResponse,
  createNetworkError,
} from '../utils/errors';
import { withRetry, RETRY_STRATEGIES } from '../utils/retry';
import { isTokenExpired } from '../utils/validation';

/**
 * Authentication service class
 */
export class AuthService {
  private config: OrbitportConfig;
  private storage: TokenStorage;
  private eventHandler?: SDKEventHandler;
  private debug: boolean;
  private tokenPromise: Promise<string | null> | undefined = undefined;

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
   * Gets a valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string | null> {
    // Prevent multiple simultaneous token requests
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = this._getValidToken();

    try {
      const token = await this.tokenPromise;
      return token;
    } finally {
      this.tokenPromise = undefined;
    }
  }

  /**
   * Internal method to get valid token
   */
  private async _getValidToken(): Promise<string | null> {
    try {
      // Try to get existing token from storage
      const existingToken = await this.storage.get();

      if (existingToken && !isTokenExpired(existingToken)) {
        if (this.debug) {
          console.log('[OrbitportSDK] Using existing valid token');
        }
        return existingToken;
      }

      if (this.debug) {
        console.log(
          '[OrbitportSDK] Token expired or not found, requesting new token',
        );
      }

      // Request new token
      const tokenData = await this.requestNewToken();

      if (!tokenData) {
        throw new OrbitportSDKError(
          'Failed to obtain access token',
          ERROR_CODES.AUTH_FAILED,
        );
      }

      // Store the new token
      await this.storage.set(tokenData.access_token, tokenData.expires_at);

      // Emit token refresh event
      this.emitEvent({
        type: 'token_refresh',
        timestamp: Date.now(),
        data: { expires_at: tokenData.expires_at },
      });

      return tokenData.access_token;
    } catch (error) {
      if (this.debug) {
        console.error('[OrbitportSDK] Token retrieval failed:', error);
      }

      // Clear invalid token from storage
      await this.storage.clear();
      throw error;
    }
  }

  /**
   * Requests a new access token from the authentication server
   */
  private async requestNewToken(): Promise<TokenData | null> {
    const authUrl = `${this.config.authUrl}/oauth/token`;
    const audience = `${this.config.apiUrl}/api`;

    const requestBody = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      audience,
      grant_type: 'client_credentials',
    };

    if (this.debug) {
      console.log('[OrbitportSDK] Requesting token from:', authUrl);
    }

    try {
      const response = await withRetry(
        async() => {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            this.config.timeout,
          );

          try {
            const response = await fetch(authUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        },
        RETRY_STRATEGIES.standard,
        (error, attempt) => {
          if (this.debug) {
            console.warn(
              `[OrbitportSDK] Token request attempt ${attempt} failed:`,
              error.message,
            );
          }
        },
      );

      if (!response.ok) {
        let apiError: APIError;
        try {
          apiError = await response.json();
        } catch {
          apiError = {
            error: 'Unknown error',
            error_description: 'Failed to parse error response',
          };
        }

        throw createErrorFromAPIResponse(apiError, response.status);
      }

      const tokenResponse: TokenResponse = await response.json();

      if (!tokenResponse.access_token) {
        throw new OrbitportSDKError(
          'Invalid token response: missing access_token',
          ERROR_CODES.INVALID_RESPONSE,
        );
      }

      // Calculate expiration time
      const expiresAt = Date.now() / 1000 + (tokenResponse.expires_in || 3600);

      return {
        access_token: tokenResponse.access_token,
        expires_at: expiresAt,
        token_type: tokenResponse.token_type || 'Bearer',
      };
    } catch (error) {
      if (error instanceof OrbitportSDKError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new OrbitportSDKError(
            'Token request timeout',
            ERROR_CODES.TIMEOUT,
          );
        }
        throw createNetworkError(error);
      }

      throw new OrbitportSDKError(
        'Unknown error during token request',
        ERROR_CODES.UNKNOWN_ERROR,
        undefined,
        error,
      );
    }
  }

  /**
   * Clears the stored token
   */
  async clearToken(): Promise<void> {
    await this.storage.clear();

    this.emitEvent({
      type: 'token_refresh',
      timestamp: Date.now(),
      data: { action: 'cleared' },
    });
  }

  /**
   * Checks if the current token is valid
   */
  async isTokenValid(): Promise<boolean> {
    try {
      const token = await this.storage.get();
      return token !== null && !isTokenExpired(token);
    } catch {
      return false;
    }
  }

  /**
   * Gets token information without refreshing
   */
  async getTokenInfo(): Promise<{ valid: boolean; expiresAt?: number }> {
    try {
      const token = await this.storage.get();
      if (!token) {
        return { valid: false };
      }

      if (isTokenExpired(token)) {
        return { valid: false };
      }

      // Parse token to get expiration
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
