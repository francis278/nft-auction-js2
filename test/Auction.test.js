const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NFT Auction Market", function () {
    let nft, auction;
    let owner, seller, bidder1, bidder2;

    beforeEach(async function () {
        [owner, seller, bidder1, bidder2] = await ethers.getSigners();

        // 部署 NFT 合约
        const MyNFT = await ethers.getContractFactory("MyNFT");
        nft = await MyNFT.deploy();

        // 部署可升级拍卖合约
        const Auction = await ethers.getContractFactory("Auction");
        auction = await upgrades.deployProxy(Auction, [await nft.getAddress()], {
            initializer: "initialize",
            kind: "uups"
        });

        // 铸造测试 NFT 并授权
        await nft.connect(seller).mint(seller.address);
        await nft.connect(seller).approve(await auction.getAddress(), 0);
    });

    describe("NFT 合约", function () {
        it("应该正确铸造 NFT", async function () {
            await nft.connect(owner).mint(owner.address);
            expect(await nft.ownerOf(1)).to.equal(owner.address);
        });

        it("应该支持 NFT 转移", async function () {
            await nft.connect(seller).transferFrom(seller.address, owner.address, 0);
            expect(await nft.ownerOf(0)).to.equal(owner.address);
        });
    });

    // describe("拍卖创建", function () {
    //     it("应该成功创建拍卖", async function () {
    //         await expect(
    //             auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600)
    //         )
    //             .to.emit(auction, "AuctionCreated")
    //             .withArgs(0, 0, seller.address, ethers.parseEther("0.1"), 3600);

    //         const auctionInfo = await auction.auctions(0);
    //         expect(auctionInfo.seller).to.equal(seller.address);
    //         expect(auctionInfo.startingPrice).to.equal(ethers.parseEther("0.1"));
    //     });

    //     it("应该防止非所有者创建拍卖", async function () {
    //         await expect(
    //             auction.connect(bidder1).createAuction(0, ethers.parseEther("0.1"), 3600)
    //         ).to.be.revertedWith("Not NFT owner");
    //     });

    //     it("应该防止重复拍卖", async function () {
    //         await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
    //         await expect(
    //             auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600)
    //         ).to.be.revertedWith("NFT already on auction");
    //     });
    // });

    // describe("ETH 出价", function () {
    //     beforeEach(async function () {
    //         await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
    //     });

    //     it("应该接受第一个 ETH 出价", async function () {
    //         await expect(
    //             auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.15") })
    //         )
    //             .to.emit(auction, "NewBid")
    //             .withArgs(0, bidder1.address, ethers.parseEther("0.15"));

    //         const auctionInfo = await auction.auctions(0);
    //         expect(auctionInfo.highestBidder).to.equal(bidder1.address);
    //         expect(auctionInfo.highestBid).to.equal(ethers.parseEther("0.15"));
    //     });

    //     it("应该拒绝低于起拍价的出价", async function () {
    //         await expect(
    //             auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.05") })
    //         ).to.be.revertedWith("Bid too low");
    //     });

    //     it("应该拒绝卖家的出价", async function () {
    //         await expect(
    //             auction.connect(seller).bidWithETH(0, { value: ethers.parseEther("0.15") })
    //         ).to.be.revertedWith("Seller cannot bid");
    //     });
    // });

    // describe("拍卖结束", function () {
    //     beforeEach(async function () {
    //         await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
    //         await auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.15") });
    //     });

    //     it("应该成功结束拍卖并转移资产", async function () {
    //         // 增加时间到拍卖结束
    //         await ethers.provider.send("evm_increaseTime", [3600]);
    //         await ethers.provider.send("evm_mine");

    //         await expect(auction.connect(seller).endAuction(0))
    //             .to.emit(auction, "AuctionEnded")
    //             .withArgs(0, bidder1.address, ethers.parseEther("0.15"));

    //         // 检查 NFT 转移
    //         expect(await nft.ownerOf(0)).to.equal(bidder1.address);
    //     });

    //     it("应该防止非卖家结束拍卖", async function () {
    //         await expect(
    //             auction.connect(bidder1).endAuction(0)
    //         ).to.be.revertedWith("Only seller can end auction");
    //     });
    // });

    // describe("Chainlink 价格预言机", function () {
    //     it("应该获取美元价值", async function () {
    //         // 这里可以模拟预言机返回值进行测试
    //         const usdValue = await auction.getUsdValue(ethers.ZeroAddress, ethers.parseEther("1"));
    //         expect(usdValue).to.be.a("bigint");
    //     });
    // });
});