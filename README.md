# Orbitport SDK

Official TypeScript SDK for SpaceComputer Orbitport. One client, all Orbitport products — accessed as peers under a single facade.

| Product | Namespace | What it does |
| --- | --- | --- |
| cTRNG | `sdk.ctrng` | Cosmic True Random Number Generation (API or IPFS beacon). |
| KMS | `sdk.kms` | Key management, post-quantum signing and key agreement, plus a tenant-scoped JSON key store. |

## Installation

```bash
npm i @spacecomputer-io/orbitport-sdk-ts
```

## Quick Start

```typescript
import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

const sdk = new OrbitportSDK({
  config: {
    clientId: "your-client-id",
    clientSecret: "your-client-secret",
  },
});

// cTRNG — cosmic randomness
const random = await sdk.ctrng.random();
console.log(random.data.data);

// KMS — create a key and sign with it
const key = await sdk.kms.createKey({
  alias: "demo",
  keySpec: "ECDSA_P256",
  keyUsage: "SIGN_VERIFY",
});
const sig = await sdk.kms.sign({
  keyId: key.data.KeyMetadata.KeyId,
  message: "hello orbitport",
  signingAlgorithm: "ECDSA_SHA_256",
});
```

## Features

- 🛰️ **Single facade for every Orbitport product** — `sdk.ctrng`, `sdk.kms`, and future services share one config, one auth flow, one error model.
- 🔐 **Built-in OAuth2** — automatic token acquisition, caching, and refresh.
- 📦 **TypeScript first** — full type safety and IntelliSense across every product.
- 🛡️ **Consistent error model** — typed `OrbitportSDKError` with stable codes across products.
- 💾 **Flexible storage** — browser, Node.js, and custom token stores.
- 🌌 **cTRNG specific:** API source with automatic IPFS-beacon fallback, dual-source comparison for integrity.
- 🔑 **KMS specific:** TRANSIT and ETHEREUM schemes over JSON-RPC 2.0, plus the tenant-scoped key store.

## Configuration

The SDK accepts either OAuth client credentials or a pre-issued bearer token. Use `accessToken` for PATs created in the accounts portal; do not combine it with `clientId` and `clientSecret`. cTRNG can also run without authentication against the public IPFS beacon.

```typescript
interface OrbitportConfig {
  clientId?: string; // OAuth client ID
  clientSecret?: string; // OAuth client secret
  accessToken?: string; // Pre-issued bearer token or PAT
  authDomain?: string; // OAuth domain (default: "auth.spacecomputer.io")
  audience?: string; // Optional: Auth audience URL (default: "https://op.spacecomputer.io/api")
  apiUrl?: string; // Optional: API server URL
  timeout?: number; // Optional: Request timeout in ms (default: 30000)
  retryAttempts?: number; // Optional: Retry attempts (default: 3)
  retryDelay?: number; // Optional: Retry delay in ms (default: 1000)
  ipfs?: IPFSConfig; // Optional: cTRNG-specific IPFS beacon overrides
}

interface IPFSConfig {
  gateway?: string;
  apiUrl?: string;
  timeout?: number;
  defaultBeaconPath?: string;
}
```

For the development environment, pass the PAT from `accounts-dev.spacecomputer.io` and point the SDK at `op-dev`:

```typescript
const sdk = new OrbitportSDK({
  config: {
    accessToken: process.env.ORBITPORT_ACCESS_TOKEN,
    apiUrl: "https://op-dev.spacecomputer.io",
  },
});
```

All products return a uniform `ServiceResult<T>`:

```typescript
interface ServiceResult<T> {
  data: T;
  metadata: { timestamp: number; request_id?: string };
  success: boolean;
}
```

## cTRNG (`sdk.ctrng`)

#### `random(request?, options?)`

Generates true random numbers from the best available source.

**Behavior:**

- If `clientId` and `clientSecret` are provided, it attempts to use the API first. If the API call fails, it automatically falls back to IPFS.
- If credentials are not provided, it uses IPFS by default.
- When using IPFS, it always fetches from both the gateway and the API node to compare results for integrity, exactly like the original `beacon.js` script.

```typescript
// Automatic source selection (API if configured, otherwise IPFS)
const result = await sdk.ctrng.random();

// Force use of IPFS beacon
const ipfsResult = await sdk.ctrng.random({ src: "ipfs" });

// Force use of a specific API source (if configured)
const rngResult = await sdk.ctrng.random({ src: "rng" });

// Use a custom IPFS beacon path
const customBeaconResult = await sdk.ctrng.random({
  src: "ipfs",
  beaconPath: "/ipns/your-custom-beacon-cid",
});

// Select a specific cTRNG value from the beacon array
const specificValue = await sdk.ctrng.random({
  src: "ipfs",
  index: 2, // Select the 3rd value (0-indexed)
});

// Get cTRNG from a specific block (traverse back through the chain)
const blockValue = await sdk.ctrng.random({
  src: "ipfs",
  block: 10012, // Get from block 10012
  index: 1, // Select the 2nd value from that block
});

// Get latest block with specific index
const latestValue = await sdk.ctrng.random({
  src: "ipfs",
  block: "INF", // Latest block (default)
  index: 0, // First value (default)
});
```

### cTRNG response shape

```typescript
interface CTRNGResponse {
  service: string; // "trng", "rng", or "ipfs-beacon"
  src: string; // "trng", "rng", or "ipfs"
  data: string; // The random value as a string
  signature?: {
    value: string;
    pk: string;
  }; // API only
  timestamp?: string;
  provider?: string;
}
```

### IPFS beacon

cTRNG can read from a decentralized IPFS beacon, either as the primary source (no credentials provided) or as automatic fallback when the API is unreachable. The SDK reads from both an IPFS gateway and an IPFS API node and compares the two for integrity, mirroring the upstream `beacon.js` reference.

**Defaults:**
- **Gateway**: `https://ipfs.io`
- **API**: `https://ipfs.io`
- **Default beacon**: `/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f`

Override any of these via `OrbitportConfig.ipfs`.

When `debug: true` is enabled, you'll see the dual-source comparison:

```
[OrbitportSDK] Reading from BOTH IPFS sources:
  - Gateway: https://ipfs.io
  - API: https://ipfs.io
  - Path: /ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f

[OrbitportSDK] ✓ Gateway and API agree on sequence/previous
```

**Array selection and block traversal:**

IPFS beacons contain arrays of cTRNG values posted in batches; each beacon links to the previous block via a `previous` field, forming a chain. You can:

1. Select specific values from the array via `index`
2. Traverse back through blocks via `block`

```typescript
// Second cTRNG value from latest block
await sdk.ctrng.random({ src: "ipfs", index: 1 });

// Specific block
await sdk.ctrng.random({ src: "ipfs", block: 10012, index: 2 });

// Latest block (default)
await sdk.ctrng.random({ src: "ipfs", block: "INF", index: 0 });
```

Notes:
- `index` is 0-based; out-of-bounds indices wrap via modulo against the array length, so requests never fail on length.
- `block` accepts `"INF"` (latest, default) or a numeric block. Requesting a block above the current head throws.
- Block traversal walks the `previous` chain backwards from the latest block.
- With `debug: true`, the SDK logs traversal and index adjustments.

### Example

A full walkthrough lives in [`examples/ctrng.ts`](examples/ctrng.ts). Run it with:

```bash
pnpm run examples:ctrng
```

## KMS (`sdk.kms`)

The KMS service talks JSON-RPC 2.0 to the Orbitport gateway at `POST /api/v1/rpc`. It requires API credentials. Inputs are camelCase; outputs preserve the gateway's PascalCase wire shape so server documentation can be grepped directly.

```typescript
import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

const sdk = new OrbitportSDK({
  config: { clientId: "...", clientSecret: "..." },
});

const key = await sdk.kms.createKey({
  alias: "demo-key",
  keySpec: "AES_256_GCM96",
  keyUsage: "ENCRYPT_DECRYPT",
});

const enc = await sdk.kms.encrypt({
  keyId: key.data.KeyMetadata.KeyId,
  plaintext: "hello kms",
});

const dec = await sdk.kms.decrypt({
  keyId: key.data.KeyMetadata.KeyId,
  ciphertextBlob: enc.data.CiphertextBlob,
});
console.log(dec.data.Plaintext); // "hello kms"
```

### Methods

| Method | Description |
| --- | --- |
| `createKey({ alias, keySpec, keyUsage, scheme?, description?, tags? })` | Create a key under `TRANSIT` (default) or `ETHEREUM`. |
| `encrypt({ keyId, plaintext, encoding?, encryptionAlgorithm? })` | Encrypt under a TRANSIT key. |
| `decrypt({ ciphertextBlob, keyId?, encoding?, encryptionAlgorithm? })` | Decrypt a previously produced ciphertext. |
| `sign({ keyId, message, signingAlgorithm, messageType? })` | Sign with a TRANSIT or ETHEREUM key. |
| `generateDataKey({ keyId, dataKeySpec? \| numberOfBytes? })` | Envelope encryption helper — returns a fresh data key, both as plaintext and wrapped under `keyId`. |
| `rotateKey({ keyId })` | Rotate the key's primary version. |
| `keyStore.put({ name, secret })` | Store or replace a tenant-scoped JSON object. |
| `keyStore.get({ name })` | Read a key-store entry. |
| `keyStore.list({ prefix? })` | List immediate entries and folders under a prefix. |
| `keyStore.delete({ name })` | Delete a key-store entry. |
| `getCapabilities()` | Discover the deployed schemes and algorithms. |

All methods return `Promise<ServiceResult<T>>` with `T` shaped to match the wire response.

### Plaintext encoding

`encrypt` and `decrypt` accept an `encoding: "utf8" | "bytes"` option (default `"utf8"`). The default keeps the auto-decode behavior most callers want; pass `"bytes"` for binary fidelity.

```typescript
// "utf8" (default) — input string ↔ output string
await sdk.kms.encrypt({ keyId, plaintext: "hello" });
const dec = await sdk.kms.decrypt({ keyId, ciphertextBlob });
// dec.data.Plaintext: string

// "bytes" — input Uint8Array ↔ output Uint8Array (lossless)
const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
const enc = await sdk.kms.encrypt({ keyId, plaintext: bytes, encoding: "bytes" });
const decBytes = await sdk.kms.decrypt({
  keyId,
  ciphertextBlob: enc.data.CiphertextBlob,
  encoding: "bytes",
});
// decBytes.data.Plaintext: Uint8Array
```

`generateDataKey` returns `Plaintext` as raw base64 (binary key material — no `encoding` flag). Use the exported helpers to decode manually when needed:

```typescript
import { fromBase64ToUint8Array } from "@spacecomputer-io/orbitport-sdk-ts";
const dk = await sdk.kms.generateDataKey({ keyId, dataKeySpec: "AES_256" });
const rawBytes = fromBase64ToUint8Array(dk.data.Plaintext);
```

The SDK also exports `toBase64` and `fromBase64ToUtf8` for direct use.

### ETHEREUM scheme

Keys created with `scheme: "ETHEREUM"` (and `keySpec: "ECC_SECG_P256K1"`) expose an `Address` field on `KeyMetadata`. Use `signingAlgorithm: "ETHEREUM_SECP256K1"` together with `messageType: "EIP191"` for personal-sign style messages.

### Key store

The key store keeps tenant-scoped JSON objects under slash-separated names. `list` returns immediate children; folder names end in `/`.

```typescript
await sdk.kms.keyStore.put({
  name: "github/prod",
  secret: { apiKey: "..." },
});

const entry = await sdk.kms.keyStore.get({ name: "github/prod" });
const names = await sdk.kms.keyStore.list({ prefix: "github" });
await sdk.kms.keyStore.delete({ name: "github/prod" });
```

Names may contain letters, digits, `.`, `_`, and `-` in slash-separated segments. The SDK rejects `.` and `..` segments.

Key-store reads preserve large or high-precision JSON numbers as `LosslessNumber` values. Safe numbers stay as ordinary JavaScript numbers. Use the exported `isLosslessNumber` helper and call `.toString()` when you need the exact numeric text. You can pass a retrieved `Secret` back to `put` without changing those values.

```typescript
import { isLosslessNumber } from "@spacecomputer-io/orbitport-sdk-ts";

const value = entry.data.Secret.largeCounter;
if (isLosslessNumber(value)) {
  console.log(value.toString());
}
```

### Errors and retries

KMS methods do **not** retry by default — `CreateKey` and `Sign` are not idempotent. Pass `RequestOptions.retries` per call when you want retry behavior.

Possible error codes (in addition to the standard SDK codes): `KMS_ERROR`, `KMS_KEY_NOT_FOUND`, `KMS_INVALID_KEY_STATE`, `JSON_RPC_ERROR`. Errors raised from the JSON-RPC layer expose the raw RPC code in `error.details.jsonRpcCode` for advanced branching.

### Example

A full walkthrough lives in [`examples/kms.ts`](examples/kms.ts). Run it with:

```bash
ORBITPORT_CLIENT_ID=... ORBITPORT_CLIENT_SECRET=... \
  pnpm run examples:kms
```

## Authentication (`sdk.auth`)

Pass `accessToken` when you already have a PAT or bearer token. The SDK uses it directly and does not write it to token storage. For OAuth client credentials, the SDK still acquires, caches, and refreshes tokens automatically.

```typescript
const isValid = await sdk.auth.isTokenValid();
const tokenInfo = await sdk.auth.getTokenInfo();
await sdk.auth.clearToken();
```

## Error handling

Every product throws `OrbitportSDKError` with a typed `code` from `ERROR_CODES`. KMS additionally exposes the raw JSON-RPC error code via `error.details.jsonRpcCode`.

```typescript
import { OrbitportSDKError, ERROR_CODES } from "@spacecomputer-io/orbitport-sdk-ts";

try {
  await sdk.ctrng.random();
  await sdk.kms.sign({ keyId, message: "hi", signingAlgorithm: "ECDSA_SHA_256" });
} catch (error) {
  if (error instanceof OrbitportSDKError) {
    console.log(error.code); // AUTH_FAILED, NETWORK_ERROR, KMS_KEY_NOT_FOUND, …
  }
}
```

Common codes: `AUTH_FAILED`, `NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `VALIDATION_ERROR`, `API_ERROR`. KMS adds `KMS_ERROR`, `KMS_KEY_NOT_FOUND`, `KMS_INVALID_KEY_STATE`, `JSON_RPC_ERROR`.

## Development

### Prerequisites

- Node.js 22+
- TypeScript 5.0+

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run e2e tests with a PAT against the development environment
ORBITPORT_ACCESS_TOKEN="..." \
ORBITPORT_API_URL="https://op-dev.spacecomputer.io" \
  npm run test:e2e

# Or use OAuth client credentials
ORBITPORT_CLIENT_ID="your-id" ORBITPORT_CLIENT_SECRET="your-secret" npm run test:e2e
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@spacecomputer.io
- 🐛 Issues: [GitHub Issues](https://github.com/easonchai/orbitport-sdk/issues)
- 📖 Docs: [SpaceComputer Documentation](https://docs.spacecomputer.io)
