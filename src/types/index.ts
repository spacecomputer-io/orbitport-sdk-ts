/**
 * Core types and interfaces for the Orbitport SDK
 */

import type { ErrorCode } from '../utils/errors';

// Configuration interfaces
export interface OrbitportConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl?: string;
  apiUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  ipfs?: IPFSConfig;
}

export interface TokenStorage {
  get(): Promise<string | null>;
  set(token: string, expiresAt: number): Promise<void>;
  clear(): Promise<void>;
}

// Authentication types
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

export interface TokenData {
  access_token: string;
  expires_at: number;
  token_type: string;
}

// cTRNG (cosmic True Random Number Generator) types
export interface CTRNGResponse {
  service: string;
  src: string;
  data: string;
  signature?: {
    value: string;
    pk: string;
    algo?: string;
  };
  timestamp?: string;
  provider?: string;
}

export interface APICTRNGRequest {
  src: 'trng' | 'rng';
}

// IPFS-specific request interface with block traversal and index selection
export interface IPFSCTRNGRequest {
  src: 'ipfs';
  beaconPath?: string;
  block?: number | 'INF'; // Block number or "INF" for latest
  index?: number;
}

// Union type for all CTRNG requests
export type CTRNGRequest = APICTRNGRequest | IPFSCTRNGRequest;

// IPFS Beacon types
export interface BeaconData {
  previous?: string;
  sequence: number;
  timestamp: string;
  ctrng: number[];
}

export interface BeaconResponse {
  data: BeaconData;
  previous?: string;
}

export interface IPFSSource {
  source: string;
  text?: string;
  error?: string;
}

export interface BeaconComparison {
  gateway: BeaconData | null;
  api: BeaconData | null;
  match: boolean;
  differences?: {
    sequence?: { gateway: number; api: number };
    previous?: { gateway: string; api: string };
  };
}

// IPFS Configuration types
export interface IPFSConfig {
  gateway?: string;
  apiUrl?: string;
  timeout?: number;
  enableFallback?: boolean;
  customNodes?: IPFSNode[];
  defaultBeaconPath?: string;
}

export interface IPFSNode {
  url: string;
  type: 'gateway' | 'api';
  priority?: number;
  timeout?: number;
}

export interface IPFSBeaconRequest {
  path: string; // /ipns/<beacon-cid> or /ipfs/<block-cid>
  sources?: ('gateway' | 'api' | 'both')[];
  timeout?: number;
  enableComparison?: boolean;
}

// Error types
export interface OrbitportError extends Error {
  code: ErrorCode;
  status?: number;
  details?: unknown;
}

export interface APIError {
  error: string;
  error_description?: string;
  error_code?: string;
  details?: unknown;
}

// SDK event types
export interface SDKEvent {
  type: 'token_refresh' | 'provider_switch' | 'error' | 'retry';
  timestamp: number;
  data?: unknown;
}

export type SDKEventHandler = (event: SDKEvent) => void;

// Request/Response utilities
export interface RequestOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface ResponseMetadata {
  timestamp: number;
  request_id?: string;
}

// Storage interfaces for different environments
export interface BrowserStorage extends TokenStorage {
  // Browser-specific storage methods can be added here
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NodeStorage extends TokenStorage {
  // Node.js-specific storage methods can be added here
  readFileSync(path: string): string;
  writeFileSync(path: string, data: string): void;
  unlinkSync(path: string): void;
}

// Validation schemas
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// SDK initialization options
export interface SDKInitOptions {
  config: OrbitportConfig;
  storage?: TokenStorage;
  eventHandler?: SDKEventHandler;
  debug?: boolean;
}

// Service method return types
export interface ServiceResult<T> {
  data: T;
  metadata: ResponseMetadata;
  success: boolean;
}

export interface ServiceError {
  error: OrbitportError;
  metadata?: ResponseMetadata;
  retryable: boolean;
}
