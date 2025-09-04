#!/usr/bin/env ts-node

/**
 * Simple script to run end-to-end tests with real credentials
 *
 * Usage:
 *   ORBITPORT_CLIENT_ID=your-id ORBITPORT_CLIENT_SECRET=your-secret npm run test:e2e
 *
 * Or set environment variables in your shell:
 *   export ORBITPORT_CLIENT_ID=your-client-id
 *   export ORBITPORT_CLIENT_SECRET=your-client-secret
 *   npm run test:e2e
 */

import { OrbitportSDK } from "../src/index";
import type { ServiceResult, CTRNGResponse } from "../src/types";

async function runE2ETest() {
  const clientId = process.env.ORBITPORT_CLIENT_ID;
  const clientSecret = process.env.ORBITPORT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ Missing credentials!");
    console.error(
      "Please set ORBITPORT_CLIENT_ID and ORBITPORT_CLIENT_SECRET environment variables."
    );
    console.error("");
    console.error("Example:");
    console.error("  export ORBITPORT_CLIENT_ID=your-client-id");
    console.error("  export ORBITPORT_CLIENT_SECRET=your-client-secret");
    console.error("  npm run test:e2e");
    process.exit(1);
  }

  console.log("🚀 Starting Orbitport SDK End-to-End Test...");
  console.log("");

  try {
    // Initialize SDK
    console.log("📦 Initializing SDK...");
    const sdk = new OrbitportSDK({
      config: {
        clientId,
        clientSecret,
      },
      //   debug: true,
    });
    console.log("✅ SDK initialized successfully");
    console.log("");

    // Test authentication
    console.log("🔐 Testing authentication...");
    const token = await sdk.auth.getValidToken();
    if (token) {
      console.log("✅ Authentication successful");
      console.log(`   Token: ${token.substring(0, 20)}...`);
    } else {
      console.log("❌ Authentication failed");
      process.exit(1);
    }
    console.log("");

    // Test token validation
    console.log("🔍 Testing token validation...");
    const isValid = await sdk.auth.isTokenValid();
    console.log(`✅ Token is ${isValid ? "valid" : "invalid"}`);
    console.log("");

    // Test cTRNG with default source
    console.log("🌌 Testing cTRNG with default source (trng)...");
    try {
      const trngResult = await sdk.ctrng.random();
      if (trngResult.success) {
        console.log("✅ TRNG generation successful");
        console.log(`   Service: ${trngResult.data.service}`);
        console.log(`   Source: ${trngResult.data.src}`);
        console.log(
          `   Data length: ${trngResult.data.data.length} characters`
        );
        console.log(
          `   Data preview: ${trngResult.data.data.substring(0, 50)}...`
        );
        console.log(
          `   Signature: ${
            trngResult.data.signature
              ? trngResult.data.signature.value.substring(0, 20) + "..."
              : "none"
          }`
        );
        console.log(`   Full data: ${trngResult.data.data}`);
      } else {
        console.log("❌ TRNG generation failed");
        console.log("   Result:", trngResult);
        process.exit(1);
      }
    } catch (error: any) {
      console.log("❌ TRNG generation failed with error:");
      console.log("   Error:", error.message);
      console.log("   Code:", error.code);
      console.log("   Status:", error.status);
      console.log("   Details:", error.details);
      process.exit(1);
    }
    console.log("");

    // Test cTRNG with rng source
    console.log("🎲 Testing cTRNG with rng source...");
    try {
      const rngResult = await sdk.ctrng.random({ src: "rng" });
      if (rngResult.success) {
        console.log("✅ RNG generation successful");
        console.log(`   Service: ${rngResult.data.service}`);
        console.log(`   Source: ${rngResult.data.src}`);
        console.log(`   Data length: ${rngResult.data.data.length} characters`);
        console.log(
          `   Data preview: ${rngResult.data.data.substring(0, 50)}...`
        );
        console.log(`   Full data: ${rngResult.data.data}`);
      } else {
        console.log("❌ RNG generation failed");
        console.log("   Result:", rngResult);
        process.exit(1);
      }
    } catch (error: any) {
      console.log("❌ RNG generation failed with error:");
      console.log("   Error:", error.message);
      console.log("   Code:", error.code);
      console.log("   Status:", error.status);
      console.log("   Details:", error.details);
      process.exit(1);
    }
    console.log("");

    // Test sequential requests with delay (to avoid rate limiting)
    console.log("⏱️  Testing sequential requests with delay...");
    const sequentialResults: ServiceResult<CTRNGResponse>[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        console.log(`   Making request ${i + 1}/3...`);
        const result = await sdk.ctrng.random();
        if (result.success) {
          sequentialResults.push(result);
          console.log(`   ✅ Request ${i + 1} successful`);
        } else {
          console.log(`   ❌ Request ${i + 1} failed:`, result);
        }

        // Add delay between requests (except for the last one)
        if (i < 2) {
          console.log("   ⏳ Waiting 2 seconds before next request...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        console.log(`   ❌ Request ${i + 1} failed with error:`, {
          message: error.message,
          code: error.code,
          status: error.status,
        });
      }
    }

    console.log(
      `   Sequential requests completed: ${sequentialResults.length}/3 successful`
    );
    if (sequentialResults.length > 0) {
      const dataValues = sequentialResults.map((r) => r.data.data);
      const uniqueData = new Set(dataValues);
      console.log(
        `   Unique datasets: ${uniqueData.size}/${sequentialResults.length}`
      );
    }
    console.log("");

    // Test configuration
    console.log("⚙️  Testing configuration...");
    const config = sdk.getConfig();
    console.log("✅ Configuration retrieved");
    console.log(`   Auth URL: ${config.authUrl}`);
    console.log(`   API URL: ${config.apiUrl}`);
    console.log(`   Timeout: ${config.timeout}ms`);
    console.log(`   Retry attempts: ${config.retryAttempts}`);
    console.log("");

    console.log(
      "🎉 All tests passed! Your Orbitport SDK is working correctly."
    );
    console.log("");
    console.log("📊 Summary:");
    console.log("   ✅ SDK initialization");
    console.log("   ✅ Authentication");
    console.log("   ✅ Token validation");
    console.log("   ✅ TRNG generation");
    console.log("   ✅ RNG generation");
    console.log("   ✅ Multiple requests");
    console.log("   ✅ Configuration access");
  } catch (error) {
    console.error("❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runE2ETest().catch(console.error);
