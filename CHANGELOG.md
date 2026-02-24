# Changelog

All notable changes to this project will be documented in this file.

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
