/**
 * cTRNG (cosmic True Random Number Generator) service
 */

import type {
  CTRNGRequest,
  CTRNGResponse,
  ServiceResult,
  ResponseMetadata,
  RequestOptions,
} from "../types";
import {
  OrbitportSDKError,
  ERROR_CODES,
  createErrorFromAPIResponse,
  createNetworkError,
} from "../utils/errors";
import { withRetry, RETRY_STRATEGIES } from "../utils/retry";
import { sanitizeCTRNGRequest } from "../utils/validation";

/**
 * cTRNG service class
 */
export class CTRNGService {
  private apiUrl: string;
  private getToken: () => Promise<string | null>;
  private timeout: number;
  private debug: boolean;

  constructor(
    apiUrl: string,
    getToken: () => Promise<string | null>,
    timeout: number = 30000,
    debug: boolean = false
  ) {
    this.apiUrl = apiUrl;
    this.getToken = getToken;
    this.timeout = timeout;
    this.debug = debug;
  }

  /**
   * Generates true random numbers using cosmic sources
   * @param request - Request parameters (src: "trng" or "rng", defaults to "trng")
   * @param options - Request options (timeout, retries, headers)
   * @returns Promise resolving to ServiceResult with CTRNGResponse
   */
  async random(
    request: Partial<CTRNGRequest> = {},
    options: RequestOptions = {}
  ): Promise<ServiceResult<CTRNGResponse>> {
    const sanitizedRequest = sanitizeCTRNGRequest(request);
    const requestOptions = {
      timeout: options.timeout || this.timeout,
      retries: options.retries || 3,
      headers: options.headers || {},
    };

    if (this.debug) {
      console.log(
        "[OrbitportSDK] Generating random data with request:",
        sanitizedRequest
      );
    }

    try {
      const result = await withRetry(
        async () => {
          return await this._makeRequest(sanitizedRequest, requestOptions);
        },
        {
          ...RETRY_STRATEGIES.standard,
          maxAttempts: requestOptions.retries,
        },
        (error, attempt) => {
          if (this.debug) {
            console.warn(
              `[OrbitportSDK] cTRNG request attempt ${attempt} failed:`,
              error.message
            );
          }
        }
      );

      return result;
    } catch (error) {
      if (this.debug) {
        console.error("[OrbitportSDK] cTRNG generation failed:", error);
      }
      throw error;
    }
  }

  /**
   * Makes the actual API request
   * @param request - Sanitized CTRNG request parameters
   * @param options - Request options
   * @returns Promise resolving to ServiceResult with CTRNGResponse
   */
  private async _makeRequest(
    request: CTRNGRequest,
    options: RequestOptions
  ): Promise<ServiceResult<CTRNGResponse>> {
    const token = await this.getToken();
    if (!token) {
      throw new OrbitportSDKError(
        "No valid authentication token available",
        ERROR_CODES.AUTH_FAILED
      );
    }

    const url = `${this.apiUrl}/api/v1/services/trng`;
    const queryParams = new URLSearchParams();

    // Add src parameter if specified (defaults to "trng")
    if (request.src) {
      queryParams.append("src", request.src);
    }

    const fullUrl = queryParams.toString() ? `${url}?${queryParams}` : url;

    if (this.debug) {
      console.log("[OrbitportSDK] Making cTRNG request to:", fullUrl);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let apiError: any;
          try {
            apiError = await response.json();
          } catch {
            apiError = {
              error: "Unknown error",
              error_description: `HTTP ${response.status}: ${response.statusText}`,
            };
          }

          throw createErrorFromAPIResponse(apiError, response.status);
        }

        const data: CTRNGResponse = await response.json();

        if (this.debug) {
          console.log(
            "[OrbitportSDK] Raw API response:",
            JSON.stringify(data, null, 2)
          );
        }

        // Validate response structure
        this._validateResponse(data);

        const requestId = response.headers.get("x-request-id");
        const metadata: ResponseMetadata = {
          timestamp: Date.now(),
          ...(requestId && { request_id: requestId }),
          cache_hit: response.headers.get("x-cache") === "HIT",
        };

        return {
          data,
          metadata,
          success: true,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      if (error instanceof OrbitportSDKError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new OrbitportSDKError(
            "cTRNG request timeout",
            ERROR_CODES.TIMEOUT
          );
        }
        throw createNetworkError(error);
      }

      throw new OrbitportSDKError(
        "Unknown error during cTRNG request",
        ERROR_CODES.UNKNOWN_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Validates the cTRNG response structure
   * @param data - Response data to validate
   */
  private _validateResponse(data: any): void {
    if (!data || typeof data !== "object") {
      throw new OrbitportSDKError(
        "Invalid response: expected object",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    if (!data.service || typeof data.service !== "string") {
      throw new OrbitportSDKError(
        "Invalid response: missing or invalid service field",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    if (!data.src || typeof data.src !== "string") {
      throw new OrbitportSDKError(
        "Invalid response: missing or invalid src field",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    if (!data.data || typeof data.data !== "string") {
      throw new OrbitportSDKError(
        "Invalid response: missing or invalid data field",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    // Signature is optional - not all responses include it
    if (data.signature) {
      if (typeof data.signature !== "object") {
        throw new OrbitportSDKError(
          "Invalid response: invalid signature field",
          ERROR_CODES.INVALID_RESPONSE
        );
      }

      const { signature } = data;
      if (!signature.value) {
        throw new OrbitportSDKError(
          "Invalid response: missing signature value",
          ERROR_CODES.INVALID_RESPONSE
        );
      }

      // Note: pk can be empty string according to API docs
      if (signature.pk === undefined) {
        throw new OrbitportSDKError(
          "Invalid response: missing signature pk field",
          ERROR_CODES.INVALID_RESPONSE
        );
      }
    }
  }
}
