/**
 * Unit tests for error handling utilities
 */

import {
  OrbitportSDKError,
  ERROR_CODES,
  createErrorFromAPIResponse,
  createNetworkError,
  createConfigError,
  createValidationError,
  isRetryableError,
  isAuthError,
  formatErrorMessage,
} from "../../src/utils/errors";

describe("Error Handling", () => {
  describe("OrbitportSDKError", () => {
    it("should create error with all properties", () => {
      const error = new OrbitportSDKError(
        "Test error",
        ERROR_CODES.API_ERROR,
        400,
        { details: "test" }
      );

      expect(error.message).toBe("Test error");
      expect(error.code).toBe(ERROR_CODES.API_ERROR);
      expect(error.status).toBe(400);
      expect(error.details).toEqual({ details: "test" });
      expect(error.name).toBe("OrbitportSDKError");
    });

    it("should create error without optional properties", () => {
      const error = new OrbitportSDKError("Test error", ERROR_CODES.API_ERROR);

      expect(error.message).toBe("Test error");
      expect(error.code).toBe(ERROR_CODES.API_ERROR);
      expect(error.status).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe("createErrorFromAPIResponse", () => {
    it("should create error from API response", () => {
      const apiError = {
        error: "invalid_request",
        error_description: "Invalid request parameters",
        error_code: "INVALID_REQUEST",
        details: { field: "client_id" },
      };

      const error = createErrorFromAPIResponse(apiError, 400);
      expect(error.message).toBe("Invalid request parameters");
      expect(error.code).toBe("INVALID_REQUEST");
      expect(error.status).toBe(400);
      expect(error.details).toEqual({ field: "client_id" });
    });

    it("should handle missing error_code", () => {
      const apiError = {
        error: "server_error",
        error_description: "Internal server error",
      };

      const error = createErrorFromAPIResponse(apiError, 500);
      expect(error.message).toBe("Internal server error");
      expect(error.code).toBe(ERROR_CODES.API_ERROR);
    });

    it("should handle missing error_description", () => {
      const apiError = {
        error: "server_error",
        error_code: "SERVER_ERROR",
      };

      const error = createErrorFromAPIResponse(apiError, 500);
      expect(error.message).toBe("server_error");
      expect(error.code).toBe("SERVER_ERROR");
    });
  });

  describe("createNetworkError", () => {
    it("should create network error", () => {
      const originalError = new Error("Network error");
      const error = createNetworkError(originalError, 0);

      expect(error.message).toBe("Network error");
      expect(error.code).toBe(ERROR_CODES.NETWORK_ERROR);
      expect(error.status).toBe(0);
      expect(error.details).toEqual({ originalError });
    });

    it("should detect timeout errors", () => {
      const timeoutError = new Error("Request timeout");
      const error = createNetworkError(timeoutError);

      expect(error.message).toBe("Request timeout");
      expect(error.code).toBe(ERROR_CODES.TIMEOUT);
    });

    it("should detect AbortError", () => {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      const error = createNetworkError(abortError);

      expect(error.message).toBe("Request timeout");
      expect(error.code).toBe(ERROR_CODES.TIMEOUT);
    });

    it("should detect connection errors", () => {
      const connectionError = new Error("fetch failed");
      const error = createNetworkError(connectionError);

      expect(error.message).toBe("Connection failed");
      expect(error.code).toBe(ERROR_CODES.CONNECTION_FAILED);
    });
  });

  describe("createConfigError", () => {
    it("should create config error", () => {
      const error = createConfigError("Invalid configuration", {
        field: "clientId",
      });

      expect(error.message).toBe("Invalid configuration");
      expect(error.code).toBe(ERROR_CODES.INVALID_CONFIG);
      expect(error.details).toEqual({ field: "clientId" });
    });
  });

  describe("createValidationError", () => {
    it("should create validation error", () => {
      const error = createValidationError("Validation failed", [
        "field1",
        "field2",
      ]);

      expect(error.message).toBe("Validation failed");
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.details).toEqual(["field1", "field2"]);
    });
  });

  describe("isRetryableError", () => {
    it("should identify retryable errors", () => {
      const retryableErrors = [
        new OrbitportSDKError("Network error", ERROR_CODES.NETWORK_ERROR),
        new OrbitportSDKError("Timeout", ERROR_CODES.TIMEOUT),
        new OrbitportSDKError(
          "Connection failed",
          ERROR_CODES.CONNECTION_FAILED
        ),
        new OrbitportSDKError(
          "Service unavailable",
          ERROR_CODES.SERVICE_UNAVAILABLE
        ),
        new OrbitportSDKError("Rate limited", ERROR_CODES.RATE_LIMITED),
        new OrbitportSDKError(
          "Provider unavailable",
          ERROR_CODES.PROVIDER_UNAVAILABLE
        ),
      ];

      retryableErrors.forEach((error) => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it("should identify non-retryable errors", () => {
      const nonRetryableErrors = [
        new OrbitportSDKError("Auth failed", ERROR_CODES.AUTH_FAILED),
        new OrbitportSDKError("Invalid config", ERROR_CODES.INVALID_CONFIG),
        new OrbitportSDKError("Validation error", ERROR_CODES.VALIDATION_ERROR),
        new OrbitportSDKError("API error", ERROR_CODES.API_ERROR),
      ];

      nonRetryableErrors.forEach((error) => {
        expect(isRetryableError(error)).toBe(false);
      });
    });
  });

  describe("isAuthError", () => {
    it("should identify auth errors", () => {
      const authErrors = [
        new OrbitportSDKError("Auth failed", ERROR_CODES.AUTH_FAILED),
        new OrbitportSDKError(
          "Invalid credentials",
          ERROR_CODES.INVALID_CREDENTIALS
        ),
        new OrbitportSDKError("Token expired", ERROR_CODES.TOKEN_EXPIRED),
        new OrbitportSDKError(
          "Token refresh failed",
          ERROR_CODES.TOKEN_REFRESH_FAILED
        ),
      ];

      authErrors.forEach((error) => {
        expect(isAuthError(error)).toBe(true);
      });
    });

    it("should identify non-auth errors", () => {
      const nonAuthErrors = [
        new OrbitportSDKError("Network error", ERROR_CODES.NETWORK_ERROR),
        new OrbitportSDKError("Invalid config", ERROR_CODES.INVALID_CONFIG),
        new OrbitportSDKError("Validation error", ERROR_CODES.VALIDATION_ERROR),
        new OrbitportSDKError("API error", ERROR_CODES.API_ERROR),
      ];

      nonAuthErrors.forEach((error) => {
        expect(isAuthError(error)).toBe(false);
      });
    });
  });

  describe("formatErrorMessage", () => {
    it("should format known error messages", () => {
      const testCases = [
        {
          code: ERROR_CODES.AUTH_FAILED,
          expected: "Authentication failed. Please check your credentials.",
        },
        {
          code: ERROR_CODES.INVALID_CREDENTIALS,
          expected: "Invalid client ID or client secret.",
        },
        {
          code: ERROR_CODES.TOKEN_EXPIRED,
          expected: "Authentication token has expired. Please re-authenticate.",
        },
        {
          code: ERROR_CODES.NETWORK_ERROR,
          expected: "Network error occurred. Please check your connection.",
        },
        {
          code: ERROR_CODES.TIMEOUT,
          expected: "Request timed out. Please try again.",
        },
        {
          code: ERROR_CODES.RATE_LIMITED,
          expected:
            "Rate limit exceeded. Please wait before making another request.",
        },
        {
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          expected:
            "Service is temporarily unavailable. Please try again later.",
        },
        {
          code: ERROR_CODES.INVALID_CONFIG,
          expected: "Invalid SDK configuration. Please check your settings.",
        },
      ];

      testCases.forEach(({ code, expected }) => {
        const error = new OrbitportSDKError("Original message", code);
        expect(formatErrorMessage(error)).toBe(expected);
      });
    });

    it("should return original message for unknown errors", () => {
      const error = new OrbitportSDKError(
        "Custom error message",
        "UNKNOWN_ERROR"
      );
      expect(formatErrorMessage(error)).toBe("Custom error message");
    });
  });
});
