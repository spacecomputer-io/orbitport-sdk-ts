/**
 * Unit tests for validation utilities
 */

import {
  validateConfig,
  validateCTRNGRequest,
  validateRequestOptions,
  isValidUrl,
  isValidJWT,
  isTokenExpired,
  sanitizeConfig,
  sanitizeCTRNGRequest,
  sanitizeRequestOptions,
} from "../../src/utils/validation";

describe("Validation Utilities", () => {
  describe("validateConfig", () => {
    it("should validate correct configuration", () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        authUrl: "https://auth.example.com",
        apiUrl: "https://api.example.com",
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject missing clientId when clientSecret is provided", () => {
      const config = {
        clientSecret: "test-client-secret",
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Both clientId and clientSecret must be provided together"
      );
    });

    it("should reject missing clientSecret when clientId is provided", () => {
      const config = {
        clientId: "test-client-id",
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Both clientId and clientSecret must be provided together"
      );
    });

    it("should reject invalid URLs", () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        authUrl: "not-a-url",
        apiUrl: "also-not-a-url",
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("authUrl must be a valid URL");
      expect(result.errors).toContain("apiUrl must be a valid URL");
    });

    it("should reject invalid timeout", () => {
      const config = {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        timeout: -1000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("timeout must be a positive number");
    });
  });

  describe("validateCTRNGRequest", () => {
    it("should validate correct API request", () => {
      const request = { src: "trng" as const };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate rng source", () => {
      const request = { src: "rng" as const };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(true);
    });

    it("should validate IPFS request with all parameters", () => {
      const request = {
        src: "ipfs" as const,
        beaconPath: "/ipns/test-beacon",
        block: 10012,
        index: 2,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate IPFS request with INF block", () => {
      const request = {
        src: "ipfs" as const,
        block: "INF" as const,
        index: 0,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(true);
    });

    it("should reject invalid source", () => {
      const request = { src: "invalid" as any };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("src must be one of: trng, rng, ipfs");
    });

    it("should reject IPFS request with invalid beacon path", () => {
      const request = {
        src: "ipfs" as const,
        beaconPath: "invalid-path",
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "beaconPath must be a valid IPFS/IPNS path starting with /ipns/ or /ipfs/"
      );
    });

    it("should reject IPFS request with negative index", () => {
      const request = {
        src: "ipfs" as const,
        index: -1,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("index must be a non-negative integer");
    });

    it("should reject IPFS request with non-integer index", () => {
      const request = {
        src: "ipfs" as const,
        index: 1.5,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("index must be a non-negative integer");
    });

    it("should reject IPFS request with negative block", () => {
      const request = {
        src: "ipfs" as const,
        block: -1,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "block must be 'INF' or a non-negative integer"
      );
    });

    it("should reject IPFS request with non-integer block", () => {
      const request = {
        src: "ipfs" as const,
        block: 1.5,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "block must be 'INF' or a non-negative integer"
      );
    });

    it("should reject non-IPFS request with IPFS parameters", () => {
      const request = {
        src: "trng" as const,
        beaconPath: "/ipns/test",
        block: 10012,
        index: 0,
      };
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "IPFS-specific parameters (beaconPath, index, block) can only be used with src: 'ipfs'"
      );
    });

    it("should accept empty request", () => {
      const request = {};
      const result = validateCTRNGRequest(request);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateRequestOptions", () => {
    it("should validate correct options", () => {
      const options = {
        timeout: 30000,
        retries: 3,
        headers: { "Content-Type": "application/json" },
      };

      const result = validateRequestOptions(options);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid timeout", () => {
      const options = { timeout: -1000 };
      const result = validateRequestOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("timeout must be a positive number");
    });

    it("should reject invalid retries", () => {
      const options = { retries: 15 };
      const result = validateRequestOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "retries must be a number between 0 and 10"
      );
    });
  });

  describe("isValidUrl", () => {
    it("should validate correct URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://localhost:3000")).toBe(true);
      expect(isValidUrl("https://api.example.com/v1")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
      // Note: FTP URLs are technically valid URLs, so we accept them
      expect(isValidUrl("ftp://example.com")).toBe(true);
    });
  });

  describe("isValidJWT", () => {
    it("should validate correct JWT", () => {
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(
        JSON.stringify({ sub: "user123", exp: Date.now() / 1000 + 3600 })
      );
      const signature = "test-signature";
      const token = `${header}.${payload}.${signature}`;

      expect(isValidJWT(token)).toBe(true);
    });

    it("should reject invalid JWT", () => {
      expect(isValidJWT("invalid-token")).toBe(false);
      expect(isValidJWT("too.short")).toBe(false);
      expect(isValidJWT("")).toBe(false);
      expect(isValidJWT("header.payload")).toBe(false);
    });

    it("should reject JWT that is too short", () => {
      expect(isValidJWT("a.b.c")).toBe(false);
    });
  });

  describe("isTokenExpired", () => {
    it("should detect expired token", () => {
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(
        JSON.stringify({
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        })
      );
      const signature = "test-signature";
      const token = `${header}.${payload}.${signature}`;

      expect(isTokenExpired(token)).toBe(true);
    });

    it("should detect valid token", () => {
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(
        JSON.stringify({
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
        })
      );
      const signature = "test-signature";
      const token = `${header}.${payload}.${signature}`;

      expect(isTokenExpired(token)).toBe(false);
    });

    it("should handle invalid JWT", () => {
      expect(isTokenExpired("invalid-token")).toBe(true);
    });
  });

  describe("sanitizeConfig", () => {
    it("should sanitize and apply defaults", () => {
      const config = {
        clientId: "  test-client-id  ",
        clientSecret: "  test-client-secret  ",
      };

      const result = sanitizeConfig(config);
      expect(result.clientId).toBe("test-client-id");
      expect(result.clientSecret).toBe("test-client-secret");
      expect(result.authUrl).toBeDefined();
      expect(result.apiUrl).toBeDefined();
      expect(result.timeout).toBe(30000);
      expect(result.retryAttempts).toBe(3);
      expect(result.retryDelay).toBe(1000);
    });

    it("should throw on invalid config", () => {
      const config = {
        clientId: "",
        clientSecret: "test-secret",
      };

      expect(() => sanitizeConfig(config)).toThrow();
    });
  });

  describe("sanitizeCTRNGRequest", () => {
    it("should sanitize API request with defaults", () => {
      const request = {};
      const result = sanitizeCTRNGRequest(request);
      expect(result.src).toBe("trng");
    });

    it("should preserve valid API src", () => {
      const request = { src: "rng" as const };
      const result = sanitizeCTRNGRequest(request);
      expect(result.src).toBe("rng");
    });

    it("should sanitize IPFS request with defaults", () => {
      const request = { src: "ipfs" as const };
      const result = sanitizeCTRNGRequest(request);
      expect(result.src).toBe("ipfs");
      expect((result as any).block).toBe("INF");
      expect((result as any).index).toBe(0);
    });

    it("should preserve IPFS parameters", () => {
      const request = {
        src: "ipfs" as const,
        beaconPath: "/ipns/test-beacon",
        block: 10012,
        index: 2,
      };
      const result = sanitizeCTRNGRequest(request);
      expect(result.src).toBe("ipfs");
      expect((result as any).beaconPath).toBe("/ipns/test-beacon");
      expect((result as any).block).toBe(10012);
      expect((result as any).index).toBe(2);
    });

    it("should apply defaults for missing IPFS parameters", () => {
      const request = {
        src: "ipfs" as const,
        beaconPath: "/ipns/test-beacon",
      };
      const result = sanitizeCTRNGRequest(request);
      expect(result.src).toBe("ipfs");
      expect((result as any).beaconPath).toBe("/ipns/test-beacon");
      expect((result as any).block).toBe("INF");
      expect((result as any).index).toBe(0);
    });

    it("should throw on invalid request", () => {
      const request = { src: "invalid" as any };
      expect(() => sanitizeCTRNGRequest(request)).toThrow();
    });

    it("should throw on non-IPFS request with IPFS parameters", () => {
      const request = {
        src: "trng" as const,
        block: 10012,
      };
      expect(() => sanitizeCTRNGRequest(request)).toThrow();
    });
  });

  describe("sanitizeRequestOptions", () => {
    it("should sanitize with defaults", () => {
      const options = {};
      const result = sanitizeRequestOptions(options);
      expect(result.timeout).toBe(30000);
      expect(result.retries).toBe(3);
      expect(result.headers).toEqual({});
    });

    it("should preserve valid options", () => {
      const options = {
        timeout: 60000,
        retries: 5,
        headers: { "X-Custom": "value" },
      };
      const result = sanitizeRequestOptions(options);
      expect(result.timeout).toBe(60000);
      expect(result.retries).toBe(5);
      expect(result.headers).toEqual({ "X-Custom": "value" });
    });
  });
});
