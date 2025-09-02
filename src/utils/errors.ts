/**
 * Error handling utilities for the Orbitport SDK
 */

import type { OrbitportError, APIError } from "../types";

/**
 * Custom error class for Orbitport SDK errors
 */
export class OrbitportSDKError extends Error implements OrbitportError {
  public readonly code: ErrorCode;
  public readonly status?: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: ErrorCode,
    status?: number,
    details?: unknown
  ) {
    super(message);
    this.name = "OrbitportSDKError";
    this.code = code;
    this.status = status;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OrbitportSDKError);
    }
  }
}

/**
 * Error codes used throughout the SDK
 */
export const ERROR_CODES = {
  // Authentication errors
  AUTH_FAILED: "AUTH_FAILED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",

  // Configuration errors
  INVALID_CONFIG: "INVALID_CONFIG",
  MISSING_CLIENT_ID: "MISSING_CLIENT_ID",
  MISSING_CLIENT_SECRET: "MISSING_CLIENT_SECRET",

  // Network errors
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  CONNECTION_FAILED: "CONNECTION_FAILED",

  // API errors
  API_ERROR: "API_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INVALID_RESPONSE: "INVALID_RESPONSE",

  // Storage errors
  STORAGE_ERROR: "STORAGE_ERROR",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_PARAMETERS: "INVALID_PARAMETERS",

  // Service-specific errors
  CTRNG_ERROR: "CTRNG_ERROR",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  FALLBACK_FAILED: "FALLBACK_FAILED",

  // Unknown errors
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

/**
 * Type for error code values
 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Creates an OrbitportSDKError from an API error response
 */
export function createErrorFromAPIResponse(
  apiError: APIError,
  status?: number
): OrbitportSDKError {
  const code: ErrorCode =
    (apiError.error_code as ErrorCode) || ERROR_CODES.API_ERROR;
  const message = apiError.error_description || apiError.error || "API Error";

  return new OrbitportSDKError(message, code, status, apiError.details);
}

/**
 * Creates an OrbitportSDKError from a network error
 */
export function createNetworkError(
  error: Error,
  status?: number
): OrbitportSDKError {
  let code: ErrorCode = ERROR_CODES.NETWORK_ERROR;
  let message = error.message;

  if (error.name === "AbortError" || message.includes("timeout")) {
    code = ERROR_CODES.TIMEOUT;
    message = "Request timeout";
  } else if (message.includes("fetch")) {
    code = ERROR_CODES.CONNECTION_FAILED;
    message = "Connection failed";
  }

  return new OrbitportSDKError(message, code, status, { originalError: error });
}

/**
 * Creates an OrbitportSDKError for configuration issues
 */
export function createConfigError(
  message: string,
  details?: unknown
): OrbitportSDKError {
  return new OrbitportSDKError(
    message,
    ERROR_CODES.INVALID_CONFIG,
    undefined,
    details
  );
}

/**
 * Creates an OrbitportSDKError for validation issues
 */
export function createValidationError(
  message: string,
  details?: unknown
): OrbitportSDKError {
  return new OrbitportSDKError(
    message,
    ERROR_CODES.VALIDATION_ERROR,
    undefined,
    details
  );
}

/**
 * Determines if an error is retryable
 */
export function isRetryableError(error: OrbitportSDKError): boolean {
  const retryableCodes: ErrorCode[] = [
    ERROR_CODES.NETWORK_ERROR,
    ERROR_CODES.TIMEOUT,
    ERROR_CODES.CONNECTION_FAILED,
    ERROR_CODES.SERVICE_UNAVAILABLE,
    ERROR_CODES.RATE_LIMITED,
    ERROR_CODES.PROVIDER_UNAVAILABLE,
  ];

  return retryableCodes.includes(error.code as ErrorCode);
}

/**
 * Determines if an error is related to authentication
 */
export function isAuthError(error: OrbitportSDKError): boolean {
  const authCodes: ErrorCode[] = [
    ERROR_CODES.AUTH_FAILED,
    ERROR_CODES.INVALID_CREDENTIALS,
    ERROR_CODES.TOKEN_EXPIRED,
    ERROR_CODES.TOKEN_REFRESH_FAILED,
  ];

  return authCodes.includes(error.code as ErrorCode);
}

/**
 * Error message formatter for user-friendly error messages
 */
export function formatErrorMessage(error: OrbitportSDKError): string {
  const baseMessage = error.message;

  switch (error.code) {
    case ERROR_CODES.AUTH_FAILED:
      return "Authentication failed. Please check your credentials.";
    case ERROR_CODES.INVALID_CREDENTIALS:
      return "Invalid client ID or client secret.";
    case ERROR_CODES.TOKEN_EXPIRED:
      return "Authentication token has expired. Please re-authenticate.";
    case ERROR_CODES.NETWORK_ERROR:
      return "Network error occurred. Please check your connection.";
    case ERROR_CODES.TIMEOUT:
      return "Request timed out. Please try again.";
    case ERROR_CODES.RATE_LIMITED:
      return "Rate limit exceeded. Please wait before making another request.";
    case ERROR_CODES.SERVICE_UNAVAILABLE:
      return "Service is temporarily unavailable. Please try again later.";
    case ERROR_CODES.INVALID_CONFIG:
      return "Invalid SDK configuration. Please check your settings.";
    default:
      return baseMessage;
  }
}
