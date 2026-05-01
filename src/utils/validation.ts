/**
 * Validation utilities for the Orbitport SDK
 */

import type {
  OrbitportConfig,
  CTRNGRequest,
  ValidationResult,
  RequestOptions,
  IPFSCTRNGRequest,
  CreateKeyRequest,
  EncryptRequest,
  DecryptRequest,
  SignRequest,
  GenerateDataKeyRequest,
  RotateKeyRequest,
  Tag,
  PlaintextEncoding,
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

  if (config.authDomain) {
    if (typeof config.authDomain !== 'string' || config.authDomain.trim().length === 0) {
      errors.push('authDomain must be a non-empty string');
    }
  }

  if (config.audience) {
    if (typeof config.audience !== 'string') {
      errors.push('audience must be a string');
    } else if (!isValidUrl(config.audience)) {
      errors.push('audience must be a valid URL');
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
    authDomain: config.authDomain?.trim() || getDefaultAuthDomain(),
    audience: config.audience?.trim() || getDefaultAudience(),
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
        '/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f',
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
 * Gets default auth domain
 */
function getDefaultAuthDomain(): string {
  return 'auth.spacecomputer.io';
}

/**
 * Gets default audience
 */
function getDefaultAudience(): string {
  return 'https://op.spacecomputer.io/api';
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

// ---------------------------------------------------------------------------
// KMS validation
// ---------------------------------------------------------------------------

const KMS_ALIAS_REGEX = /^[A-Za-z0-9.\-_/]{1,128}$/;
const VALID_KEY_SPECS = new Set([
  'AES_256_GCM96',
  'SYMMETRIC_DEFAULT',
  'ECDSA_P256',
  'ECDSA_P384',
  'ED25519',
  'RSA_4096',
  'ECC_SECG_P256K1',
]);
const VALID_KEY_USAGES = new Set(['ENCRYPT_DECRYPT', 'SIGN_VERIFY']);
const VALID_SCHEMES = new Set(['TRANSIT', 'ETHEREUM']);
const VALID_SIGNING_ALGORITHMS = new Set([
  'ECDSA_SHA_256',
  'ECDSA_SHA_384',
  'ED25519',
  'ETHEREUM_SECP256K1',
  'RSASSA_PKCS1_V1_5_SHA_256',
  'RSASSA_PSS_SHA_256',
]);
const VALID_MESSAGE_TYPES = new Set(['RAW', 'DIGEST', 'EIP191']);
const VALID_DATA_KEY_SPECS = new Set(['AES_128', 'AES_256']);

/**
 * Validates a KMS key alias.
 *
 * Rejects spaces, length>128, and the gateway-reserved `kms:` prefix.
 */
export function validateKMSAlias(alias: string): void {
  if (typeof alias !== 'string' || alias.length === 0) {
    throw createValidationError('alias must be a non-empty string');
  }
  if (alias.toLowerCase().startsWith('kms:')) {
    throw createValidationError('alias must not start with "kms:" (reserved prefix)');
  }
  if (!KMS_ALIAS_REGEX.test(alias)) {
    throw createValidationError(
      'alias must match /^[A-Za-z0-9.\\-_/]{1,128}$/ (no spaces; max 128 chars)',
    );
  }
}

function sanitizeTags(tags: Tag[] | undefined): Tag[] | undefined {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) {
    throw createValidationError('tags must be an array');
  }
  for (const t of tags) {
    if (
      !t ||
      typeof t.TagKey !== 'string' ||
      typeof t.TagValue !== 'string' ||
      t.TagKey.length === 0
    ) {
      throw createValidationError(
        'each tag must be { TagKey: string, TagValue: string } with non-empty TagKey',
      );
    }
  }
  return tags;
}

/**
 * Validates a CreateKey request and returns the JSON-RPC params (PascalCase).
 */
export function sanitizeCreateKeyRequest(req: CreateKeyRequest): Record<string, unknown> {
  if (!req || typeof req !== 'object') {
    throw createValidationError('createKey: request must be an object');
  }
  validateKMSAlias(req.alias);
  if (!VALID_KEY_SPECS.has(req.keySpec)) {
    throw createValidationError(`createKey: invalid keySpec "${req.keySpec}"`);
  }
  if (!VALID_KEY_USAGES.has(req.keyUsage)) {
    throw createValidationError(`createKey: invalid keyUsage "${req.keyUsage}"`);
  }
  if (req.scheme !== undefined && !VALID_SCHEMES.has(req.scheme)) {
    throw createValidationError(`createKey: invalid scheme "${req.scheme}"`);
  }
  if (req.description !== undefined && typeof req.description !== 'string') {
    throw createValidationError('createKey: description must be a string');
  }
  const tags = sanitizeTags(req.tags);

  const params: Record<string, unknown> = {
    Alias: req.alias,
    KeySpec: req.keySpec,
    KeyUsage: req.keyUsage,
  };
  if (req.scheme !== undefined) params.Scheme = req.scheme;
  if (req.description !== undefined) params.Description = req.description;
  if (tags !== undefined) params.Tags = tags;
  return params;
}

function requireKeyId(method: string, keyId: unknown): string {
  if (typeof keyId !== 'string' || keyId.length === 0) {
    throw createValidationError(`${method}: keyId must be a non-empty string`);
  }
  return keyId;
}

/**
 * Validates an Encrypt request. Returns `{ params, encoding }`.
 *
 * `params` is the wire-shape JSON-RPC params (PascalCase Plaintext is added by
 * the service after base64 encoding); the encoding is returned so the caller
 * can pick the right base64 conversion path.
 */
export function sanitizeEncryptRequest(req: EncryptRequest): {
  keyId: string;
  encoding: PlaintextEncoding;
  plaintext: string | Uint8Array;
  encryptionAlgorithm?: string;
} {
  if (!req || typeof req !== 'object') {
    throw createValidationError('encrypt: request must be an object');
  }
  const keyId = requireKeyId('encrypt', req.keyId);
  const encoding: PlaintextEncoding = (req.encoding as PlaintextEncoding) || 'utf8';
  if (encoding !== 'utf8' && encoding !== 'bytes') {
    throw createValidationError('encrypt: encoding must be "utf8" or "bytes"');
  }
  if (encoding === 'utf8' && typeof req.plaintext !== 'string') {
    throw createValidationError(
      'encrypt: encoding "utf8" requires plaintext: string',
    );
  }
  if (encoding === 'bytes' && !(req.plaintext instanceof Uint8Array)) {
    throw createValidationError(
      'encrypt: encoding "bytes" requires plaintext: Uint8Array',
    );
  }
  if (
    req.encryptionAlgorithm !== undefined &&
    typeof req.encryptionAlgorithm !== 'string'
  ) {
    throw createValidationError('encrypt: encryptionAlgorithm must be a string');
  }
  return {
    keyId,
    encoding,
    plaintext: req.plaintext,
    encryptionAlgorithm: req.encryptionAlgorithm,
  };
}

/**
 * Validates a Decrypt request. Returns the encoding plus wire params.
 */
export function sanitizeDecryptRequest(req: DecryptRequest): {
  encoding: PlaintextEncoding;
  params: Record<string, unknown>;
} {
  if (!req || typeof req !== 'object') {
    throw createValidationError('decrypt: request must be an object');
  }
  if (typeof req.ciphertextBlob !== 'string' || req.ciphertextBlob.length === 0) {
    throw createValidationError(
      'decrypt: ciphertextBlob must be a non-empty base64 string',
    );
  }
  const encoding: PlaintextEncoding = (req.encoding as PlaintextEncoding) || 'utf8';
  if (encoding !== 'utf8' && encoding !== 'bytes') {
    throw createValidationError('decrypt: encoding must be "utf8" or "bytes"');
  }
  if (req.keyId !== undefined && typeof req.keyId !== 'string') {
    throw createValidationError('decrypt: keyId must be a string when provided');
  }
  const params: Record<string, unknown> = {
    CiphertextBlob: req.ciphertextBlob,
  };
  if (req.keyId !== undefined) params.KeyId = req.keyId;
  if (req.encryptionAlgorithm !== undefined) {
    params.EncryptionAlgorithm = req.encryptionAlgorithm;
  }
  return { encoding, params };
}

/**
 * Validates a Sign request. Returns wire params plus the raw message for
 * the service to base64-encode.
 */
export function sanitizeSignRequest(req: SignRequest): {
  keyId: string;
  message: string | Uint8Array;
  signingAlgorithm: string;
  messageType: string;
} {
  if (!req || typeof req !== 'object') {
    throw createValidationError('sign: request must be an object');
  }
  const keyId = requireKeyId('sign', req.keyId);
  if (
    typeof req.message !== 'string' &&
    !(req.message instanceof Uint8Array)
  ) {
    throw createValidationError('sign: message must be string or Uint8Array');
  }
  if (!VALID_SIGNING_ALGORITHMS.has(req.signingAlgorithm)) {
    throw createValidationError(
      `sign: invalid signingAlgorithm "${req.signingAlgorithm}"`,
    );
  }
  const messageType = req.messageType || 'RAW';
  if (!VALID_MESSAGE_TYPES.has(messageType)) {
    throw createValidationError(`sign: invalid messageType "${messageType}"`);
  }
  if (messageType === 'EIP191' && req.signingAlgorithm !== 'ETHEREUM_SECP256K1') {
    throw createValidationError(
      'sign: messageType "EIP191" requires signingAlgorithm "ETHEREUM_SECP256K1"',
    );
  }
  return {
    keyId,
    message: req.message,
    signingAlgorithm: req.signingAlgorithm,
    messageType,
  };
}

/**
 * Validates a GenerateDataKey request and returns wire params.
 *
 * Enforces XOR: exactly one of `dataKeySpec` or `numberOfBytes`.
 */
export function sanitizeGenerateDataKeyRequest(
  req: GenerateDataKeyRequest,
): Record<string, unknown> {
  if (!req || typeof req !== 'object') {
    throw createValidationError('generateDataKey: request must be an object');
  }
  const keyId = requireKeyId('generateDataKey', req.keyId);
  const hasSpec = req.dataKeySpec !== undefined;
  const hasBytes = req.numberOfBytes !== undefined;
  if (hasSpec === hasBytes) {
    throw createValidationError(
      'generateDataKey: exactly one of dataKeySpec or numberOfBytes must be set',
    );
  }
  if (hasSpec && !VALID_DATA_KEY_SPECS.has(req.dataKeySpec as string)) {
    throw createValidationError(
      `generateDataKey: invalid dataKeySpec "${req.dataKeySpec}"`,
    );
  }
  if (hasBytes) {
    const n = req.numberOfBytes as number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 1024) {
      throw createValidationError(
        'generateDataKey: numberOfBytes must be an integer in [1, 1024]',
      );
    }
  }
  const params: Record<string, unknown> = { KeyId: keyId };
  if (hasSpec) params.DataKeySpec = req.dataKeySpec;
  if (hasBytes) params.NumberOfBytes = req.numberOfBytes;
  return params;
}

/**
 * Validates a RotateKey request and returns wire params.
 */
export function sanitizeRotateKeyRequest(
  req: RotateKeyRequest,
): Record<string, unknown> {
  if (!req || typeof req !== 'object') {
    throw createValidationError('rotateKey: request must be an object');
  }
  const keyId = requireKeyId('rotateKey', req.keyId);
  return { KeyId: keyId };
}
