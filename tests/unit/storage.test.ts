/**
 * Unit tests for storage implementations
 */

import {
  BrowserTokenStorage,
  MemoryTokenStorage,
  FileTokenStorage,
  CustomTokenStorage,
  createDefaultStorage,
  createStorage,
} from "../../src/storage";

// Mock localStorage for browser tests
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

// Mock window object for browser environment
const mockWindow = {
  localStorage: mockLocalStorage,
};

// Mock global window
(global as any).window = mockWindow;

// Mock fs for file storage tests
const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
};

jest.mock("fs", () => mockFs);

describe("Storage Implementations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("MemoryTokenStorage", () => {
    let storage: MemoryTokenStorage;

    beforeEach(() => {
      storage = new MemoryTokenStorage();
    });

    it("should store and retrieve token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await storage.set(token, expiresAt);
      const retrieved = await storage.get();

      expect(retrieved).toBe(token);
    });

    it("should return null for expired token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      await storage.set(token, expiresAt);
      const retrieved = await storage.get();

      expect(retrieved).toBeNull();
    });

    it("should clear token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      await storage.set(token, expiresAt);
      await storage.clear();
      const retrieved = await storage.get();

      expect(retrieved).toBeNull();
    });

    it("should return null when no token is stored", async () => {
      const retrieved = await storage.get();
      expect(retrieved).toBeNull();
    });
  });

  describe("BrowserTokenStorage", () => {
    let storage: BrowserTokenStorage;

    beforeEach(() => {
      storage = new BrowserTokenStorage("test-key");
    });

    it("should store and retrieve token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const expectedData = {
        access_token: token,
        expires_at: expiresAt,
        stored_at: expect.any(Number),
      };

      mockLocalStorage.setItem.mockImplementation(() => {});
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(expectedData));

      await storage.set(token, expiresAt);
      const retrieved = await storage.get();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "test-key",
        expect.stringContaining('"access_token":"test-token"')
      );
      expect(retrieved).toBe(token);
    });

    it("should return null for expired token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) - 3600;
      const expiredData = {
        access_token: token,
        expires_at: expiresAt,
        stored_at: Date.now(),
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(expiredData));
      mockLocalStorage.removeItem.mockImplementation(() => {});

      const retrieved = await storage.get();

      expect(retrieved).toBeNull();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith("test-key");
    });

    it("should handle localStorage errors gracefully", async () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error("localStorage error");
      });

      const retrieved = await storage.get();
      expect(retrieved).toBeNull();
    });

    it("should clear token", async () => {
      mockLocalStorage.removeItem.mockImplementation(() => {});

      await storage.clear();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith("test-key");
    });
  });

  describe("FileTokenStorage", () => {
    let storage: FileTokenStorage;

    beforeEach(() => {
      storage = new FileTokenStorage("test-token.json");
    });

    it("should store and retrieve token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const expectedData = {
        access_token: token,
        expires_at: expiresAt,
        stored_at: expect.any(Number),
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(expectedData));
      mockFs.writeFileSync.mockImplementation(() => {});

      await storage.set(token, expiresAt);
      const retrieved = await storage.get();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "test-token.json",
        expect.stringContaining('"access_token": "test-token"')
      );
      expect(retrieved).toBe(token);
    });

    it("should return null when file does not exist", async () => {
      mockFs.existsSync.mockReturnValue(false);

      const retrieved = await storage.get();
      expect(retrieved).toBeNull();
    });

    it("should return null for expired token", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) - 3600;
      const expiredData = {
        access_token: token,
        expires_at: expiresAt,
        stored_at: Date.now(),
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(expiredData));
      mockFs.unlinkSync.mockImplementation(() => {});

      const retrieved = await storage.get();

      expect(retrieved).toBeNull();
      expect(mockFs.unlinkSync).toHaveBeenCalledWith("test-token.json");
    });

    it("should handle file system errors gracefully", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error("File system error");
      });

      const retrieved = await storage.get();
      expect(retrieved).toBeNull();
    });

    it("should clear token file", async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {});

      await storage.clear();
      expect(mockFs.unlinkSync).toHaveBeenCalledWith("test-token.json");
    });
  });

  describe("CustomTokenStorage", () => {
    let storage: CustomTokenStorage;
    let mockGetter: jest.Mock;
    let mockSetter: jest.Mock;
    let mockClearer: jest.Mock;

    beforeEach(() => {
      mockGetter = jest.fn();
      mockSetter = jest.fn();
      mockClearer = jest.fn();
      storage = new CustomTokenStorage(mockGetter, mockSetter, mockClearer);
    });

    it("should delegate to custom functions", async () => {
      const token = "test-token";
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      mockGetter.mockResolvedValue(token);
      mockSetter.mockResolvedValue(undefined);
      mockClearer.mockResolvedValue(undefined);

      await storage.set(token, expiresAt);
      const retrieved = await storage.get();
      await storage.clear();

      expect(mockSetter).toHaveBeenCalledWith(token, expiresAt);
      expect(mockGetter).toHaveBeenCalled();
      expect(mockClearer).toHaveBeenCalled();
      expect(retrieved).toBe(token);
    });
  });

  describe("createDefaultStorage", () => {
    it("should return appropriate storage based on environment", () => {
      const storage = createDefaultStorage();
      // In test environment with mocked window, it should return BrowserTokenStorage
      expect(storage).toBeInstanceOf(BrowserTokenStorage);
    });
  });

  describe("createStorage", () => {
    it("should create browser storage", () => {
      const storage = createStorage({ type: "browser", key: "test-key" });
      expect(storage).toBeInstanceOf(BrowserTokenStorage);
    });

    it("should create memory storage", () => {
      const storage = createStorage({ type: "memory" });
      expect(storage).toBeInstanceOf(MemoryTokenStorage);
    });

    it("should create file storage", () => {
      const storage = createStorage({ type: "file", filePath: "test.json" });
      expect(storage).toBeInstanceOf(FileTokenStorage);
    });

    it("should create custom storage", () => {
      const customStorage = new MemoryTokenStorage();
      const storage = createStorage({ type: "custom", customStorage });
      expect(storage).toBe(customStorage);
    });

    it("should throw error for invalid type", () => {
      expect(() => {
        createStorage({ type: "invalid" as any });
      }).toThrow("Unsupported storage type: invalid");
    });

    it("should throw error for custom type without storage", () => {
      expect(() => {
        createStorage({ type: "custom" });
      }).toThrow("Custom storage instance is required for 'custom' type");
    });
  });
});
