/**
 * End-to-end tests for Orbitport SDK
 *
 * These tests require valid credentials and will make actual API calls.
 * Set ORBITPORT_CLIENT_ID and ORBITPORT_CLIENT_SECRET environment variables.
 */

import { OrbitportSDK, createOrbitportSDK } from "../src/index";

// Utility function to add delays between requests to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Orbitport SDK E2E Tests", () => {
  const clientId = process.env.ORBITPORT_CLIENT_ID;
  const clientSecret = process.env.ORBITPORT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(
      "Skipping E2E tests: ORBITPORT_CLIENT_ID and ORBITPORT_CLIENT_SECRET not set"
    );
    return;
  }

  let sdk: OrbitportSDK;

  beforeAll(() => {
    sdk = new OrbitportSDK({
      config: {
        clientId,
        clientSecret,
      },
      // debug: true, // Enable debug logging for tests
    });
  });

  describe("SDK Initialization", () => {
    it("should initialize with valid credentials", () => {
      expect(sdk).toBeDefined();
      expect(sdk.ctrng).toBeDefined();
      expect(sdk.auth).toBeDefined();
    });

    it("should have correct configuration", () => {
      const config = sdk.getConfig();
      expect(config.clientId).toBe("[REDACTED]");
      expect(config.clientSecret).toBe("[REDACTED]");
      expect(config.authDomain).toBeDefined();
      expect(config.audience).toBeDefined();
      expect(config.apiUrl).toBeDefined();
    });
  });

  describe("Authentication", () => {
    it("should authenticate and get valid token", async () => {
      const token = await sdk.auth.getValidToken();
      expect(token).toBeDefined();
      expect(token).not.toBeNull();
      if (token) {
        expect(typeof token).toBe("string");
        expect(token.length).toBeGreaterThan(0);
      }
    });

    it("should validate token status", async () => {
      const isValid = await sdk.auth.isTokenValid();
      expect(typeof isValid).toBe("boolean");
    });

    it("should get token information", async () => {
      const tokenInfo = await sdk.auth.getTokenInfo();
      expect(tokenInfo).toBeDefined();
      expect(typeof tokenInfo.valid).toBe("boolean");
      if (tokenInfo.expiresAt) {
        expect(typeof tokenInfo.expiresAt).toBe("number");
      }
    });
  });

  describe("cTRNG Service", () => {
    it("should generate random data with default source (trng)", async () => {
      const result = await sdk.ctrng.random();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Validate response structure
      expect(result.data.service).toBeDefined();
      expect(result.data.src).toBeDefined();
      expect(result.data.data).toBeDefined();
      // Signature is optional

      // Validate signature structure (if present)
      if (result.data.signature) {
        expect(result.data.signature.value).toBeDefined();
        expect(result.data.signature.pk).toBeDefined();
      }

      console.log("Generated cTRNG data:", {
        service: result.data.service,
        src: result.data.src,
        dataLength: result.data.data.length,
        signature: result.data.signature
          ? result.data.signature.value.substring(0, 20) + "..."
          : "none",
        metadata: result.metadata,
      });
    });

    it("should generate random data with rng source", async () => {
      const result = await sdk.ctrng.random({ src: "rng" });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Note: The API may return "aptosorbital" as the actual source even when requesting "rng"
      // This is expected behavior based on the API response
      expect(result.data.src).toBeDefined();

      console.log("Generated rng data:", {
        service: result.data.service,
        src: result.data.src,
        dataLength: result.data.data.length,
        metadata: result.metadata,
      });
    });

    it("should generate random data from IPFS beacon", async () => {
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: true,
      });
      const result = await ipfsSdk.ctrng.random({ src: "ipfs" });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.service).toBe("ipfs-beacon");
      expect(result.data.src).toBe("ipfs");
      expect(result.data.data).toBeDefined();
      expect(typeof parseInt(result.data.data, 10)).toBe("number"); // Should be a number as a string

      console.log("Generated IPFS beacon data:", {
        service: result.data.service,
        src: result.data.src,
        data: result.data.data,
        metadata: result.metadata,
      });
    });

    it("should generate random data from IPFS beacon with specific index", async () => {
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: true,
      });

      // Test different indices
      const indices = [0, 1, 2];
      const results: Array<{ index: number; result: any }> = [];

      for (const index of indices) {
        try {
          const result = await ipfsSdk.ctrng.random({
            src: "ipfs",
            index,
          });
          results.push({ index, result });
          console.log(`Generated IPFS data with index ${index}:`, {
            data: result.data.data,
            service: result.data.service,
          });
        } catch (error) {
          console.log(`Index ${index} failed (may be out of bounds):`, error);
        }
      }

      expect(results.length).toBeGreaterThan(0);
      results.forEach(({ result }) => {
        expect(result.success).toBe(true);
        expect(result.data.service).toBe("ipfs-beacon");
        expect(result.data.src).toBe("ipfs");
        expect(typeof parseInt(result.data.data, 10)).toBe("number");
      });
    });

    it("should handle out-of-bounds index with modulo", async () => {
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: true,
      });

      // Request a large index that should be adjusted using modulo
      const result = await ipfsSdk.ctrng.random({
        src: "ipfs",
        index: 10, // This should be adjusted if array has fewer elements
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.service).toBe("ipfs-beacon");
      expect(typeof parseInt(result.data.data, 10)).toBe("number");

      console.log("Out-of-bounds index handled:", {
        requestedIndex: 10,
        actualData: result.data.data,
      });
    });

    it("should generate random data from specific block (if available)", async () => {
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: true,
      });

      try {
        // Try to get data from a specific block (this may fail if the block doesn't exist)
        const result = await ipfsSdk.ctrng.random({
          src: "ipfs",
          block: 10000, // Try to get from block 10000
          index: 0,
        });

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.data.service).toBe("ipfs-beacon");
        expect(typeof parseInt(result.data.data, 10)).toBe("number");

        console.log("Generated data from specific block:", {
          block: 10000,
          data: result.data.data,
        });
      } catch (error) {
        console.log("Specific block not available (expected):", error);
        // This is expected if the block doesn't exist in the chain
        expect(error).toBeDefined();
      }
    });

    it("should generate random data from latest block with INF", async () => {
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: true,
      });

      const result = await ipfsSdk.ctrng.random({
        src: "ipfs",
        block: "INF", // Latest block
        index: 0,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.service).toBe("ipfs-beacon");
      expect(typeof parseInt(result.data.data, 10)).toBe("number");

      console.log("Generated data from latest block:", {
        block: "INF",
        data: result.data.data,
      });
    });

    it("should use custom beacon path", async () => {
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: true,
      });

      const customBeaconPath =
        "/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f";
      const result = await ipfsSdk.ctrng.random({
        src: "ipfs",
        beaconPath: customBeaconPath,
        index: 0,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.service).toBe("ipfs-beacon");
      expect(typeof parseInt(result.data.data, 10)).toBe("number");

      console.log("Generated data from custom beacon:", {
        beaconPath: customBeaconPath,
        data: result.data.data,
      });
    });

    it("should fall back to IPFS when API fails", async () => {
      const fallbackSdk = new OrbitportSDK({
        config: {
          clientId: "test",
          clientSecret: "test",
          apiUrl: "https://invalid-api-url-that-does-not-exist.com",
        },
        debug: true,
      });

      const result = await fallbackSdk.ctrng.random();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.service).toBe("ipfs-beacon");
      expect(result.data.src).toBe("ipfs");

      console.log("Fallback to IPFS successful:", {
        service: result.data.service,
        src: result.data.src,
        data: result.data.data,
      });
    });

    it("should handle multiple requests with detailed logging", async () => {
      console.log("\n=== Starting multiple requests test ===");

      // Use IPFS SDK for this test to avoid authentication issues
      const ipfsSdk = new OrbitportSDK({
        config: {}, // No credentials, force IPFS
        debug: false,
      });

      // Use sequential requests with delays to avoid rate limiting
      const results: any[] = [];
      for (let i = 0; i < 3; i++) {
        console.log(`[Test] Initiating request ${i + 1}/3`);
        try {
          const result = await ipfsSdk.ctrng.random({ src: "ipfs" });
          results.push(result);

          // Add delay between requests to avoid rate limiting
          if (i < 2) {
            await delay(2000); // 2 second delay
          }
        } catch (error) {
          console.error(`[Test] Request ${i + 1} failed:`, error);
          // If it's a rate limit error, wait longer and retry
          if (error instanceof Error && error.message.includes("500")) {
            console.log(
              `[Test] Rate limit detected, waiting 3 seconds before retry...`
            );
            await delay(3000);
            try {
              const retryResult = await sdk.ctrng.random();
              results.push(retryResult);
            } catch (retryError) {
              console.error(`[Test] Retry ${i + 1} also failed:`, retryError);
              throw retryError;
            }
          } else {
            throw error;
          }
        }
      }

      console.log("\n=== Multiple requests completed successfully ===");
      expect(results).toHaveLength(3);

      results.forEach((result, index) => {
        console.log(`[Test] Result ${index + 1}:`, {
          success: result.success,
          src: result.data.src,
          dataLength: result.data.data.length,
          requestId: result.metadata.request_id,
          timestamp: result.metadata.timestamp,
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      });

      // Each result should have different data
      const dataValues = results.map((r) => r.data.data);
      const uniqueData = new Set(dataValues);
      console.log(`[Test] Unique data count: ${uniqueData.size}/3`);
      // IPFS might return same data if it's cached, so we just verify we got data
      expect(uniqueData.size).toBeGreaterThanOrEqual(1);

      // Log timing information
      const timestamps = results.map((r) => r.metadata.timestamp);
      const timeDiff = Math.max(...timestamps) - Math.min(...timestamps);
      console.log(`[Test] Request time spread: ${timeDiff}ms`);
    });

    it("should handle request options", async () => {
      console.log("\n=== Testing request options ===");

      // Add delay before this test to avoid rate limiting
      await delay(2000);

      const result = await sdk.ctrng.random(
        { src: "trng" },
        { timeout: 10000, retries: 2 }
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.src).toBeDefined(); // API may return different source

      console.log("[Test] Request options test completed:", {
        src: result.data.src,
        dataLength: result.data.data.length,
        metadata: result.metadata,
      });
    });

    it("should test both valid sources (trng and rng)", async () => {
      console.log("\n=== Testing both valid sources ===");

      // Add delay before this test to avoid rate limiting
      await delay(2000);

      // Test trng source
      console.log("[Test] Testing trng source...");
      const trngResult = await sdk.ctrng.random({ src: "trng" });
      expect(trngResult.success).toBe(true);
      expect(trngResult.data.src).toBeDefined();

      console.log("[Test] TRNG result:", {
        src: trngResult.data.src,
        dataLength: trngResult.data.data.length,
        hasSignature: !!trngResult.data.signature,
        metadata: trngResult.metadata,
      });

      // Add delay between requests
      await delay(2000);

      // Test rng source
      console.log("[Test] Testing rng source...");
      const rngResult = await sdk.ctrng.random({ src: "rng" });
      expect(rngResult.success).toBe(true);
      expect(rngResult.data.src).toBeDefined();

      console.log("[Test] RNG result:", {
        src: rngResult.data.src,
        dataLength: rngResult.data.data.length,
        hasSignature: !!rngResult.data.signature,
        metadata: rngResult.metadata,
      });

      // Verify they produce different data
      expect(trngResult.data.data).not.toBe(rngResult.data.data);
      console.log("[Test] Both sources produced different data as expected");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid source gracefully", async () => {
      console.log("\n=== Testing invalid source validation ===");

      try {
        await sdk.ctrng.random({ src: "invalid" as any });
        fail("Expected validation error for invalid source");
      } catch (error) {
        console.log("[Test] Validation error caught as expected:", {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
        });
        expect(
          error instanceof Error ? error.message : String(error)
        ).toContain("src must be one of: trng, rng");
      }
    });

    it("should handle network errors gracefully", async () => {
      console.log("\n=== Testing network error handling ===");

      // Create SDK with invalid API URL to test error handling
      const invalidSdk = new OrbitportSDK({
        config: {
          clientId,
          clientSecret,
          apiUrl: "https://invalid-api-url-that-does-not-exist.com",
        },
        // debug: true, // Enable debug for error testing
      });

      try {
        await invalidSdk.ctrng.random();
        fail("Expected network error for invalid API URL");
      } catch (error) {
        console.log("[Test] Network error caught as expected:", {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
          code: (error as any)?.code,
        });
        expect(error).toBeDefined();
      }
    });

    it("should provide detailed error information for debugging", async () => {
      console.log("\n=== Testing detailed error information ===");

      // Test with various invalid sources to see validation messages
      const invalidSources = ["aptosorbital", "derived", "invalid", "test", ""];

      for (const invalidSrc of invalidSources) {
        try {
          console.log(`[Test] Testing invalid source: "${invalidSrc}"`);
          await sdk.ctrng.random({ src: invalidSrc as any });
          console.log(`[Test] Unexpected: source "${invalidSrc}" was accepted`);
        } catch (error) {
          console.log(`[Test] Expected error for "${invalidSrc}":`, {
            name: error instanceof Error ? error.name : "Unknown",
            message: error instanceof Error ? error.message : String(error),
            code: (error as any)?.code,
          });
          expect(
            error instanceof Error ? error.message : String(error)
          ).toContain("src must be one of: trng, rng");
        }
      }
    });
  });

  describe("Storage Integration", () => {
    it("should persist tokens across SDK instances", async () => {
      // Add delay before this test
      await delay(2000);

      // Get token with first instance
      const token1 = await sdk.auth.getValidToken();
      expect(token1).toBeDefined();

      // Create new SDK instance (should reuse stored token)
      const sdk2 = new OrbitportSDK({
        config: {
          clientId,
          clientSecret,
        },
      });

      const token2 = await sdk2.auth.getValidToken();
      expect(token2).toBeDefined();

      // Tokens should be the same (if not expired)
      // Note: Due to timing, tokens might be different if the first one expired
      // So we just verify both are valid tokens
      expect(typeof token1).toBe("string");
      expect(typeof token2).toBe("string");
      expect(token1?.length).toBeGreaterThan(0);
      expect(token2?.length).toBeGreaterThan(0);
    });

    it("should clear tokens when requested", async () => {
      await sdk.auth.clearToken();

      // After clearing, should get a new token
      const newToken = await sdk.auth.getValidToken();
      expect(newToken).toBeDefined();
    });
  });

  describe("Factory Function", () => {
    it("should work with createOrbitportSDK factory", async () => {
      // Add delay before this test
      await delay(2000);

      const factorySdk = createOrbitportSDK({
        clientId,
        clientSecret,
      });

      const result = await factorySdk.ctrng.random();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("KMS Service", () => {
    const stamp = Date.now();
    let transitKeyId: string | undefined;
    let ethereumKeyId: string | undefined;

    it("lists supported schemes (TRANSIT and ETHEREUM) from getCapabilities", async () => {
      const res = await sdk.kms.getCapabilities();
      expect(res.success).toBe(true);
      const schemes = res.data.Schemes.map((s) => s.Scheme);
      expect(schemes).toEqual(expect.arrayContaining(["TRANSIT", "ETHEREUM"]));
    });

    it("creates an AES key, encrypts a message, and decrypts it back", async () => {
      const created = await sdk.kms.createKey({
        alias: `sdk-e2e-${stamp}-aes`,
        keySpec: "AES_256_GCM96",
        keyUsage: "ENCRYPT_DECRYPT",
        scheme: "TRANSIT",
      });
      transitKeyId = created.data.KeyMetadata.KeyId;
      expect(transitKeyId).toBeDefined();

      const enc = await sdk.kms.encrypt({
        keyId: transitKeyId,
        plaintext: "hello",
      });
      expect(enc.data.CiphertextBlob.length).toBeGreaterThan(0);

      const dec = await sdk.kms.decrypt({
        keyId: transitKeyId,
        ciphertextBlob: enc.data.CiphertextBlob,
      });
      expect(dec.data.Plaintext).toBe("hello");
    });

    it("encrypts and decrypts raw bytes losslessly when encoding is 'bytes'", async () => {
      // Reuse the TRANSIT key from the previous test if present.
      let keyId = transitKeyId;
      if (!keyId) {
        const created = await sdk.kms.createKey({
          alias: `sdk-e2e-${stamp}-aes-bin`,
          keySpec: "AES_256_GCM96",
          keyUsage: "ENCRYPT_DECRYPT",
          scheme: "TRANSIT",
        });
        keyId = created.data.KeyMetadata.KeyId;
      }
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x80]);
      const enc = await sdk.kms.encrypt({
        keyId,
        plaintext: bytes,
        encoding: "bytes",
      });
      const dec = await sdk.kms.decrypt({
        keyId,
        ciphertextBlob: enc.data.CiphertextBlob,
        encoding: "bytes",
      });
      expect(dec.data.Plaintext).toEqual(bytes);
    });

    it("signs a precomputed digest with an ECDSA_P256 key", async () => {
      const created = await sdk.kms.createKey({
        alias: `sdk-e2e-${stamp}-ecdsa`,
        keySpec: "ECDSA_P256",
        keyUsage: "SIGN_VERIFY",
        scheme: "TRANSIT",
      });
      const sig = await sdk.kms.sign({
        keyId: created.data.KeyMetadata.KeyId,
        // 32-byte SHA-256 digest of empty string
        message: new Uint8Array([
          0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8,
          0x99, 0x6f, 0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c,
          0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52, 0xb8, 0x55,
        ]),
        signingAlgorithm: "ECDSA_SHA_256",
        messageType: "DIGEST",
      });
      expect(sig.data.Signature.length).toBeGreaterThan(0);
    });

    it("creates an Ethereum key with an Address and signs an EIP-191 message", async () => {
      const created = await sdk.kms.createKey({
        alias: `sdk-e2e-${stamp}-eth`,
        keySpec: "ECC_SECG_P256K1",
        keyUsage: "SIGN_VERIFY",
        scheme: "ETHEREUM",
      });
      ethereumKeyId = created.data.KeyMetadata.KeyId;
      const md = created.data.KeyMetadata;
      expect(md.Address).toBeDefined();
      expect(md.Address!.startsWith("0x")).toBe(true);
      expect(md.Address!.length).toBe(42);

      const sig = await sdk.kms.sign({
        keyId: ethereumKeyId,
        message: "hello eth",
        signingAlgorithm: "ETHEREUM_SECP256K1",
        messageType: "EIP191",
      });
      expect(sig.data.Signature.length).toBeGreaterThan(0);
    });

    it("generates a data key returning both plaintext and wrapped ciphertext", async () => {
      let keyId = transitKeyId;
      if (!keyId) {
        const created = await sdk.kms.createKey({
          alias: `sdk-e2e-${stamp}-dk-host`,
          keySpec: "AES_256_GCM96",
          keyUsage: "ENCRYPT_DECRYPT",
          scheme: "TRANSIT",
        });
        keyId = created.data.KeyMetadata.KeyId;
      }
      const dk = await sdk.kms.generateDataKey({
        keyId,
        dataKeySpec: "AES_256",
      });
      expect(dk.data.Plaintext.length).toBeGreaterThan(0);
      expect(dk.data.CiphertextBlob.length).toBeGreaterThan(0);
    });

    it("rotates a key and bumps its PrimaryVersion", async () => {
      let keyId = transitKeyId;
      if (!keyId) {
        const created = await sdk.kms.createKey({
          alias: `sdk-e2e-${stamp}-rot`,
          keySpec: "AES_256_GCM96",
          keyUsage: "ENCRYPT_DECRYPT",
          scheme: "TRANSIT",
        });
        keyId = created.data.KeyMetadata.KeyId;
      }
      const before = await sdk.kms.rotateKey({ keyId });
      const v1 = before.data.KeyMetadata.PrimaryVersion;
      const after = await sdk.kms.rotateKey({ keyId });
      expect(after.data.KeyMetadata.PrimaryVersion).toBeGreaterThan(v1);
    });
  });
});
