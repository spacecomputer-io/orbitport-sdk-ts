/**
 * IPFS service for accessing beacon data from IPFS/IPNS
 */

import type {
  BeaconData,
  IPFSSource,
  BeaconComparison,
  IPFSConfig,
  IPFSBeaconRequest,
  ServiceResult,
  ResponseMetadata,
  RequestOptions,
} from "../types";
import { OrbitportSDKError, ERROR_CODES } from "../utils/errors";
import { withRetry, RETRY_STRATEGIES } from "../utils/retry";

/**
 * IPFS service class for beacon data access
 */
export class BeaconService {
  private config: IPFSConfig;
  private gateway: string;
  private debug: boolean;

  constructor(config: IPFSConfig = {}, debug: boolean = false) {
    this.config = {
      gateway: "https://ipfs.io",
      apiUrl: "https://ipfs.io",
      timeout: 30000,
      enableFallback: true,
      ...config,
    };
    this.gateway = this.config.gateway!;
    this.debug = debug;

    if (this.debug) {
      console.log("[OrbitportSDK] IPFS service initialized with config:", {
        gateway: this.gateway,
        apiUrl: this.config.apiUrl,
        enableFallback: this.config.enableFallback,
      });
    }
  }

  /**
   * Validates if a path is a valid IPFS/IPNS path
   * @param path - Path to validate
   * @returns True if valid IPFS/IPNS path
   */
  private isValidPath(path: string): boolean {
    return path.startsWith("/ipns/") || path.startsWith("/ipfs/");
  }

  /**
   * Reads beacon data from IPFS gateway
   * @param path - IPFS/IPNS path
   * @param timeout - Request timeout
   * @returns Promise resolving to beacon data
   */
  private async readViaGateway(
    path: string,
    _timeout: number = this.config.timeout!
  ): Promise<IPFSSource> {
    const url = `${this.gateway}${path}`;

    if (this.debug) {
      console.log("[OrbitportSDK] Reading from gateway:", url);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), _timeout);

      try {
        const response = await fetch(url, {
          headers: { "Cache-Control": "no-cache" },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `Gateway ${this.gateway} returned ${response.status}`
          );
        }

        const text = await response.text();
        return {
          source: `gateway:${this.gateway}`,
          text,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      return {
        source: `gateway:${this.gateway}`,
        error: error instanceof Error ? error.message : "Unknown gateway error",
      };
    }
  }

  /**
   * Reads beacon data from IPFS API
   * @param path - IPFS/IPNS path
   * @param timeout - Request timeout
   * @returns Promise resolving to beacon data
   */
  private async readViaApi(
    path: string,
    _timeout: number = this.config.timeout!
  ): Promise<IPFSSource> {
    if (!this.config.apiUrl) {
      return {
        source: `api:${this.config.apiUrl}`,
        error: "IPFS API URL not configured",
      };
    }

    if (this.debug) {
      console.log("[OrbitportSDK] Reading from API:", path);
    }

    try {
      let effective = path;

      // Resolve IPNS to IPFS path if needed
      if (path.startsWith("/ipns/")) {
        const resolveUrl = `${
          this.config.apiUrl
        }/api/v0/name/resolve?arg=${encodeURIComponent(path)}`;
        const resolveResponse = await fetch(resolveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
        });

        if (!resolveResponse.ok) {
          throw new Error(`API resolve failed: ${resolveResponse.status}`);
        }

        const resolveData = await resolveResponse.json();
        if (!resolveData.Path) {
          throw new Error("API resolve failed: no path returned");
        }
        effective = resolveData.Path.trim();
      }

      // Read content from IPFS using direct HTTP call
      const catUrl = `${this.config.apiUrl}/api/v0/cat?arg=${encodeURIComponent(
        effective
      )}`;
      const response = await fetch(catUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`API cat failed: ${response.status}`);
      }

      const text = await response.text();
      return {
        source: `api:${this.config.apiUrl}`,
        text,
      };
    } catch (error) {
      return {
        source: `api:${this.config.apiUrl}`,
        error: error instanceof Error ? error.message : "Unknown API error",
      };
    }
  }

  /**
   * Parses beacon JSON data
   * @param jsonText - Raw JSON text
   * @returns Parsed beacon data
   */
  private parseBeacon(jsonText: string): BeaconData {
    const obj = JSON.parse(jsonText);

    if (
      !obj ||
      typeof obj !== "object" ||
      !obj.data ||
      typeof obj.data !== "object"
    ) {
      throw new Error("Unexpected beacon JSON structure");
    }

    const { previous } = obj;
    const { sequence, timestamp, ctrng } = obj.data;

    // Convert timestamp to ISO string if it's a Unix timestamp
    const iso =
      typeof timestamp === "number" && timestamp < 1e12
        ? new Date(timestamp * 1000).toISOString()
        : String(timestamp);

    return {
      previous,
      sequence,
      timestamp: iso,
      ctrng: Array.isArray(ctrng) ? ctrng : [],
    };
  }

  /**
   * Compares beacon data from different sources
   * @param gateway - Gateway beacon data
   * @param api - API beacon data
   * @returns Comparison result
   */
  private compareBeaconData(
    gateway: BeaconData | null,
    api: BeaconData | null
  ): BeaconComparison {
    const match =
      gateway &&
      api &&
      gateway.sequence === api.sequence &&
      gateway.previous === api.previous;

    const differences =
      gateway && api && !match
        ? {
            sequence:
              gateway.sequence !== api.sequence
                ? {
                    gateway: gateway.sequence,
                    api: api.sequence,
                  }
                : undefined,
            previous:
              gateway.previous !== api.previous
                ? {
                    gateway: gateway.previous || "",
                    api: api.previous || "",
                  }
                : undefined,
          }
        : undefined;

    return {
      gateway,
      api,
      match: !!match,
      differences,
    };
  }

  /**
   * Reads beacon data from multiple sources
   * @param path - IPFS/IPNS path
   * @param sources - Sources to read from
   * @param timeout - Request timeout
   * @returns Promise resolving to beacon data from all sources
   */
  private async readFromSources(
    path: string,
    sources: ("gateway" | "api")[] = ["gateway", "api"],
    timeout: number = this.config.timeout!
  ): Promise<IPFSSource[]> {
    const tasks: Promise<IPFSSource>[] = [];

    if (sources.includes("gateway")) {
      tasks.push(this.readViaGateway(path, timeout));
    }

    if (sources.includes("api")) {
      tasks.push(this.readViaApi(path, timeout));
    }

    return Promise.all(tasks);
  }

  /**
   * Gets beacon data from IPFS/IPNS
   * @param request - Beacon request parameters
   * @param options - Request options
   * @returns Promise resolving to beacon data
   */
  async getBeacon(
    request: IPFSBeaconRequest,
    options: RequestOptions = {}
  ): Promise<ServiceResult<BeaconData | BeaconComparison>> {
    const { path, sources = ["both"], enableComparison = false } = request;
    const requestOptions = {
      timeout: options.timeout || this.config.timeout!,
      retries: options.retries || 3,
    };

    if (!this.isValidPath(path)) {
      throw new OrbitportSDKError(
        "Invalid path: must start with /ipns/ or /ipfs/",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    if (this.debug) {
      console.log("[OrbitportSDK] Getting beacon data for path:", path);
    }

    try {
      const result = await withRetry(
        async () => {
          const sourceList = sources.includes("both")
            ? (["gateway", "api"] as ("gateway" | "api")[])
            : (sources as ("gateway" | "api")[]);
          const sources_data = await this.readFromSources(
            path,
            sourceList,
            requestOptions.timeout
          );

          // Check for errors
          const errors = sources_data.filter((s) => s.error);
          if (errors.length === sources_data.length) {
            throw new OrbitportSDKError(
              `All sources failed: ${errors.map((e) => e.error).join(", ")}`,
              ERROR_CODES.NETWORK_ERROR
            );
          }

          // Parse successful sources
          const parsedData: { source: string; data: BeaconData }[] = [];
          for (const source of sources_data) {
            if (source.text) {
              try {
                const data = this.parseBeacon(source.text);
                parsedData.push({ source: source.source, data });
              } catch (error) {
                if (this.debug) {
                  console.warn(
                    `[OrbitportSDK] Parse error for ${source.source}:`,
                    error
                  );
                }
              }
            }
          }

          if (parsedData.length === 0) {
            throw new OrbitportSDKError(
              "No valid beacon data found from any source",
              ERROR_CODES.INVALID_RESPONSE
            );
          }

          // Return single result or comparison
          if (enableComparison && parsedData.length >= 2) {
            const gateway =
              parsedData.find((p) => p.source.includes("gateway"))?.data ||
              null;
            const api =
              parsedData.find((p) => p.source.includes("api"))?.data || null;
            return this.compareBeaconData(gateway, api);
          } else {
            // Return the first successful result
            return parsedData[0].data;
          }
        },
        {
          ...RETRY_STRATEGIES.standard,
          maxAttempts: requestOptions.retries,
        },
        (error, attempt) => {
          if (this.debug) {
            console.warn(
              `[OrbitportSDK] Beacon request attempt ${attempt} failed:`,
              error.message
            );
          }
        }
      );

      const metadata: ResponseMetadata = {
        timestamp: Date.now(),
      };

      return {
        data: result,
        metadata,
        success: true,
      };
    } catch (error) {
      if (this.debug) {
        console.error("[OrbitportSDK] Beacon request failed:", error);
      }
      throw error;
    }
  }

  /**
   * Gets beacon data with automatic fallback
   * @param path - IPFS/IPNS path
   * @param options - Request options
   * @returns Promise resolving to beacon data
   */
  async getBeaconWithFallback(
    path: string,
    options: RequestOptions = {}
  ): Promise<ServiceResult<BeaconData>> {
    if (!this.config.enableFallback) {
      const result = await this.getBeacon({ path }, options);
      if ("sequence" in result.data) {
        return result as ServiceResult<BeaconData>;
      }
      throw new OrbitportSDKError(
        "Unexpected response type from getBeacon",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    // Try gateway first, then API as fallback
    try {
      const result = await this.getBeacon(
        { path, sources: ["gateway"] },
        options
      );
      if ("sequence" in result.data) {
        return result as ServiceResult<BeaconData>;
      }
      throw new OrbitportSDKError(
        "Unexpected response type from gateway",
        ERROR_CODES.INVALID_RESPONSE
      );
    } catch (error) {
      if (this.debug) {
        console.log("[OrbitportSDK] Gateway failed, trying API fallback");
      }
      const result = await this.getBeacon({ path, sources: ["api"] }, options);
      if ("sequence" in result.data) {
        return result as ServiceResult<BeaconData>;
      }
      throw new OrbitportSDKError(
        "Unexpected response type from API",
        ERROR_CODES.INVALID_RESPONSE
      );
    }
  }

  /**
   * Gets beacon data with block traversal
   * @param request - Beacon request parameters with block traversal
   * @param options - Request options
   * @returns Promise resolving to beacon data at specified block
   */
  async getBeaconWithBlockTraversal(
    request: IPFSBeaconRequest & { block?: number | "INF" },
    options: RequestOptions = {}
  ): Promise<ServiceResult<BeaconData | BeaconComparison>> {
    const { block = "INF" } = request;

    if (block === "INF") {
      // No traversal needed, get latest block
      return this.getBeacon(request, options);
    }

    if (typeof block !== "number" || block < 0) {
      throw new OrbitportSDKError(
        "Block number must be a non-negative integer",
        ERROR_CODES.INVALID_REQUEST
      );
    }

    if (this.debug) {
      console.log(`[OrbitportSDK] Starting block traversal to block ${block}`);
    }

    // Get the latest block first to check current sequence
    const latestResult = await this.getBeacon(request, options);
    let currentBeacon: BeaconData;

    if ("sequence" in latestResult.data) {
      currentBeacon = latestResult.data;
    } else if ("gateway" in latestResult.data) {
      currentBeacon = latestResult.data.gateway || latestResult.data.api!;
    } else {
      throw new OrbitportSDKError(
        "Invalid beacon data structure",
        ERROR_CODES.INVALID_RESPONSE
      );
    }

    const currentSequence = currentBeacon.sequence;

    if (block > currentSequence) {
      throw new OrbitportSDKError(
        `Requested block ${block} is greater than current block ${currentSequence}`,
        ERROR_CODES.INVALID_REQUEST
      );
    }

    if (block === currentSequence) {
      // Already at the requested block
      return latestResult;
    }

    // Traverse back through the chain
    let targetBeacon = currentBeacon;
    let traversedBlocks = 0;
    const maxTraversal = currentSequence - block;

    while (traversedBlocks < maxTraversal && targetBeacon.previous) {
      if (this.debug) {
        console.log(
          `[OrbitportSDK] Traversing from block ${targetBeacon.sequence} to previous block`
        );
      }

      // Get the previous block
      const previousPath = targetBeacon.previous;
      const previousResult = await this.getBeacon(
        { ...request, path: previousPath },
        options
      );

      let previousBeacon: BeaconData;
      if ("sequence" in previousResult.data) {
        previousBeacon = previousResult.data;
      } else if ("gateway" in previousResult.data) {
        previousBeacon =
          previousResult.data.gateway || previousResult.data.api!;
      } else {
        throw new OrbitportSDKError(
          "Invalid previous beacon data structure",
          ERROR_CODES.INVALID_RESPONSE
        );
      }

      targetBeacon = previousBeacon;
      traversedBlocks++;

      if (targetBeacon.sequence === block) {
        // Found the target block
        break;
      }

      if (targetBeacon.sequence < block) {
        throw new OrbitportSDKError(
          `Block ${block} not found in chain. Last available block: ${targetBeacon.sequence}`,
          ERROR_CODES.INVALID_REQUEST
        );
      }
    }

    if (targetBeacon.sequence !== block) {
      throw new OrbitportSDKError(
        `Failed to reach block ${block}. Current block: ${targetBeacon.sequence}`,
        ERROR_CODES.INVALID_REQUEST
      );
    }

    if (this.debug) {
      console.log(
        `[OrbitportSDK] Successfully traversed to block ${block} (${traversedBlocks} steps)`
      );
    }

    // Return the target beacon data in the same format as the original request
    if ("sequence" in latestResult.data) {
      return {
        data: targetBeacon,
        metadata: latestResult.metadata,
        success: true,
      };
    } else {
      // Return as comparison format but with single beacon
      return {
        data: {
          gateway: targetBeacon,
          api: null,
          match: true,
        },
        metadata: latestResult.metadata,
        success: true,
      };
    }
  }

  /**
   * Updates IPFS configuration
   * @param newConfig - New IPFS configuration
   */
  updateConfig(newConfig: Partial<IPFSConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.gateway) {
      this.gateway = newConfig.gateway;
    }

    if (newConfig.apiUrl) {
      // No need to update API client since we're using direct HTTP calls
      if (this.debug) {
        console.log("[OrbitportSDK] Updated IPFS API URL:", newConfig.apiUrl);
      }
    }

    if (this.debug) {
      console.log("[OrbitportSDK] IPFS configuration updated:", this.config);
    }
  }
}
