// To run this example, first build the SDK from the root directory:
//   $ pnpm build
// Then run with ts-node:
//   $ ORBITPORT_CLIENT_ID=... ORBITPORT_CLIENT_SECRET=... \
//     npx ts-node examples/kms-usage.ts
//
// If your gateway is op-dev rather than op-prod, also set:
//   $ ORBITPORT_API_URL=https://op-dev.spacecomputer.io

import { OrbitportSDK, fromBase64ToUint8Array } from "../dist/index";

async function main() {
  console.log("--- Orbitport KMS Example ---");

  const clientId = process.env.ORBITPORT_CLIENT_ID;
  const clientSecret = process.env.ORBITPORT_CLIENT_SECRET;
  const apiUrl = process.env.ORBITPORT_API_URL;

  if (!clientId || !clientSecret) {
    console.log(
      "Missing ORBITPORT_CLIENT_ID / ORBITPORT_CLIENT_SECRET — KMS requires authentication."
    );
    return;
  }

  const sdk = new OrbitportSDK({
    config: { clientId, clientSecret, ...(apiUrl ? { apiUrl } : {}) },
  });

  const stamp = Date.now();

  // 1. Discover schemes the gateway supports.
  console.log("\n[1] kms.getCapabilities");
  const caps = await sdk.kms.getCapabilities();
  console.log(
    "Schemes:",
    caps.data.Schemes.map((s) => s.Scheme).join(", ")
  );

  // 2. TRANSIT AES round-trip.
  console.log("\n[2] TRANSIT AES round-trip");
  const aes = await sdk.kms.createKey({
    alias: `sdk-demo-${stamp}-aes`,
    keySpec: "AES_256_GCM96",
    keyUsage: "ENCRYPT_DECRYPT",
    scheme: "TRANSIT",
  });
  const aesKeyId = aes.data.KeyMetadata.KeyId;
  const enc = await sdk.kms.encrypt({ keyId: aesKeyId, plaintext: "hello kms" });
  const dec = await sdk.kms.decrypt({
    keyId: aesKeyId,
    ciphertextBlob: enc.data.CiphertextBlob,
  });
  console.log("Decrypted:", dec.data.Plaintext);

  // 3. ECDSA_P256 sign over a precomputed digest.
  console.log("\n[3] ECDSA_P256 sign DIGEST");
  const ec = await sdk.kms.createKey({
    alias: `sdk-demo-${stamp}-ecdsa`,
    keySpec: "ECDSA_P256",
    keyUsage: "SIGN_VERIFY",
    scheme: "TRANSIT",
  });
  const sha256OfEmpty = new Uint8Array([
    0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8,
    0x99, 0x6f, 0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c,
    0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52, 0xb8, 0x55,
  ]);
  const ecSig = await sdk.kms.sign({
    keyId: ec.data.KeyMetadata.KeyId,
    message: sha256OfEmpty,
    signingAlgorithm: "ECDSA_SHA_256",
    messageType: "DIGEST",
  });
  console.log("Signature (b64, truncated):", ecSig.data.Signature.slice(0, 32) + "...");

  // 4. ETHEREUM key — log Address, sign EIP191.
  console.log("\n[4] ETHEREUM key + EIP191");
  const eth = await sdk.kms.createKey({
    alias: `sdk-demo-${stamp}-eth`,
    keySpec: "ECC_SECG_P256K1",
    keyUsage: "SIGN_VERIFY",
    scheme: "ETHEREUM",
  });
  console.log("Address:", eth.data.KeyMetadata.Address);
  const ethSig = await sdk.kms.sign({
    keyId: eth.data.KeyMetadata.KeyId,
    message: "Hello, Ethereum",
    signingAlgorithm: "ETHEREUM_SECP256K1",
    messageType: "EIP191",
  });
  console.log("EIP191 sig (b64, truncated):", ethSig.data.Signature.slice(0, 32) + "...");

  // 5. generateDataKey — Plaintext is raw base64 binary key material.
  console.log("\n[5] generateDataKey (envelope encryption)");
  const dk = await sdk.kms.generateDataKey({
    keyId: aesKeyId,
    dataKeySpec: "AES_256",
  });
  const rawKeyBytes = fromBase64ToUint8Array(dk.data.Plaintext);
  console.log(
    `Data key bytes: ${rawKeyBytes.length} bytes; CiphertextBlob bytes (b64 length):`,
    dk.data.CiphertextBlob.length
  );

  // 6. rotateKey — observe PrimaryVersion increment.
  console.log("\n[6] rotateKey");
  const before = aes.data.KeyMetadata.PrimaryVersion;
  const rotated = await sdk.kms.rotateKey({ keyId: aesKeyId });
  console.log(
    `PrimaryVersion: ${before} → ${rotated.data.KeyMetadata.PrimaryVersion}`
  );
}

main().catch((err) => {
  console.error("KMS example failed:", err);
  process.exit(1);
});
