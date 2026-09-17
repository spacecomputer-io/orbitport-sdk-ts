/**
 * Core types and interfaces for the Orbitport SDK
 */

import type { ErrorCode } from '../utils/errors';

export * from './kms';

// Configuration interfaces
export interface OrbitportConfig {
  /**
   * Pre-issued bearer token, such as a PAT from the Orbitport accounts portal.
   */
  accessToken?: string;
  apiUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface TokenStorage {
  get(): Promise<string | null>;
  set(token: string, expiresAt: number): Promise<void>;
  clear(): Promise<void>;
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
  type: 'token_cleared' | 'error' | 'retry';
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
