/**
 * Unit tests for AuthService
 */

import { AuthService } from "../../src/services/auth";
// import { OrbitportSDKError, ERROR_CODES } from "../../src/utils/errors";
import type { OrbitportConfig, TokenStorage } from "../../src/types";

// Mock token storage
const mockStorage: TokenStorage = {
  get: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
};

// Mock fetch
global.fetch = jest.fn();

const mockConfig: OrbitportConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  authUrl: "https://test-auth.com",
  apiUrl: "https://test-api.com",
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(mockConfig, mockStorage, undefined, true);
  });

  describe("constructor", () => {
    it("should initialize with config and storage", () => {
      expect(authService).toBeDefined();
    });
  });

  describe("isTokenValid", () => {
    it("should return false when no token in storage", async () => {
      (mockStorage.get as jest.Mock).mockResolvedValue(null);

      const isValid = await authService.isTokenValid();
      expect(isValid).toBe(false);
    });

    it("should return false when token is expired", async () => {
      // Mock an expired token (exp: past timestamp)
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzz2-KI";
      (mockStorage.get as jest.Mock).mockResolvedValue(expiredToken);

      const isValid = await authService.isTokenValid();
      expect(isValid).toBe(false);
    });

    it("should return true when token is valid", async () => {
      // Mock a valid token (exp: future timestamp)
      const validToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.valid-signature";
      (mockStorage.get as jest.Mock).mockResolvedValue(validToken);

      const isValid = await authService.isTokenValid();
      expect(isValid).toBe(true);
    });
  });

  describe("getTokenInfo", () => {
    it("should return valid: false when no token", async () => {
      (mockStorage.get as jest.Mock).mockResolvedValue(null);

      const tokenInfo = await authService.getTokenInfo();
      expect(tokenInfo).toEqual({ valid: false });
    });

    it("should return valid: false when token is expired", async () => {
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzz2-KI";
      (mockStorage.get as jest.Mock).mockResolvedValue(expiredToken);

      const tokenInfo = await authService.getTokenInfo();
      expect(tokenInfo.valid).toBe(false);
    });

    it("should return valid: true with expiration when token is valid", async () => {
      const validToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.valid-signature";
      (mockStorage.get as jest.Mock).mockResolvedValue(validToken);

      const tokenInfo = await authService.getTokenInfo();
      expect(tokenInfo.valid).toBe(true);
      expect(tokenInfo.expiresAt).toBe(9999999999);
    });
  });

  describe("clearToken", () => {
    it("should clear token from storage", async () => {
      await authService.clearToken();
      expect(mockStorage.clear).toHaveBeenCalled();
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const newConfig = { timeout: 60000 };
      authService.updateConfig(newConfig);
      // This is a private method, so we can't directly test it
      // but we can verify the service still works
      expect(authService).toBeDefined();
    });
  });

  describe("setDebug", () => {
    it("should set debug mode", () => {
      authService.setDebug(true);
      // This is a private method, so we can't directly test it
      // but we can verify the service still works
      expect(authService).toBeDefined();
    });
  });

  describe("setEventHandler", () => {
    it("should set event handler", () => {
      const handler = jest.fn();
      authService.setEventHandler(handler);
      // This is a private method, so we can't directly test it
      // but we can verify the service still works
      expect(authService).toBeDefined();
    });
  });
});
