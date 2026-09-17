/**
 * End-to-end tests for Orbitport SDK
 *
 * Set ORBITPORT_ACCESS_TOKEN to a pre-issued bearer token.
 * ORBITPORT_API_URL overrides the API origin.
 */

import { OrbitportSDK, createOrbitportSDK } from "../src/index";

// Utility function to add delays between requests to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Orbitport SDK E2E Tests", () => {
  const accessToken = process.env.ORBITPORT_ACCESS_TOKEN;
  const apiUrl = process.env.ORBITPORT_API_URL;

  if (!accessToken) {
    console.warn(
      "Skipping E2E tests: set ORBITPORT_ACCESS_TOKEN"
    );
    return;
  }

  const authenticatedConfig = { accessToken, apiUrl };

  let sdk: OrbitportSDK;

  beforeAll(() => {
    sdk = new OrbitportSDK({
      config: authenticatedConfig,
      // debug: true, // Enable debug logging for tests
    });
  });

  describe("SDK Initialization", () => {
    it("should initialize with an access token", () => {
      expect(sdk).toBeDefined();
      expect(sdk.kms).toBeDefined();
      expect(sdk.auth).toBeDefined();
    });

    it("should have correct configuration", () => {
      const config = sdk.getConfig();
      expect(config.accessToken).toBe("[REDACTED]");
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

  describe("Factory Function", () => {
    it("should work with createOrbitportSDK factory", async () => {
      // Add delay before this test
      await delay(2000);

      const factorySdk = createOrbitportSDK(authenticatedConfig);

      const result = await factorySdk.kms.getCapabilities();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("KMS Service", () => {
    const stamp = Date.now();
    let transitKeyId: string | undefined;
    let ethereumKeyId: string | undefined;

    it("lists the public TRANSIT and ETHEREUM schemes", async () => {
      const res = await sdk.kms.getCapabilities();
      expect(res.success).toBe(true);
      const schemes = res.data.Schemes.map((s) => s.Scheme);
      expect(schemes).toEqual(["TRANSIT", "ETHEREUM"]);
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

    it("puts, gets, lists, and deletes a disposable key-store entry", async () => {
      const name = `sdk-e2e/${stamp}`;
      let created = false;

      try {
        const put = await sdk.kms.keyStore.put({
          name,
          secret: { purpose: "sdk-e2e", stamp },
        });
        created = true;
        expect(put.data).toMatchObject({ Name: name, Version: 1 });

        const get = await sdk.kms.keyStore.get({ name });
        expect(get.data).toEqual({
          Name: name,
          Secret: { purpose: "sdk-e2e", stamp },
        });

        const list = await sdk.kms.keyStore.list({ prefix: "sdk-e2e" });
        expect(list.data.Names).toContain(name);
      } finally {
        if (created) {
          await sdk.kms.keyStore.delete({ name });
        }
      }

      await expect(sdk.kms.keyStore.get({ name })).rejects.toBeDefined();
    });
  });
});
