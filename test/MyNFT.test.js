const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MyNFT", function () {
  async function deployMyNFTFixture() {
    const [owner, account1, account2] = await ethers.getSigners();
    const MyNFT = await ethers.getContractFactory("MyNFT");
    const myNFT = await MyNFT.deploy();
    return { myNFT, owner, account1, account2 };
  }

  describe("mint", function () {
    it("应该成功铸造NFT", async function () {
      const { myNFT, account1 } = await loadFixture(deployMyNFTFixture);
      // 等待交易确认并获取返回值
      const tx = await myNFT.mint(account1.address);
      const receipt = await tx.wait();
      // 从交易日志中解析tokenId，或者直接检查第一个token
      const tokenId = 0;
      expect(await myNFT.ownerOf(tokenId)).to.equal(account1.address);
    });

    it("tokenId应该自动递增", async function () {
      const { myNFT, account1, account2 } = await loadFixture(deployMyNFTFixture);

      // 铸造第一个NFT
      await myNFT.mint(account1.address);
      expect(await myNFT.ownerOf(0)).to.equal(account1.address);

      // 铸造第二个NFT
      await myNFT.mint(account2.address);
      expect(await myNFT.ownerOf(1)).to.equal(account2.address);
    });
  });

  describe("burn", function () {
    it("所有者可以销毁自己的token", async function () {
      const { myNFT, account1 } = await loadFixture(deployMyNFTFixture);
      await myNFT.mint(account1.address);
      await myNFT.connect(account1).burn(0);
      await expect(myNFT.ownerOf(0)).to.be.reverted;
    });

    it("非所有者不能销毁token", async function () {
      const { myNFT, account1, account2 } = await loadFixture(deployMyNFTFixture);
      await myNFT.mint(account1.address);
      await expect(myNFT.connect(account2).burn(0))
        .to.be.revertedWith("Not owner");
    });
  });
});