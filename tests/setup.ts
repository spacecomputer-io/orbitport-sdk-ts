/**
 * Jest test setup
 */

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to suppress console.log in tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = "test";

// Increase timeout for API tests
jest.setTimeout(30000);
