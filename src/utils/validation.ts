/**
 * Validation utilities for the Orbitport SDK
 */

import type {
  OrbitportConfig,
  CTRNGRequest,
  ValidationResult,
  RequestOptions,
  IPFSCTRNGRequest,
} from '../types';
import { createValidationError } from './errors';

/**
 * Validates the Orbitport configuration
 */
export function validateConfig(
  config: Partial<OrbitportConfig>,
): ValidationResult {
  const errors: string[] = [];

  // Credentials are optional - if provided, they must be valid
  if (config.clientId !== undefined) {
    if (
      typeof config.clientId !== 'string' ||
      config.clientId.trim().length === 0
    ) {
      errors.push('clientId must be a non-empty string');
    }
  }

  if (config.clientSecret !== undefined) {
    if (
      typeof config.clientSecret !== 'string' ||
      config.clientSecret.trim().length === 0
    ) {
      errors.push('clientSecret must be a non-empty string');
    }
  }

  // If one credential is provided, both must be provided
  if (
    (config.clientId && !config.clientSecret) ||
    (!config.clientId && config.clientSecret)
  ) {
    errors.push('Both clientId and clientSecret must be provided together');
  }

  if (config.authUrl) {
    if (typeof config.authUrl !== 'string') {
      errors.push('authUrl must be a string');
    } else if (!isValidUrl(config.authUrl)) {
      errors.push('authUrl must be a valid URL');
    }
  }

  if (config.apiUrl) {
    if (typeof config.apiUrl !== 'string') {
      errors.push('apiUrl must be a string');
    } else if (!isValidUrl(config.apiUrl)) {
      errors.push('apiUrl must be a valid URL');
    }
  }

  if (
    config.timeout !== undefined &&
    (typeof config.timeout !== 'number' || config.timeout <= 0)
  ) {
    errors.push('timeout must be a positive number');
  }

  if (
    config.retryAttempts !== undefined &&
    (typeof config.retryAttempts !== 'number' || config.retryAttempts < 0)
  ) {
    errors.push('retryAttempts must be a non-negative number');
  }

  if (
    config.retryDelay !== undefined &&
    (typeof config.retryDelay !== 'number' || config.retryDelay <= 0)
  ) {
    errors.push('retryDelay must be a positive number');
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
  request: Partial<CTRNGRequest>,
): ValidationResult {
  const errors: string[] = [];

  if (request.src && !['trng', 'rng', 'ipfs'].includes(request.src)) {
    errors.push('src must be one of: trng, rng, ipfs');
  }

  // Validate IPFS-specific parameters only if src is "ipfs"
  if (request.src === 'ipfs') {
    const ipfsRequest = request as IPFSCTRNGRequest;

    if (ipfsRequest.beaconPath) {
      if (
        typeof ipfsRequest.beaconPath !== 'string' ||
        (!ipfsRequest.beaconPath.startsWith('/ipns/') &&
          !ipfsRequest.beaconPath.startsWith('/ipfs/'))
      ) {
        errors.push(
          'beaconPath must be a valid IPFS/IPNS path starting with /ipns/ or /ipfs/',
        );
      }
    }

    if (ipfsRequest.index !== undefined) {
      if (
        typeof ipfsRequest.index !== 'number' ||
        !Number.isInteger(ipfsRequest.index) ||
        ipfsRequest.index < 0
      ) {
        errors.push('index must be a non-negative integer');
      }
    }

    if (ipfsRequest.block !== undefined) {
      if (
        ipfsRequest.block !== 'INF' &&
        (typeof ipfsRequest.block !== 'number' ||
          !Number.isInteger(ipfsRequest.block) ||
          ipfsRequest.block < 0)
      ) {
        errors.push("block must be 'INF' or a non-negative integer");
      }
    }
  } else {
    // For non-IPFS requests, validate that IPFS-specific parameters are not provided
    const hasIpfsParams =
      'beaconPath' in request || 'index' in request || 'block' in request;

    if (hasIpfsParams) {
      errors.push(
        "IPFS-specific parameters (beaconPath, index, block) can only be used with src: 'ipfs'",
      );
    }
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
  options: Partial<RequestOptions>,
): ValidationResult {
  const errors: string[] = [];

  if (
    options.timeout !== undefined &&
    (typeof options.timeout !== 'number' || options.timeout <= 0)
  ) {
    errors.push('timeout must be a positive number');
  }

  if (
    options.retries !== undefined &&
    (typeof options.retries !== 'number' ||
      options.retries < 0 ||
      options.retries > 10)
  ) {
    errors.push('retries must be a number between 0 and 10');
  }

  if (options.headers && typeof options.headers !== 'object') {
    errors.push('headers must be an object');
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
  if (typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
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
  bufferSeconds: number = 60,
): boolean {
  if (!isValidJWT(token)) {
    return true;
  }

  try {
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));

    if (!payload.exp || typeof payload.exp !== 'number') {
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
  config: Partial<OrbitportConfig>,
): OrbitportConfig {
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw createValidationError('Invalid configuration', validation.errors);
  }

  return {
    clientId: config.clientId?.trim(),
    clientSecret: config.clientSecret?.trim(),
    authUrl: config.authUrl || getDefaultAuthUrl(),
    apiUrl: config.apiUrl || getDefaultApiUrl(),
    timeout: config.timeout || 30000,
    retryAttempts: config.retryAttempts || 3,
    retryDelay: config.retryDelay || 1000,
    ipfs: {
      gateway: 'https://ipfs.io',
      apiUrl: 'http://65.109.2.230:5001',
      timeout: 30000,
      enableFallback: true,
      defaultBeaconPath:
        '/ipns/k2k4r8pigrw8i34z63om8f015tt5igdq0c46xupq8spp1bogt35k5vhe',
      ...config.ipfs,
    },
  };
}

/**
 * Sanitizes request options by applying defaults and validation
 */
export function sanitizeRequestOptions(
  options: Partial<RequestOptions> = {},
): RequestOptions {
  const validation = validateRequestOptions(options);
  if (!validation.valid) {
    throw createValidationError('Invalid request options', validation.errors);
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
  return 'https://dev-1usujmbby8627ni8.us.auth0.com';
}

/**
 * Gets default API URL
 */
function getDefaultApiUrl(): string {
  return 'https://op.spacecomputer.io';
}

/**
 * Validates and sanitizes cTRNG request
 */
export function sanitizeCTRNGRequest(
  request: Partial<CTRNGRequest>,
): CTRNGRequest {
  const validation = validateCTRNGRequest(request);
  if (!validation.valid) {
    throw createValidationError(
      validation.errors.join(', '),
      validation.errors,
    );
  }

  // Return appropriate request type based on src
  if (request.src === 'ipfs') {
    const ipfsRequest = request as IPFSCTRNGRequest;
    return {
      src: 'ipfs',
      beaconPath: ipfsRequest.beaconPath,
      block: ipfsRequest.block || 'INF',
      index: ipfsRequest.index || 0,
    };
  } else {
    return {
      src: request.src || 'trng',
    };
  }
}
