const { expect } = require("chai");
const { ethers } = require("hardhat");

describe.skip("MyNFT", function () {
  it("Should deploy and mint an NFT", async function () {
    const [owner, addr1] = await ethers.getSigners();
    
    // 部署合约
    const MyNFT = await ethers.getContractFactory("MyNFT");
    const myNFT = await MyNFT.deploy();
    
    // 铸造 NFT
    await myNFT.mint(addr1.address, "https://example.com/token1.json");
    
    // 验证所有权
    expect(await myNFT.ownerOf(0)).to.equal(addr1.address);
  });
});