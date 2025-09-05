# Orbitport SDK

Official TypeScript SDK for SpaceComputer Orbitport - providing access to cosmic True Random Number Generator (cTRNG) services.

## Installation

```bash
npm install @spacecomputer/orbitport-sdk
```

## Quick Start

```typescript
import { OrbitportSDK } from "@spacecomputer/orbitport-sdk";

// With API credentials (tries API first, falls back to IPFS)
const sdkWithAPI = new OrbitportSDK({
  config: {
    clientId: "your-client-id",
    clientSecret: "your-client-secret",
  },
});
const resultWithAPI = await sdkWithAPI.ctrng.random();
console.log(resultWithAPI.data.data);

// Without API credentials (uses IPFS only)
const sdkIPFSOnly = new OrbitportSDK({ config: {} });
const resultIPFSOnly = await sdkIPFSOnly.ctrng.random();
console.log(resultIPFSOnly.data.data);
```

## Features

- 🌌 **Cosmic True Random Number Generation** - Access space-based randomness via API or IPFS.
- 🛰️ **IPFS Beacon Support** - Fallback to decentralized IPFS beacons for cTRNG data.
- 🔄 **Automatic Fallback** - Defaults to API if credentials are provided, with automatic fallback to IPFS.
- 🔐 **Secure Authentication** - Built-in token management with automatic refresh for API access.
- 비교 **Source Comparison** - Always reads from both IPFS gateway and API to ensure data integrity, just like `beacon.js`.
- 💾 **Flexible Storage** - Works in browser, Node.js, and custom environments.
- 📦 **TypeScript First** - Full type safety and IntelliSense support.
- 🛡️ **Production Ready** - Comprehensive error handling and validation.

## API Reference

### Configuration

The SDK can be initialized with or without API credentials.

```typescript
interface OrbitportConfig {
  clientId?: string; // Optional: Your client ID
  clientSecret?: string; // Optional: Your client secret
  authUrl?: string; // Optional: Auth server URL
  apiUrl?: string; // Optional: API server URL
  timeout?: number; // Optional: Request timeout in ms (default: 30000)
  retryAttempts?: number; // Optional: Retry attempts (default: 3)
  retryDelay?: number; // Optional: Retry delay in ms (default: 1000)
  ipfs?: IPFSConfig; // Optional: Custom IPFS settings
}

interface IPFSConfig {
  gateway?: string;
  apiUrl?: string;
  timeout?: number;
  defaultBeaconPath?: string;
}
```

### cTRNG Service (`sdk.ctrng`)

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
```

### Response Structure

All `random()` calls return a consistent response structure:

```typescript
interface ServiceResult<CTRNGResponse> {
  data: CTRNGResponse;
  metadata: {
    timestamp: number;
    request_id?: string;
  };
  success: boolean;
}

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

### Authentication (`sdk.auth`)

Authentication methods are only relevant when using the API.

```typescript
// Check if token is valid
const isValid = await sdk.auth.isTokenValid();

// Get token information
const tokenInfo = await sdk.auth.getTokenInfo();
```

### Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import { OrbitportSDKError, ERROR_CODES } from "@spacecomputer/orbitport-sdk";

try {
  const result = await sdk.ctrng.random();
} catch (error) {
  if (error instanceof OrbitportSDKError) {
    console.log("Error code:", error.code); // e.g., AUTH_FAILED, NETWORK_ERROR
    console.log("Error message:", error.message);
  }
}
```

## IPFS Beacon Integration Details

The SDK's IPFS integration is designed to mirror the functionality of the `beacon.js` script, providing robustness and verifiability.

### Default IPFS Configuration

- **Gateway**: `https://ipfs.io`
- **API**: `http://65.109.2.230:5001`
- **Default Beacon**: `/ipns/k2k4r8pigrw8i34z63om8f015tt5igdq0c46xupq8spp1bogt35k5vhe`

You can override these defaults in the SDK configuration.

### Debug Output

When `debug: true` is enabled, you will see detailed logs, including the IPFS source comparison:

```
[OrbitportSDK] Reading from BOTH IPFS sources:
  - Gateway: https://ipfs.io
  - API: http://65.109.2.230:5001
  - Path: /ipns/k2k4r8pigrw8i34z63om8f015tt5igdq0c46xupq8spp1bogt35k5vhe

[OrbitportSDK] ✓ Gateway and API agree on sequence/previous
```

## Development

### Prerequisites

- Node.js 16+
- TypeScript 4.5+

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

# Run e2e tests (requires valid credentials)
ORBITPORT_CLIENT_ID="your-id" ORBITPORT_CLIENT_SECRET="your-secret" npm run test:e2e
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@spacecomputer.io
- 🐛 Issues: [GitHub Issues](https://github.com/easonchai/orbitport-sdk/issues)
- 📖 Docs: [SpaceComputer Documentation](https://docs.spacecomputer.io)
