/**
 * Validation utilities for the Orbitport SDK
 */

import type {
  OrbitportConfig,
  CTRNGRequest,
  ValidationResult,
  RequestOptions,
} from "../types";
import { createValidationError } from "./errors";

/**
 * Validates the Orbitport configuration
 */
export function validateConfig(
  config: Partial<OrbitportConfig>
): ValidationResult {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push("clientId is required");
  } else if (
    typeof config.clientId !== "string" ||
    config.clientId.trim().length === 0
  ) {
    errors.push("clientId must be a non-empty string");
  }

  if (!config.clientSecret) {
    errors.push("clientSecret is required");
  } else if (
    typeof config.clientSecret !== "string" ||
    config.clientSecret.trim().length === 0
  ) {
    errors.push("clientSecret must be a non-empty string");
  }

  if (config.authUrl) {
    if (typeof config.authUrl !== "string") {
      errors.push("authUrl must be a string");
    } else if (!isValidUrl(config.authUrl)) {
      errors.push("authUrl must be a valid URL");
    }
  }

  if (config.apiUrl) {
    if (typeof config.apiUrl !== "string") {
      errors.push("apiUrl must be a string");
    } else if (!isValidUrl(config.apiUrl)) {
      errors.push("apiUrl must be a valid URL");
    }
  }

  if (
    config.timeout !== undefined &&
    (typeof config.timeout !== "number" || config.timeout <= 0)
  ) {
    errors.push("timeout must be a positive number");
  }

  if (
    config.retryAttempts !== undefined &&
    (typeof config.retryAttempts !== "number" || config.retryAttempts < 0)
  ) {
    errors.push("retryAttempts must be a non-negative number");
  }

  if (
    config.retryDelay !== undefined &&
    (typeof config.retryDelay !== "number" || config.retryDelay <= 0)
  ) {
    errors.push("retryDelay must be a positive number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates cTRNG request parameters
 */
export function validateCTRNGRequest(
  request: Partial<CTRNGRequest>
): ValidationResult {
  const errors: string[] = [];

  if (request.src && !["trng", "rng"].includes(request.src)) {
    errors.push("src must be one of: trng, rng");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates request options
 */
export function validateRequestOptions(
  options: Partial<RequestOptions>
): ValidationResult {
  const errors: string[] = [];

  if (
    options.timeout !== undefined &&
    (typeof options.timeout !== "number" || options.timeout <= 0)
  ) {
    errors.push("timeout must be a positive number");
  }

  if (
    options.retries !== undefined &&
    (typeof options.retries !== "number" ||
      options.retries < 0 ||
      options.retries > 10)
  ) {
    errors.push("retries must be a number between 0 and 10");
  }

  if (options.headers && typeof options.headers !== "object") {
    errors.push("headers must be an object");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates JWT token format (basic validation)
 */
export function isValidJWT(token: string): boolean {
  if (typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  try {
    // Try to decode the header and payload
    JSON.parse(atob(parts[0]));
    JSON.parse(atob(parts[1]));
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates token expiration
 */
export function isTokenExpired(
  token: string,
  bufferSeconds: number = 60
): boolean {
  if (!isValidJWT(token)) {
    return true;
  }

  try {
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1]));

    if (!payload.exp || typeof payload.exp !== "number") {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now + bufferSeconds;
  } catch {
    return true;
  }
}

/**
 * Sanitizes configuration by removing undefined values and applying defaults
 */
export function sanitizeConfig(
  config: Partial<OrbitportConfig>
): OrbitportConfig {
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw createValidationError("Invalid configuration", validation.errors);
  }

  return {
    clientId: config.clientId!.trim(),
    clientSecret: config.clientSecret!.trim(),
    authUrl: config.authUrl || getDefaultAuthUrl(),
    apiUrl: config.apiUrl || getDefaultApiUrl(),
    timeout: config.timeout || 30000,
    retryAttempts: config.retryAttempts || 3,
    retryDelay: config.retryDelay || 1000,
  };
}

/**
 * Sanitizes request options by applying defaults and validation
 */
export function sanitizeRequestOptions(
  options: Partial<RequestOptions> = {}
): RequestOptions {
  const validation = validateRequestOptions(options);
  if (!validation.valid) {
    throw createValidationError("Invalid request options", validation.errors);
  }

  return {
    timeout: options.timeout || 30000,
    retries: options.retries || 3,
    headers: options.headers || {},
  };
}

/**
 * Gets default auth URL
 */
function getDefaultAuthUrl(): string {
  return "https://dev-1usujmbby8627ni8.us.auth0.com";
}

/**
 * Gets default API URL
 */
function getDefaultApiUrl(): string {
  return "https://op.spacecomputer.io";
}

/**
 * Validates and sanitizes cTRNG request
 */
export function sanitizeCTRNGRequest(
  request: Partial<CTRNGRequest>
): CTRNGRequest {
  const validation = validateCTRNGRequest(request);
  if (!validation.valid) {
    throw createValidationError(
      validation.errors.join(", "),
      validation.errors
    );
  }

  return {
    src: request.src || "trng",
  };
}
