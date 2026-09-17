/**
 * Unit tests for validation utilities
 */

import {
  validateConfig,
  validateRequestOptions,
  isValidUrl,
  isValidJWT,
  isTokenExpired,
  sanitizeConfig,
  sanitizeRequestOptions,
} from "../../src/utils/validation";

describe("Validation Utilities", () => {
  describe("validateConfig", () => {
    it("should validate correct configuration", () => {
      const config = {
        accessToken: "test-access-token",
        apiUrl: "https://api.example.com",
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should accept a direct access token configuration", () => {
      const result = validateConfig({ accessToken: "header.payload.signature" });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid URLs", () => {
      const config = {
        accessToken: "test-access-token",
        apiUrl: "also-not-a-url",
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("apiUrl must be a valid URL");
    });

    it("should reject invalid timeout", () => {
      const config = {
        accessToken: "test-access-token",
        timeout: -1000,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("timeout must be a positive number");
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
        accessToken: "  test-access-token  ",
      };

      const result = sanitizeConfig(config);
      expect(result.accessToken).toBe("test-access-token");
      expect(result.apiUrl).toBeDefined();
      expect(result.timeout).toBe(30000);
      expect(result.retryAttempts).toBe(3);
      expect(result.retryDelay).toBe(1000);
    });

    it("should throw on invalid config", () => {
      const config = {
        accessToken: "",
      };

      expect(() => sanitizeConfig(config)).toThrow();
    });

    it("should trim and preserve a direct access token", () => {
      const result = sanitizeConfig({ accessToken: "  header.payload.signature  " });

      expect(result.accessToken).toBe("header.payload.signature");
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
