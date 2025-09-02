/**
 * Token storage implementations for different environments
 */

import type { TokenStorage } from "../types";

/**
 * Browser localStorage implementation
 */
export class BrowserTokenStorage implements TokenStorage {
  private readonly key: string;

  constructor(key: string = "orbitport_token") {
    this.key = key;
  }

  async get(): Promise<string | null> {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(this.key);
      if (!stored) return null;

      const tokenData = JSON.parse(stored);

      // Check if token is expired
      if (Date.now() >= tokenData.expires_at * 1000) {
        await this.clear();
        return null;
      }

      return tokenData.access_token;
    } catch (error) {
      console.warn("Failed to retrieve token from localStorage:", error);
      return null;
    }
  }

  async set(token: string, expiresAt: number): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("localStorage is not available");
    }

    try {
      const tokenData = {
        access_token: token,
        expires_at: expiresAt,
        stored_at: Date.now(),
      };

      window.localStorage.setItem(this.key, JSON.stringify(tokenData));
    } catch (error) {
      console.warn("Failed to store token in localStorage:", error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.removeItem(this.key);
    } catch (error) {
      console.warn("Failed to clear token from localStorage:", error);
    }
  }
}

/**
 * Node.js memory storage implementation
 */
export class MemoryTokenStorage implements TokenStorage {
  private token: string | null = null;
  private expiresAt: number = 0;

  async get(): Promise<string | null> {
    if (!this.token || Date.now() >= this.expiresAt * 1000) {
      this.token = null;
      return null;
    }
    return this.token;
  }

  async set(token: string, expiresAt: number): Promise<void> {
    this.token = token;
    this.expiresAt = expiresAt;
  }

  async clear(): Promise<void> {
    this.token = null;
    this.expiresAt = 0;
  }
}

/**
 * Node.js file system storage implementation
 */
export class FileTokenStorage implements TokenStorage {
  private readonly filePath: string;
  private readonly fs: any;

  constructor(filePath: string = ".orbitport_token") {
    this.filePath = filePath;
    // Dynamic import to avoid bundling fs in browser builds
    try {
      this.fs = require("fs");
    } catch (error) {
      throw new Error("File system access not available in this environment");
    }
  }

  async get(): Promise<string | null> {
    try {
      if (!this.fs.existsSync(this.filePath)) {
        return null;
      }

      const data = this.fs.readFileSync(this.filePath, "utf8");
      const tokenData = JSON.parse(data);

      // Check if token is expired
      if (Date.now() >= tokenData.expires_at * 1000) {
        await this.clear();
        return null;
      }

      return tokenData.access_token;
    } catch (error) {
      console.warn("Failed to retrieve token from file:", error);
      return null;
    }
  }

  async set(token: string, expiresAt: number): Promise<void> {
    try {
      const tokenData = {
        access_token: token,
        expires_at: expiresAt,
        stored_at: Date.now(),
      };

      this.fs.writeFileSync(this.filePath, JSON.stringify(tokenData, null, 2));
    } catch (error) {
      console.warn("Failed to store token in file:", error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.fs.existsSync(this.filePath)) {
        this.fs.unlinkSync(this.filePath);
      }
    } catch (error) {
      console.warn("Failed to clear token file:", error);
    }
  }
}

/**
 * Custom storage implementation that allows user-defined storage
 */
export class CustomTokenStorage implements TokenStorage {
  private getter: () => Promise<string | null>;
  private setter: (token: string, expiresAt: number) => Promise<void>;
  private clearer: () => Promise<void>;

  constructor(
    getter: () => Promise<string | null>,
    setter: (token: string, expiresAt: number) => Promise<void>,
    clearer: () => Promise<void>
  ) {
    this.getter = getter;
    this.setter = setter;
    this.clearer = clearer;
  }

  async get(): Promise<string | null> {
    return this.getter();
  }

  async set(token: string, expiresAt: number): Promise<void> {
    return this.setter(token, expiresAt);
  }

  async clear(): Promise<void> {
    return this.clearer();
  }
}

/**
 * Factory function to create appropriate storage based on environment
 */
export function createDefaultStorage(): TokenStorage {
  // Check if we're in a browser environment
  if (typeof window !== "undefined" && window.localStorage) {
    return new BrowserTokenStorage();
  }

  // Check if we're in Node.js environment
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    return new MemoryTokenStorage();
  }

  // Fallback to memory storage
  return new MemoryTokenStorage();
}

/**
 * Creates a storage instance with specific configuration
 */
export function createStorage(options: {
  type: "browser" | "memory" | "file" | "custom";
  key?: string;
  filePath?: string;
  customStorage?: TokenStorage;
}): TokenStorage {
  switch (options.type) {
    case "browser":
      return new BrowserTokenStorage(options.key);
    case "memory":
      return new MemoryTokenStorage();
    case "file":
      return new FileTokenStorage(options.filePath);
    case "custom":
      if (!options.customStorage) {
        throw new Error(
          "Custom storage instance is required for 'custom' type"
        );
      }
      return options.customStorage;
    default:
      throw new Error(`Unsupported storage type: ${options.type}`);
  }
}
