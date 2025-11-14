const { upgrades } = require("hardhat");

async function main() {
    console.log("开始升级...");

    const AuctionV2 = await ethers.getContractFactory("AuctionV2");
    const auction = await upgrades.upgradeProxy("AUCTION_ADDRESS", AuctionV2);

    console.log("✅ 合约升级完成");
    console.log("新地址:", await auction.getAddress());
}

main();