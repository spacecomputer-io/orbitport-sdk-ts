# Orbitport SDK

Official TypeScript SDK for SpaceComputer Orbitport - providing access to cosmic True Random Number Generator (cTRNG) services.

## Installation

```bash
npm install @spacecomputer/orbitport-sdk
```

## Quick Start

```typescript
import { OrbitportSDK } from "@spacecomputer/orbitport-sdk";

const sdk = new OrbitportSDK({
  config: {
    clientId: "your-client-id",
    clientSecret: "your-client-secret",
  },
});

// Generate random data
const result = await sdk.ctrng.random();
console.log(result.data.data); // Access the actual random seed
```

## Features

- 🌌 **Cosmic True Random Number Generation** - Access to space-based randomness
- 🔐 **Secure Authentication** - Built-in token management with automatic refresh
- 🔄 **Automatic Retries** - Resilient network handling with exponential backoff
- 💾 **Flexible Storage** - Works in browser, Node.js, and custom environments
- 📦 **TypeScript First** - Full type safety and IntelliSense support
- 🛡️ **Production Ready** - Comprehensive error handling and validation
- ⚡ **Rate Limit Aware** - Built-in handling for API rate limits
- 🧪 **Well Tested** - Comprehensive test suite with 100% e2e test coverage

## API Reference

### Configuration

```typescript
interface OrbitportConfig {
  clientId: string; // Required: Your client ID
  clientSecret: string; // Required: Your client secret
  authUrl?: string; // Optional: Auth server URL (defaults to production)
  apiUrl?: string; // Optional: API server URL (defaults to production)
  timeout?: number; // Optional: Request timeout in ms (default: 30000)
  retryAttempts?: number; // Optional: Retry attempts (default: 3)
  retryDelay?: number; // Optional: Retry delay in ms (default: 1000)
}
```

### cTRNG Service

```typescript
// Generate random data with default source (trng)
const result = await sdk.ctrng.random();

// Access the response structure
console.log(result.data.data); // The actual random seed/string
console.log(result.data.src); // Source used

// Generate with specific source
const rngResult = await sdk.ctrng.random({ src: "rng" });
console.log(rngResult.data.data); // Random data from rng source
```

### Response Structure

The SDK returns a structured response with the following format:

```typescript
interface ServiceResult<T> {
  data: T; // The actual response data
  metadata: {
    // Request metadata
    timestamp: number;
    request_id?: string;
  };
  success: boolean; // Always true for successful responses
}

interface CTRNGResponse {
  service: string; // Usually shows trng
  src: string;
  data: string; // The actual random seed/string
  signature?: {
    // Optional cryptographic signature
    value: string;
    pk: string;
    algo?: string;
  };
  timestamp?: string;
  provider?: string;
}
```

### Authentication

```typescript
// Check if token is valid
const isValid = await sdk.auth.isTokenValid();

// Get token information
const tokenInfo = await sdk.auth.getTokenInfo();

// Clear stored token
await sdk.auth.clearToken();
```

### Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import { OrbitportSDKError, ERROR_CODES } from "@spacecomputer/orbitport-sdk";

try {
  const result = await sdk.ctrng.random();
} catch (error) {
  if (error instanceof OrbitportSDKError) {
    console.log("Error code:", error.code);
    console.log("Error message:", error.message);
    console.log("HTTP status:", error.status);

    // Handle specific error types
    switch (error.code) {
      case ERROR_CODES.AUTH_FAILED:
        // Authentication failed
        break;
      case ERROR_CODES.RATE_LIMITED:
        // Rate limited - SDK will automatically retry
        break;
      case ERROR_CODES.VALIDATION_ERROR:
        // Invalid request parameters
        break;
      case ERROR_CODES.TIMEOUT:
        // Request timeout
        break;
    }
  }
}
```

### Rate Limiting

The SDK automatically handles API rate limits with:

- Built-in retry logic with exponential backoff
- Automatic delays between requests
- Graceful degradation when rate limits are hit

```typescript
// The SDK will automatically handle rate limiting
const results = await Promise.all([
  sdk.ctrng.random(),
  sdk.ctrng.random(),
  sdk.ctrng.random(),
]); // SDK manages timing to avoid rate limits
```

## Environment Variables

You can override default URLs using environment variables:

```bash
export ORBITPORT_AUTH_URL=https://your-auth-server.com
export ORBITPORT_API_URL=https://your-api-server.com
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

# Watch mode for development
npm run build:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type check without building
npm run type-check
```

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run e2e tests (requires valid credentials)
ORBITPORT_CLIENT_ID="your-id" ORBITPORT_CLIENT_SECRET="your-secret" npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### Build Scripts

- `npm run build` - Build the project with TypeScript compiler
- `npm run build:watch` - Build in watch mode
- `npm run clean` - Remove build artifacts
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run type-check` - Type check without emitting files
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:coverage` - Run tests with coverage report

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@spacecomputer.io
- 🐛 Issues: [GitHub Issues](https://github.com/easonchai/orbitport-sdk/issues)
- 📖 Docs: [SpaceComputer Documentation](https://docs.spacecomputer.io)
