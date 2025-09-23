/**
 * Retry logic utilities for the Orbitport SDK
 */

import type { OrbitportError } from '../types';
import { isRetryableError } from './errors';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculates the delay for the next retry attempt
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay =
    options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);

  if (options.jitter) {
    // Add random jitter to prevent thundering herd
    const jitterAmount = cappedDelay * 0.1; // 10% jitter
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
    return Math.max(0, cappedDelay + jitter);
  }

  return cappedDelay;
}

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: (error: OrbitportError, attempt: number) => void,
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: OrbitportError;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as OrbitportError;

      // Don't retry if it's not a retryable error
      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      // Don't retry on the last attempt
      if (attempt === config.maxAttempts) {
        throw lastError;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retries an async function with custom retry logic
 */
export async function withCustomRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: OrbitportError, attempt: number) => boolean,
  getDelay: (attempt: number) => number,
  maxAttempts: number = 3,
  onRetry?: (error: OrbitportError, attempt: number) => void,
): Promise<T> {
  let lastError: OrbitportError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as OrbitportError;

      // Check if we should retry
      if (!shouldRetry(lastError, attempt) || attempt === maxAttempts) {
        throw lastError;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(lastError, attempt);
      }

      // Wait for the calculated delay
      const delay = getDelay(attempt);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Creates a retry wrapper with specific configuration
 */
export function createRetryWrapper(options: Partial<RetryOptions> = {}) {
  return <T>(
    fn: () => Promise<T>,
    onRetry?: (error: OrbitportError, attempt: number) => void,
  ) => withRetry(fn, options, onRetry);
}

/**
 * Retry strategies for different types of operations
 */
export const RETRY_STRATEGIES = {
  // Fast retry for quick operations
  fast: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 2,
    jitter: true,
  },

  // Standard retry for most operations
  standard: DEFAULT_RETRY_OPTIONS,

  // Aggressive retry for critical operations
  aggressive: {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  },

  // Conservative retry for non-critical operations
  conservative: {
    maxAttempts: 2,
    baseDelay: 2000,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    jitter: true,
  },

  // No retry for operations that should fail fast
  none: {
    maxAttempts: 1,
    baseDelay: 0,
    maxDelay: 0,
    backoffMultiplier: 1,
    jitter: false,
  },
} as const;
