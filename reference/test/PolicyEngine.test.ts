import { expect } from "chai";
import hre from "hardhat";

describe("PolicyEngine", function () {
  let policyEngine: any;
  let owner: any;

  beforeEach(async function () {
    [owner] = await hre.ethers.getSigners();

    const factory = await hre.ethers.getContractFactory("PolicyEngine");
    policyEngine = await factory.deploy();
    await policyEngine.waitForDeployment();
  });

  describe("setCategoryLimit", function () {
    it("should set a category limit for the caller", async function () {
      await policyEngine.setCategoryLimit("compute", hre.ethers.parseEther("1"));
      const limit = await policyEngine.categoryLimits(owner.address, "compute");
      expect(limit).to.equal(hre.ethers.parseEther("1"));
    });

    it("should allow updating an existing limit", async function () {
      await policyEngine.setCategoryLimit("compute", hre.ethers.parseEther("1"));
      await policyEngine.setCategoryLimit("compute", hre.ethers.parseEther("2"));
      const limit = await policyEngine.categoryLimits(owner.address, "compute");
      expect(limit).to.equal(hre.ethers.parseEther("2"));
    });

    it("should emit CategoryLimitSet event", async function () {
      await expect(policyEngine.setCategoryLimit("data", hre.ethers.parseEther("0.5")))
        .to.emit(policyEngine, "CategoryLimitSet")
        .withArgs(owner.address, "data", hre.ethers.parseEther("0.5"));
    });
  });

  describe("validateSpend", function () {
    it("should return valid for spend within limit", async function () {
      await policyEngine.setCategoryLimit("compute", hre.ethers.parseEther("1"));
      const [valid, reason] = await policyEngine.validateSpend(
        owner.address,
        "compute",
        hre.ethers.parseEther("0.5"),
        hre.ethers.ZeroHash
      );
      expect(valid).to.be.true;
      expect(reason).to.equal("");
    });

    it("should return invalid for spend exceeding limit", async function () {
      await policyEngine.setCategoryLimit("compute", hre.ethers.parseEther("1"));
      const [valid, reason] = await policyEngine.validateSpend(
        owner.address,
        "compute",
        hre.ethers.parseEther("2"),
        hre.ethers.ZeroHash
      );
      expect(valid).to.be.false;
      expect(reason).to.include("exceeds");
    });

    it("should return invalid for unconfigured category", async function () {
      const [valid, reason] = await policyEngine.validateSpend(
        owner.address,
        "unknown_category",
        hre.ethers.parseEther("0.1"),
        hre.ethers.ZeroHash
      );
      expect(valid).to.be.false;
      expect(reason).to.include("not configured");
    });
  });

  describe("setPolicy", function () {
    it("should store policy hash and data", async function () {
      const policyData = hre.ethers.toUtf8Bytes('{"compute":"1000000000000000000"}');
      const policyHash = hre.ethers.keccak256(policyData);
      await policyEngine.setPolicy(policyHash, policyData);
      const [storedHash] = await policyEngine.getPolicy(owner.address);
      expect(storedHash).to.equal(policyHash);
    });
  });
});
