/**
 * Unit tests for CTRNGService
 */

import { CTRNGService } from "../../src/services/ctrng";
import { BeaconService } from "../../src/services/beacon";
import { OrbitportConfig, IPFSCTRNGRequest } from "../../src/types";

// Mock BeaconService
jest.mock("../../src/services/beacon");

// No need to mock ipfs-http-client since we're using direct HTTP calls

// Mock fetch
global.fetch = jest.fn();

const mockGetToken = jest.fn();
const mockConfig: OrbitportConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  apiUrl: "https://test-api.com",
  timeout: 30000,
  ipfs: {
    defaultBeaconPath: "/ipns/default-beacon",
  },
};

const mockIpfsOnlyConfig: OrbitportConfig = {
  apiUrl: "https://test-api.com",
  timeout: 30000,
  ipfs: {
    defaultBeaconPath: "/ipns/default-beacon",
  },
};

describe("CTRNGService", () => {
  let ctrngService: CTRNGService;
  let beaconService: BeaconService;

  beforeEach(() => {
    jest.clearAllMocks();
    beaconService = new BeaconService(mockConfig.ipfs || {});
    ctrngService = new CTRNGService(
      mockConfig,
      mockGetToken,
      beaconService,
      true
    );
  });

  describe("random", () => {
    it("should call API when credentials are provided", async () => {
      const mockToken = "test-token";
      const mockResponse = {
        service: "trng",
        src: "aptosorbital",
        data: "test-random-data",
      };

      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Map(),
      });

      await ctrngService.random();
      expect(global.fetch).toHaveBeenCalledWith(
        "https://test-api.com/api/v1/services/trng?src=trng",
        expect.any(Object)
      );
      expect(beaconService.getBeacon).not.toHaveBeenCalled();
    });

    it("should fall back to IPFS if API fails", async () => {
      const mockToken = "test-token";
      mockGetToken.mockResolvedValue(mockToken);
      (global.fetch as jest.Mock).mockRejectedValue(new Error("API failed"));

      const mockBeaconResponse = {
        data: { ctrng: [123] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await ctrngService.random();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(beaconService.getBeaconWithBlockTraversal).toHaveBeenCalledWith(
        {
          path: mockConfig.ipfs!.defaultBeaconPath,
          sources: ["both"],
          enableComparison: true,
          timeout: mockConfig.timeout,
          block: "INF",
        },
        expect.any(Object)
      );
    });

    it("should call IPFS directly if no credentials are provided", async () => {
      ctrngService = new CTRNGService(
        mockIpfsOnlyConfig,
        mockGetToken,
        beaconService,
        true
      );
      const mockBeaconResponse = {
        data: { ctrng: [123] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await ctrngService.random();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(beaconService.getBeaconWithBlockTraversal).toHaveBeenCalledTimes(
        1
      );
    });

    it("should call IPFS directly if src is 'ipfs'", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [123] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await ctrngService.random({ src: "ipfs" });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(beaconService.getBeaconWithBlockTraversal).toHaveBeenCalledWith(
        {
          path: mockConfig.ipfs!.defaultBeaconPath,
          sources: ["both"],
          enableComparison: true,
          timeout: mockConfig.timeout,
          block: "INF",
        },
        expect.any(Object)
      );
    });

    it("should use custom beacon path if provided", async () => {
      const customPath = "/ipns/custom-path";
      const mockBeaconResponse = {
        data: { ctrng: [123] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await ctrngService.random({ src: "ipfs", beaconPath: customPath });
      expect(beaconService.getBeaconWithBlockTraversal).toHaveBeenCalledWith(
        {
          path: customPath,
          sources: ["both"],
          enableComparison: true,
          timeout: mockConfig.timeout,
          block: "INF",
        },
        expect.any(Object)
      );
    });

    it("should use block traversal when block is specified", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [123, 456, 789] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await ctrngService.random({
        src: "ipfs",
        block: 10012,
        index: 1,
      } as IPFSCTRNGRequest);

      expect(beaconService.getBeaconWithBlockTraversal).toHaveBeenCalledWith(
        {
          path: mockConfig.ipfs!.defaultBeaconPath,
          sources: ["both"],
          enableComparison: true,
          timeout: mockConfig.timeout,
          block: 10012,
        },
        expect.any(Object)
      );
    });

    it("should use latest block when block is INF", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [123, 456, 789] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await ctrngService.random({
        src: "ipfs",
        block: "INF",
        index: 2,
      } as IPFSCTRNGRequest);

      expect(beaconService.getBeaconWithBlockTraversal).toHaveBeenCalledWith(
        {
          path: mockConfig.ipfs!.defaultBeaconPath,
          sources: ["both"],
          enableComparison: true,
          timeout: mockConfig.timeout,
          block: "INF",
        },
        expect.any(Object)
      );
    });

    it("should select correct index from cTRNG array", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [100, 200, 300, 400] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      const result = await ctrngService.random({
        src: "ipfs",
        index: 2,
      } as IPFSCTRNGRequest);

      expect(result.data.data).toBe("300");
    });

    it("should handle out-of-bounds index with modulo", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [100, 200, 300] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      // Request index 5, but array has 3 elements, so 5 % 3 = 2
      const result = await ctrngService.random({
        src: "ipfs",
        index: 5,
      } as IPFSCTRNGRequest);

      expect(result.data.data).toBe("300"); // Should get index 2 (5 % 3 = 2)
    });

    it("should use index 0 as default when not specified", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [100, 200, 300] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      const result = await ctrngService.random({
        src: "ipfs",
      } as IPFSCTRNGRequest);

      expect(result.data.data).toBe("100"); // Should get first element (index 0)
    });

    it("should handle comparison result format", async () => {
      const mockComparisonResponse = {
        data: {
          gateway: { ctrng: [100, 200, 300] },
          api: { ctrng: [100, 200, 300] },
          match: true,
        },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockComparisonResponse);

      const result = await ctrngService.random({
        src: "ipfs",
        index: 1,
      } as IPFSCTRNGRequest);

      expect(result.data.data).toBe("200");
    });

    it("should throw error for non-IPFS request with IPFS parameters", async () => {
      await expect(
        ctrngService.random({
          src: "trng",
          block: 10012,
        } as any)
      ).rejects.toThrow(
        "IPFS-specific parameters (beaconPath, index, block) can only be used with src: 'ipfs'"
      );
    });

    it("should throw error when no beacon data is found", async () => {
      const mockBeaconResponse = {
        data: { ctrng: [] },
        metadata: {},
        success: true,
      };
      (
        beaconService.getBeaconWithBlockTraversal as jest.Mock
      ).mockResolvedValue(mockBeaconResponse);

      await expect(
        ctrngService.random({ src: "ipfs" } as IPFSCTRNGRequest)
      ).rejects.toThrow("No cTRNG values found in beacon data");
    });
  });
});
