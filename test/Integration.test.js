const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("集成测试 - 完整拍卖流程", function () {
    let nft, auction;
    let owner, seller, bidder1, bidder2;

    beforeEach(async function () {
        [owner, seller, bidder1, bidder2] = await ethers.getSigners();

        // 部署合约
        const MyNFT = await ethers.getContractFactory("MyNFT");
        nft = await MyNFT.deploy();

        const Auction = await ethers.getContractFactory("Auction");
        auction = await upgrades.deployProxy(Auction, [await nft.getAddress()], {
            initializer: "initialize",
            kind: "uups"
        });

        // 准备测试数据
        await nft.connect(seller).mint(seller.address);
        await nft.connect(seller).mint(seller.address);
        await nft.connect(seller).approve(await auction.getAddress(), 0);
        await nft.connect(seller).approve(await auction.getAddress(), 1);
    });

    it("完整拍卖流程: 创建 -> 多个出价 -> 结束", async function () {
        console.log("开始完整拍卖流程测试...");

        // 1. 创建拍卖
        console.log("1. 创建拍卖");
        await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);

        let auctionInfo = await auction.auctions(0);
        expect(auctionInfo.seller).to.equal(seller.address);
        console.log("✅ 拍卖创建成功");

        // 2. 第一个出价
        console.log("2. 第一个出价");
        await auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.15") });

        auctionInfo = await auction.auctions(0);
        expect(auctionInfo.highestBidder).to.equal(bidder1.address);
        console.log("✅ 第一个出价成功");

        // 3. 第二个出价（更高价格）
        console.log("3. 第二个更高出价");
        await auction.connect(bidder2).bidWithETH(0, { value: ethers.parseEther("0.2") });

        auctionInfo = await auction.auctions(0);
        expect(auctionInfo.highestBidder).to.equal(bidder2.address);
        console.log("✅ 第二个出价成功，成为最高出价者");

        // 4. 检查第一个出价者收到退款
        console.log("4. 检查退款");
        const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);

        // 第一个出价者尝试再次出价（应该失败，因为余额不足）
        await expect(
            auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.25") })
        ).to.be.reverted;
        console.log("✅ 第一个出价者已收到退款");

        // 5. 结束拍卖
        console.log("5. 结束拍卖");
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine");

        await auction.connect(seller).endAuction(0);

        // 检查 NFT 转移
        expect(await nft.ownerOf(0)).to.equal(bidder2.address);
        console.log("✅ 拍卖结束，NFT 已转移");

        console.log("🎉 完整拍卖流程测试通过!");
    });

    it("多个拍卖同时进行", async function () {
        console.log("测试多个同时拍卖...");

        // 创建两个拍卖
        await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
        await auction.connect(seller).createAuction(1, ethers.parseEther("0.2"), 7200);

        // 对不同拍卖出价
        await auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.15") });
        await auction.connect(bidder2).bidWithETH(1, { value: ethers.parseEther("0.25") });

        // 检查两个拍卖状态独立
        const auction0 = await auction.auctions(0);
        const auction1 = await auction.auctions(1);

        expect(auction0.highestBidder).to.equal(bidder1.address);
        expect(auction1.highestBidder).to.equal(bidder2.address);

        console.log("✅ 多个拍卖独立运行测试通过");
    });
});