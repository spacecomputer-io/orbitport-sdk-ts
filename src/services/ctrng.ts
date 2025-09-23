/**
 * cTRNG (cosmic True Random Number Generator) service
 */

import type {
  CTRNGRequest,
  CTRNGResponse,
  ServiceResult,
  ResponseMetadata,
  RequestOptions,
  OrbitportConfig,
  IPFSCTRNGRequest,
  APICTRNGRequest,
} from "../types";
import {
  OrbitportSDKError,
  ERROR_CODES,
  createErrorFromAPIResponse,
  createNetworkError,
} from "../utils/errors";
import { sanitizeCTRNGRequest } from "../utils/validation";
import { BeaconService } from "./beacon";

/**
 * cTRNG service class
 */
export class CTRNGService {
  private config: OrbitportConfig;
  private getToken: () => Promise<string | null>;
  private debug: boolean;
  private beaconService: BeaconService;

  constructor(
    config: OrbitportConfig,
    getToken: () => Promise<string | null>,
    beaconService: BeaconService,
    debug: boolean = false
  ) {
    this.config = config;
    this.getToken = getToken;
    this.debug = debug;
    this.beaconService = beaconService;
  }

  /**
   * Generates true random numbers using cosmic sources
   * @param request - Request parameters (src: "trng", "rng", or "ipfs")
   * @param options - Request options (timeout, retries, headers)
   * @returns Promise resolving to ServiceResult with CTRNGResponse
   */
  async random(
    request: Partial<CTRNGRequest> = {},
    options: RequestOptions = {}
  ): Promise<ServiceResult<CTRNGResponse>> {
    let sanitizedRequest = sanitizeCTRNGRequest(request);

    // If no API credentials are provided, force IPFS mode for clarity
    if (!this.config.clientId || !this.config.clientSecret) {
      if (sanitizedRequest.src !== "ipfs") {
        sanitizedRequest = {
          src: "ipfs",
          block: "INF",
          index: 0,
        };
        if (this.debug) {
          console.log(
            "[OrbitportSDK] No API credentials provided, switching to IPFS mode"
          );
        }
      }
    }

    const requestOptions = {
      timeout: options.timeout || this.config.timeout!,
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
      if (sanitizedRequest.src === "ipfs") {
        return await this._getFromIPFSBeacon(sanitizedRequest, requestOptions);
      } else if (
        sanitizedRequest.src === "trng" ||
        sanitizedRequest.src === "rng"
      ) {
        // TypeScript knows this is APICTRNGRequest
        if (this.config.clientId && this.config.clientSecret) {
          try {
            return await this._getFromAPI(sanitizedRequest, requestOptions);
          } catch (apiError) {
            if (this.debug) {
              console.log(
                "[OrbitportSDK] API failed, trying IPFS fallback:",
                apiError instanceof Error ? apiError.message : String(apiError)
              );
            }
            // Create IPFS request for fallback
            const ipfsRequest: IPFSCTRNGRequest = {
              src: "ipfs",
              block: "INF",
              index: 0,
            };
            return await this._getFromIPFSBeacon(ipfsRequest, requestOptions);
          }
        } else {
          // No API credentials, switch to IPFS
          const ipfsRequest: IPFSCTRNGRequest = {
            src: "ipfs",
            block: "INF",
            index: 0,
          };
          return await this._getFromIPFSBeacon(ipfsRequest, requestOptions);
        }
      } else {
        // Fallback case - should not happen with proper types
        throw new OrbitportSDKError(
          "Invalid request type",
          ERROR_CODES.INVALID_REQUEST
        );
      }
    } catch (error) {
      if (this.debug) {
        console.error("[OrbitportSDK] cTRNG generation failed:", error);
      }
      throw error;
    }
  }

  /**
   * Gets random data from API
   */
  private async _getFromAPI(
    request: APICTRNGRequest,
    options: RequestOptions
  ): Promise<ServiceResult<CTRNGResponse>> {
    const token = await this.getToken();
    if (!token) {
      throw new OrbitportSDKError(
        "No valid authentication token available",
        ERROR_CODES.AUTH_FAILED
      );
    }

    const url = `${this.config.apiUrl}/api/v1/services/trng`;
    const queryParams = new URLSearchParams();

    // Add src parameter if specified (defaults to "trng")
    if (request.src) {
      queryParams.append("src", request.src);
    }

    const fullUrl = queryParams.toString() ? `${url}?${queryParams}` : url;

    if (this.debug) {
      console.log("[OrbitportSDK] Making API request to:", fullUrl);
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
   * Gets random data from IPFS beacon (always reads from both sources and compares)
   */
  private async _getFromIPFSBeacon(
    request: CTRNGRequest,
    options: RequestOptions
  ): Promise<ServiceResult<CTRNGResponse>> {
    // Type guard to ensure this is an IPFS request
    if (request.src !== "ipfs") {
      throw new OrbitportSDKError(
        "Invalid request type for IPFS beacon",
        ERROR_CODES.INVALID_REQUEST
      );
    }

    const ipfsRequest = request as IPFSCTRNGRequest;
    const beaconPath =
      ipfsRequest.beaconPath || this.config.ipfs?.defaultBeaconPath;

    if (!beaconPath) {
      throw new OrbitportSDKError(
        "No beacon path provided and no default beacon path configured",
        ERROR_CODES.INVALID_REQUEST
      );
    }

    if (this.debug) {
      console.log("[OrbitportSDK] Reading from IPFS sources:", {
        gateway: this.config.ipfs?.gateway,
        api: this.config.ipfs?.apiUrl,
        path: beaconPath,
        block: ipfsRequest.block || "INF",
        index: ipfsRequest.index || 0,
      });
    }

    try {
      // Use block traversal if block is specified, otherwise get latest
      const ipfsResult = await this.beaconService.getBeaconWithBlockTraversal(
        {
          path: beaconPath,
          sources: ["both"],
          enableComparison: true,
          timeout: options.timeout,
          block: ipfsRequest.block,
        },
        options
      );

      // Handle comparison result
      if ("match" in ipfsResult.data) {
        const beaconData = ipfsResult.data.gateway || ipfsResult.data.api;
        if (!beaconData) {
          throw new OrbitportSDKError(
            "No valid beacon data found from any source",
            ERROR_CODES.INVALID_RESPONSE
          );
        }

        // Log comparison results and select the latest data
        if (this.debug) {
          if (ipfsResult.data.match) {
            console.log(
              "[OrbitportSDK] ✓ Gateway and API agree on sequence/previous"
            );
          } else {
            console.log(
              "[OrbitportSDK] ⚠ Difference detected:",
              ipfsResult.data.differences
            );
          }
        }

        // If there's a difference, pick the one with the latest sequence
        let selectedBeaconData = beaconData;
        if (
          !ipfsResult.data.match &&
          ipfsResult.data.gateway &&
          ipfsResult.data.api
        ) {
          const gatewaySeq = ipfsResult.data.gateway.sequence;
          const apiSeq = ipfsResult.data.api.sequence;

          if (gatewaySeq > apiSeq) {
            selectedBeaconData = ipfsResult.data.gateway;
            if (this.debug) {
              console.log(
                `[OrbitportSDK] Using gateway data (sequence ${gatewaySeq} > API sequence ${apiSeq})`
              );
            }
          } else if (apiSeq > gatewaySeq) {
            selectedBeaconData = ipfsResult.data.api;
            if (this.debug) {
              console.log(
                `[OrbitportSDK] Using API data (sequence ${apiSeq} > gateway sequence ${gatewaySeq})`
              );
            }
          }
        }

        // Convert to CTRNGResponse format and return selected cTRNG value
        const ctrngArray = selectedBeaconData.ctrng;
        if (!ctrngArray || ctrngArray.length === 0) {
          throw new OrbitportSDKError(
            "No cTRNG values found in beacon data",
            ERROR_CODES.INVALID_RESPONSE
          );
        }

        // Use index with modulo validation to prevent out-of-bounds access
        const requestedIndex = ipfsRequest.index ?? 0;
        const actualIndex = requestedIndex % ctrngArray.length;
        const ctrngValue = ctrngArray[actualIndex];

        if (this.debug && requestedIndex !== actualIndex) {
          console.log(
            `[OrbitportSDK] index ${requestedIndex} adjusted to ${actualIndex} (array length: ${ctrngArray.length})`
          );
        }

        const ctrngResponse: CTRNGResponse = {
          service: "ipfs-beacon",
          src: "ipfs",
          data: ctrngValue.toString(),
          timestamp: selectedBeaconData.timestamp,
          provider: "ipfs-beacon",
        };

        return {
          data: ctrngResponse,
          metadata: ipfsResult.metadata,
          success: true,
        };
      } else {
        // Single beacon data (fallback)
        const ctrngArray = ipfsResult.data.ctrng;
        if (!ctrngArray || ctrngArray.length === 0) {
          throw new OrbitportSDKError(
            "No cTRNG values found in beacon data",
            ERROR_CODES.INVALID_RESPONSE
          );
        }

        // Use index with modulo validation to prevent out-of-bounds access
        const requestedIndex = ipfsRequest.index ?? 0;
        const actualIndex = requestedIndex % ctrngArray.length;
        const ctrngValue = ctrngArray[actualIndex];

        if (this.debug && requestedIndex !== actualIndex) {
          console.log(
            `[OrbitportSDK] index ${requestedIndex} adjusted to ${actualIndex} (array length: ${ctrngArray.length})`
          );
        }

        const ctrngResponse: CTRNGResponse = {
          service: "ipfs-beacon",
          src: "ipfs",
          data: ctrngValue.toString(),
          timestamp: ipfsResult.data.timestamp,
          provider: "ipfs-beacon",
        };

        return {
          data: ctrngResponse,
          metadata: ipfsResult.metadata,
          success: true,
        };
      }
    } catch (error) {
      if (this.debug) {
        console.error("[OrbitportSDK] IPFS beacon request failed:", error);
      }
      throw error;
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

  /**
   * Updates IPFS configuration
   * @param ipfsConfig - New IPFS configuration
   */
  updateIPFSConfig(ipfsConfig: any): void {
    this.beaconService.updateConfig(ipfsConfig);
  }
}
