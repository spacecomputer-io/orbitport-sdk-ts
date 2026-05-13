# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2026-05-12

### Fixed

- `kms.createKey` now always sends `Description` and `Tags` on the JSON-RPC wire (as `""` / `[]` when the caller omits them). The gateway requires both fields to be present, so the previously-documented minimal payload (`{ alias, keySpec, keyUsage, scheme }`) was rejected with an HTTP 400. `description` and `tags` remain optional in `CreateKeyRequest` — callers need no source change.
- HTTP error responses now carry the server's response body. `OrbitportSDKError.message` includes the (truncated) body text and `OrbitportSDKError.details.httpBody` holds it verbatim, so plain-text gateway errors such as `Request body deserialize error: missing field` are no longer hidden behind a bare `JSON-RPC HTTP error 400`.

### Changed

- `examples/kms.ts` now passes `description` (and a sample `tags` entry) so the example mirrors a complete request.

## [0.2.1] - 2026-05-04

Republish of the 0.2.0 release. The 0.2.0 tag never reached the npm registry — every publish attempt 404'd because `actions/setup-node@v4` was configured with `registry-url`, which made it write a placeholder `.npmrc` and export `NODE_AUTH_TOKEN=XXXXX-XXXXX-XXXXX-XXXXX` that pnpm dutifully forwarded to npm. Dropping `registry-url` lets the OIDC trusted-publisher flow take over (see CI workflow change). No SDK behavior change vs 0.2.0.

## [0.2.0] - 2026-05-01

### Added

- `sdk.kms` Key Management Service — new methods: `createKey`, `encrypt`, `decrypt`, `sign`, `generateDataKey`, `rotateKey`, `getCapabilities`. Talks JSON-RPC 2.0 at `POST /api/v1/rpc`. Supports TRANSIT and ETHEREUM schemes.
- `encoding: "utf8" | "bytes"` option on `kms.encrypt` / `kms.decrypt` — default `"utf8"` keeps auto-decoding to string; pass `"bytes"` for lossless binary `Uint8Array`.
- Shared JSON-RPC 2.0 transport (`src/utils/jsonrpc.ts`) with HTTP and JSON-RPC error mapping; raw RPC code preserved in `error.details.jsonRpcCode`.
- Base64 helpers exported from the SDK: `toBase64`, `fromBase64ToUtf8`, `fromBase64ToUint8Array`.
- New error codes: `KMS_ERROR`, `KMS_KEY_NOT_FOUND`, `KMS_INVALID_KEY_STATE`, `JSON_RPC_ERROR`.
- `examples/kms.ts` and `pnpm run examples:kms` script.
- Renamed `examples/basic-usage.ts` to `examples/ctrng.ts`; the corresponding script is `pnpm run examples:ctrng`.

### Changed

- README and SDK doc-comments now position the SDK as a multi-product facade. cTRNG and KMS sit as peer products; IPFS beacon details are scoped under cTRNG. No code-level breaking changes.

## [0.1.0] - 2026-02-24

### Breaking Changes

- **`authUrl` config field removed** — Replaced by two new fields:
  - `authDomain` (string): Auth domain without protocol (default: `"auth.spacecomputer.io"`)
  - `audience` (string): OAuth2 audience URL (default: `"https://op.spacecomputer.io/api"`)

#### Migration

Before (v0.0.x):
```typescript
const sdk = new OrbitportSDK({
  config: {
    clientId: 'your-id',
    clientSecret: 'your-secret',
    authUrl: 'https://dev-1usujmbby8627ni8.us.auth0.com', // full URL
  },
});
```

After (v0.1.0):
```typescript
const sdk = new OrbitportSDK({
  config: {
    clientId: 'your-id',
    clientSecret: 'your-secret',
    authDomain: 'auth.spacecomputer.io',           // domain only, no https://
    audience: 'https://op.spacecomputer.io/api',    // explicit audience
  },
});
```

If you were using the defaults (no custom `authUrl`), no code changes are needed — the new defaults point to production.

### Changed

- Default auth endpoint moved from dev Auth0 tenant (`dev-1usujmbby8627ni8.us.auth0.com`) to production (`auth.spacecomputer.io`)
- Token endpoint is now constructed as `https://{authDomain}/oauth/token`
- OAuth2 audience is now an explicit config field instead of being derived from `apiUrl + "/api"`
- Config matches the new env var convention: `OP_AUTH_DOMAIN` + `OP_AUTH_AUDIENCE`

## [0.0.4] - 2025-07-23

- Update IPNS route to latest

## [0.0.3] - 2025-07-23

- Patch version with linting fixes

## [0.0.2] - 2025-07-22

- Initial public release
