const { ethers, upgrades } = require("hardhat");

async function main() {

  console.log("开始部署...");
  const [deployer] = await ethers.getSigners();
  console.log("部署者:", deployer.address);

  // 1. 部署NFT合约
  console.log("部署MyNFT...");
  const MyNFT = await ethers.getContractFactory("MyNFT");
  const myNFT = await MyNFT.deploy();
  await myNFT.waitForDeployment();
  const nftAddress = await myNFT.getAddress();
  console.log("MyNFT地址:", nftAddress);

  // 2. 部署可升级拍卖合约
  console.log("部署Auction...");
  const Auction = await ethers.getContractFactory("Auction");
  const auction = await upgrades.deployProxy(Auction, [nftAddress], {
    initializer: "initalize",
    kind: "uups"
  });
  await auction.waitForDeployment();
  const aucionAddress = await auction.getAddress();
  console.log("Auction地址:", auctionAddress);

  // 3. 铸造测试NFT
  console.log("铸造测试NFT...");
  const mintTx = await myNFT.mint(deployer.address);
  await mintTx.wait();

  // 4. 授权拍卖合约
  const approveTx = await myNFT.approve(auctionAddress, 0);
  await approveTx.wait();

  console.log("✅ 部署完成!");
  console.log("NFT地址:", nftAddress);
  console.log("拍卖合约:", auctionAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});