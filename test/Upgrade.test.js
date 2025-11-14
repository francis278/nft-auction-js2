const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("合约升级测试", function () {
    let nft, auction, auctionV2;
    let owner, seller, bidder;

    beforeEach(async function () {
        [owner, seller, bidder] = await ethers.getSigners();

        // 部署 V1
        const MyNFT = await ethers.getContractFactory("MyNFT");
        nft = await MyNFT.deploy();

        const Auction = await ethers.getContractFactory("Auction");
        auction = await upgrades.deployProxy(Auction, [await nft.getAddress()], {
            initializer: "initialize",
            kind: "uups"
        });

        // 准备测试数据
        await nft.connect(seller).mint(seller.address);
        await nft.connect(seller).approve(await auction.getAddress(), 0);
        await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
    });

    it("应该成功升级到 V2", async function () {
        console.log("开始合约升级测试...");

        // 部署 V2
        const AuctionV2 = await ethers.getContractFactory("AuctionV2");
        auctionV2 = await upgrades.upgradeProxy(await auction.getAddress(), AuctionV2);

        console.log("✅ 合约升级成功");

        // 测试 V2 新功能
        await auctionV2.connect(seller).cancelAuction(0);

        const auctionInfo = await auctionV2.auctions(0);
        expect(auctionInfo.canceled).to.be.true;
        expect(await nft.ownerOf(0)).to.equal(seller.address);

        console.log("✅ V2 新功能正常工作");
    });

    it("升级后应该保持数据", async function () {
        // 在 V1 创建一些数据
        await nft.connect(seller).mint(seller.address);
        await nft.connect(seller).approve(await auction.getAddress(), 1);
        await auction.connect(seller).createAuction(1, ethers.parseEther("0.5"), 3600);

        // 升级到 V2
        const AuctionV2 = await ethers.getContractFactory("AuctionV2");
        auctionV2 = await upgrades.upgradeProxy(await auction.getAddress(), AuctionV2);

        // 检查数据是否保持
        const auction0 = await auctionV2.auctions(0);
        const auction1 = await auctionV2.auctions(1);

        expect(auction0.seller).to.equal(seller.address);
        expect(auction1.seller).to.equal(seller.address);
        expect(auction1.startingPrice).to.equal(ethers.parseEther("0.5"));

        console.log("✅ 升级后数据保持完整");
    });
});