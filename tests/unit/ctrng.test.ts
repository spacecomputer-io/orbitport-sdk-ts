/**
 * Unit tests for CTRNGService
 */

import { CTRNGService } from "../../src/services/ctrng";
import { OrbitportSDKError, ERROR_CODES } from "../../src/utils/errors";

// Mock fetch
global.fetch = jest.fn();

const mockGetToken = jest.fn();
const mockConfig = {
  apiUrl: "https://test-api.com",
  timeout: 30000,
  debug: true,
};

describe("CTRNGService", () => {
  let ctrngService: CTRNGService;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrngService = new CTRNGService(
      mockConfig.apiUrl,
      mockGetToken,
      mockConfig.timeout,
      mockConfig.debug
    );
  });

  describe("constructor", () => {
    it("should initialize with provided parameters", () => {
      expect(ctrngService).toBeDefined();
    });
  });

  describe("random", () => {
    it("should use default source when no request provided", async () => {
      const mockToken = "test-token";
      const mockResponse = {
        service: "trng",
        src: "aptosorbital",
        data: "test-random-data",
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map([["x-request-id", "test-request-id"]]),
      });

      const result = await ctrngService.random();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(result.metadata.timestamp).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        "https://test-api.com/api/v1/services/trng?src=trng",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            Accept: "application/json",
          }),
        })
      );
    });

    it("should use provided source in request", async () => {
      const mockToken = "test-token";
      const mockResponse = {
        service: "trng",
        src: "aptosorbital",
        data: "test-random-data",
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      const result = await ctrngService.random({ src: "rng" });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://test-api.com/api/v1/services/trng?src=rng",
        expect.any(Object)
      );
    });

    it("should handle request options", async () => {
      const mockToken = "test-token";
      const mockResponse = {
        service: "trng",
        src: "aptosorbital",
        data: "test-random-data",
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      const result = await ctrngService.random(
        { src: "trng" },
        { timeout: 10000, retries: 2, headers: { "Custom-Header": "value" } }
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://test-api.com/api/v1/services/trng?src=trng",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Custom-Header": "value",
          }),
        })
      );
    });

    it("should throw error when no token available", async () => {
      mockGetToken.mockResolvedValue(null);

      await expect(ctrngService.random()).rejects.toThrow(
        new OrbitportSDKError(
          "No valid authentication token available",
          ERROR_CODES.AUTH_FAILED
        )
      );
    });

    it("should handle API error responses", async () => {
      const mockToken = "test-token";
      const mockErrorResponse = {
        error: "rate_limit_exceeded",
        error_description: "Too many requests",
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve(mockErrorResponse),
      });

      await expect(ctrngService.random()).rejects.toThrow(OrbitportSDKError);
    });

    it("should handle network errors", async () => {
      const mockToken = "test-token";

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      await expect(ctrngService.random()).rejects.toThrow(OrbitportSDKError);
    });

    it("should handle timeout errors", async () => {
      const mockToken = "test-token";

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error("The operation was aborted")
      );

      await expect(ctrngService.random()).rejects.toThrow(OrbitportSDKError);
    });

    it("should validate response structure", async () => {
      const mockToken = "test-token";
      const invalidResponse = {
        // Missing required fields
        service: "trng",
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidResponse),
        headers: new Map(),
      });

      await expect(ctrngService.random()).rejects.toThrow(OrbitportSDKError);
    });

    it("should handle response with signature", async () => {
      const mockToken = "test-token";
      const mockResponse = {
        service: "trng",
        src: "aptosorbital",
        data: "test-random-data",
        signature: {
          value: "signature-value",
          pk: "public-key",
          algo: "ed25519",
        },
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      const result = await ctrngService.random();

      expect(result.success).toBe(true);
      expect(result.data.signature).toEqual(mockResponse.signature);
    });

    it("should handle invalid signature structure", async () => {
      const mockToken = "test-token";
      const mockResponse = {
        service: "trng",
        src: "aptosorbital",
        data: "test-random-data",
        signature: {
          // Missing required value field
          pk: "public-key",
        },
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      await expect(ctrngService.random()).rejects.toThrow(OrbitportSDKError);
    });
  });
});
