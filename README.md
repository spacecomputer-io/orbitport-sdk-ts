# Orbitport SDK

Official TypeScript SDK for SpaceComputer Orbitport key management and tenant-scoped JSON key storage.

| Product | Namespace | What it does |
| --- | --- | --- |
| KMS | `sdk.kms` | Key management (TRANSIT and ETHEREUM schemes), plus a tenant-scoped JSON key store. |

## Installation

```bash
npm i @spacecomputer-io/orbitport-sdk-ts
```

## Quick Start

```typescript
import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

const sdk = new OrbitportSDK({
  config: {
    accessToken: "your-access-token",
  },
});

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

- 🔐 **Bearer-token authentication** — use a PAT from the accounts portal.
- 📦 **TypeScript first** — full type safety and IntelliSense for all SDK methods.
- 🛡️ **Consistent error model** — typed `OrbitportSDKError` with stable codes.
- 💾 **Flexible storage** — browser, Node.js, and custom token stores.
- 🔑 **Key management:** TRANSIT and ETHEREUM schemes over JSON-RPC 2.0, plus the tenant-scoped key store.

## Configuration

The SDK uses a pre-issued bearer token. Set `accessToken` to a PAT created in the accounts portal for the selected API environment.

```typescript
interface OrbitportConfig {
  accessToken?: string; // Pre-issued bearer token or PAT
  apiUrl?: string; // Optional: API server URL
  timeout?: number; // Optional: Request timeout in ms (default: 30000)
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

KMS methods return a uniform `ServiceResult<T>`:

```typescript
interface ServiceResult<T> {
  data: T;
  metadata: { timestamp: number; request_id?: string };
  success: boolean;
}
```

## KMS (`sdk.kms`)

The KMS service talks JSON-RPC 2.0 to the Orbitport gateway at `POST /api/v1/rpc`. It requires a bearer token. Inputs are camelCase; outputs preserve the gateway's PascalCase wire shape so server documentation can be grepped directly.

```typescript
import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";

const sdk = new OrbitportSDK({
  config: { accessToken: "..." },
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

Keys created with `scheme: "ETHEREUM"` (and `keySpec: "ECC_SECG_P256K1"`) expose an `Address` field on `KeyMetadata`. The key sign-only currency is Ethereum personal_sign and friends:

```typescript
const key = await sdk.kms.createKey({
  alias: 'demo-eth',
  keySpec: 'ECC_SECG_P256K1',
  keyUsage: 'SIGN_VERIFY',
  scheme: 'ETHEREUM',
});
console.log(key.data.KeyMetadata.Address); // checksummed 0x… address

// EIP-191 personal-sign (what wallets do with signMessage)
const sig = await sdk.kms.sign({
  keyId: key.data.KeyMetadata.KeyId,
  message: 'Hello, Ethereum',
  signingAlgorithm: 'ETHEREUM_SECP256K1',
  messageType: 'EIP191',
});

// RAW and DIGEST message types are also accepted for secp256k1 keys.
```

Ethereum keys do not support encrypt/decrypt, data keys, or rotation — the gateway rejects those combinations. Use `ETHEREUM_SECP256K1` with `EIP191` for personal-sign-style messages; `RAW` and `DIGEST` behave as they do for TRANSIT keys.

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
ORBITPORT_ACCESS_TOKEN=... \
  pnpm run examples:kms
```

## Authentication (`sdk.auth`)

Pass your PAT or bearer token as `accessToken`. The SDK uses it directly without persisting or refreshing it. Replace an expired token with `sdk.updateConfig({ accessToken: newToken })`.

If `accessToken` is omitted, the SDK can read a bearer token from the configured `TokenStorage`. `clearToken()` clears that storage only; it does not clear a configured `accessToken` or revoke a token on the server. JWT expiry checks use a 60-second buffer; the server validates signatures and permissions.

```typescript
const isValid = await sdk.auth.isTokenValid();
const tokenInfo = await sdk.auth.getTokenInfo();
await sdk.auth.clearToken();
```

## Error handling

SDK methods throw `OrbitportSDKError` with a typed `code` from `ERROR_CODES`. KMS additionally exposes the raw JSON-RPC error code via `error.details.jsonRpcCode`.

```typescript
import { OrbitportSDKError, ERROR_CODES } from "@spacecomputer-io/orbitport-sdk-ts";

try {
  await sdk.kms.sign({ keyId, message: "hi", signingAlgorithm: "ECDSA_SHA_256" });
} catch (error) {
  if (error instanceof OrbitportSDKError) {
    console.log(error.code); // AUTH_FAILED, NETWORK_ERROR, KMS_KEY_NOT_FOUND, …
  }
}
```

Common codes: `AUTH_FAILED`, `NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `VALIDATION_ERROR`, `API_ERROR`, `INSUFFICIENT_CREDITS`, `ACCOUNT_UNAVAILABLE`. KMS adds `KMS_ERROR`, `KMS_KEY_NOT_FOUND`, `KMS_INVALID_KEY_STATE`, `JSON_RPC_ERROR`.

HTTP `402` maps to `INSUFFICIENT_CREDITS`: the gateway's account plugin holds credits before serving each request and your balance was empty. Top up in the accounts portal and retry. HTTP `503` carrying `account_plugin_unavailable` maps to `ACCOUNT_UNAVAILABLE`: the gateway could not reach the account service, so the request was not authorized or credit-fenced; retry later.

## Development

### Prerequisites

- Node.js 22+
- TypeScript 5.0+

### Setup

The repo pins pnpm via `packageManager` — Corepack picks it up automatically:

```bash
corepack enable

# Install dependencies
pnpm install

# Build the project
pnpm run build
```

### Testing

```bash
# Run all tests
pnpm test

# Run e2e tests with a PAT against the development environment
ORBITPORT_ACCESS_TOKEN="..." \
ORBITPORT_API_URL="https://op-dev.spacecomputer.io" \
  pnpm run test:e2e

# Or load the token and API URL from a local .env file
node --env-file=.env node_modules/jest/bin/jest.js tests/e2e.test.ts --runInBand
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@spacecomputer.io
- 🐛 Issues: [GitHub Issues](https://github.com/spacecomputer-io/orbitport-sdk-ts/issues)
- 📖 Docs: [SpaceComputer Documentation](https://docs.spacecomputer.io)
