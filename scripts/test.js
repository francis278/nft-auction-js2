const { ethers } = require("hardhat");

async function main() {
    const [owner, bidder] = await ethers.getSigners();

    // 连接已部署的合约
    const myNFT = await ethers.getContractAt("MyNFT", "NFT_ADDRESS");
    const auction = await ethers.getContractAt("Auction", "AUCTION_ADDRESS");

    console.log("开始测试...");

    // 测试1: 创建拍卖
    console.log("创建拍卖...");
    const createTx = await auction.createAuction(0, ethers.parseEther("0.1"), 300); // 5分钟
    await createTx.wait();
    console.log("✅ 拍卖创建成功");

    // 测试2: 出价
    console.log("用户出价...");
    const bidTx = await auction.connect(bidder).bidWithETH(0, {
        value: ethers.parseEther("0.15")
    });
    await bidTx.wait();
    console.log("✅ 出价成功");

    // 测试3: 查询拍卖
    const auctionInfo = await auction.auctions(0);
    console.log("最高出价:", ethers.formatEther(auctionInfo.highestBid), "ETH");
    console.log("最高出价者:", auctionInfo.highestBidder);

    console.log("✅ 测试完成");
}

main();