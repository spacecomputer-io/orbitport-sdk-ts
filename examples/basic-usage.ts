// To run this example, you might first need to build the SDK from the root directory:
// $ pnpm build
// Then, you can run this file using ts-node:
// $ pnpm add -D ts-node
// $ npx ts-node examples/basic-usage.ts

import { OrbitportSDK } from "../dist/index";

/**
 * Main function to run the SDK examples.
 */
async function main() {
  console.log("--- Orbitport SDK Example ---");

  const DEBUG = false;

  // --- Example 1: API with IPFS Fallback (Recommended) ---
  // If you provide API credentials, the SDK will fetch data from the API.
  // If the API call fails, it will automatically fall back to IPFS.
  console.log("\n--- Example 1: API with IPFS Fallback ---");
  try {
    const clientId = process.env.ORBITPORT_CLIENT_ID;
    const clientSecret = process.env.ORBITPORT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.log(
        "Skipping API example: Set ORBITPORT_CLIENT_ID and ORBITPORT_CLIENT_SECRET to run this."
      );
    } else {
      const sdk = new OrbitportSDK({
        config: {
          clientId,
          clientSecret,
        },
        debug: DEBUG, // Enable for detailed logs
      });

      const result = await sdk.ctrng.random();
      console.log("✅ API Request Successful!", result.data);
    }
  } catch (error) {
    console.error(
      "❌ API Request Failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // --- Example 2: IPFS-Only Mode ---
  // If you do not provide credentials, the SDK will only use IPFS.
  console.log("\n--- Example 2: IPFS-Only Mode ---");
  try {
    const ipfsSdk = new OrbitportSDK({
      config: {}, // No credentials
      debug: DEBUG,
    });

    const result = await ipfsSdk.ctrng.random();
    console.log("✅ IPFS-Only Request Successful!", result.data);
  } catch (error) {
    console.error(
      "❌ IPFS-Only Request Failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // --- Example 3: Explicitly Requesting from IPFS ---
  // You can force an IPFS request even if credentials are provided.
  console.log("\n--- Example 3: Explicit IPFS Request ---");
  try {
    const sdkWithCreds = new OrbitportSDK({
      config: {
        clientId: process.env.ORBITPORT_CLIENT_ID || "dummy-id",
        clientSecret: process.env.ORBITPORT_CLIENT_SECRET || "dummy-secret",
      },
      debug: DEBUG,
    });

    // explicitly ask for 'ipfs' source.
    const result = await sdkWithCreds.ctrng.random({ src: "ipfs" });
    console.log("✅ Explicit IPFS Request Successful!", result.data);
  } catch (error) {
    console.error(
      "❌ Explicit IPFS Request Failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // --- Example 4: IPFS with Index Selection ---
  // You can select specific cTRNG values from the beacon array.
  console.log("\n--- Example 4: IPFS with Index Selection ---");
  try {
    const ipfsSdk = new OrbitportSDK({
      config: {}, // No credentials
      debug: DEBUG,
    });

    // Get different values from the cTRNG array
    const indices = [0, 1, 2];
    for (const index of indices) {
      try {
        const result = await ipfsSdk.ctrng.random({
          src: "ipfs",
          index,
        });
        console.log(`✅ IPFS Request with index ${index}:`, result.data.data);
      } catch (error) {
        console.log(`ℹ️  Index ${index} not available (array may be shorter)`);
      }
    }
  } catch (error) {
    console.error(
      "❌ IPFS Index Selection Failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // --- Example 5: IPFS with Block Traversal ---
  // You can traverse back through the beacon chain to get historical data.
  console.log("\n--- Example 5: IPFS with Block Traversal ---");
  try {
    const ipfsSdk = new OrbitportSDK({
      config: {}, // No credentials
      debug: DEBUG,
    });

    // Get latest block
    const latestResult = await ipfsSdk.ctrng.random({
      src: "ipfs",
      block: "INF", // Latest block
      index: 0,
    });
    console.log("✅ Latest block data:", latestResult.data.data);

    // Try to get from a specific block (may fail if block doesn't exist)
    try {
      const specificBlockResult = await ipfsSdk.ctrng.random({
        src: "ipfs",
        block: 2015,
        index: 0,
      });
      console.log("✅ Specific block data:", specificBlockResult.data.data);
    } catch (error) {
      console.log(
        "ℹ️  Specific block not available (expected if block doesn't exist)"
      );
    }
  } catch (error) {
    console.error(
      "❌ IPFS Block Traversal Failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // --- Example 6: IPFS with Custom Beacon Path ---
  // You can use a custom IPFS beacon path.
  console.log("\n--- Example 6: IPFS with Custom Beacon Path ---");
  try {
    const ipfsSdk = new OrbitportSDK({
      config: {}, // No credentials
      debug: DEBUG,
    });

    const customBeaconPath =
      "/ipns/k2k4r8pigrw8i34z63om8f015tt5igdq0c46xupq8spp1bogt35k5vhe";
    const result = await ipfsSdk.ctrng.random({
      src: "ipfs",
      beaconPath: customBeaconPath,
      index: 0,
    });
    console.log("✅ Custom beacon path data:", result.data.data);
  } catch (error) {
    console.error(
      "❌ Custom Beacon Path Failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

main().catch((error) => {
  console.error("An unexpected error occurred in the script:", error);
});
