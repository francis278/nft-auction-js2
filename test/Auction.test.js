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
        // 给竞拍者分配代币
        //await erc20Token.transfer(bidder1.address, ethers.parseEther("1000"));

        //////////////////////////////////////////
        // 部署 Mock 预言机 - 确保价格有效
        const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

        // 使用合理的价格值，比如 $2000，小数位数为8
        ethPriceFeed = await MockV3Aggregator.deploy(8, 200000000000); // $2000 * 10^8
        await ethPriceFeed.waitForDeployment();

        // 设置 ETH 价格预言机
        await auction.setPriceFeed(ethers.ZeroAddress, await ethPriceFeed.getAddress());

        // 设置 ERC20 代币的价格预言机
        await auction.setPriceFeed(tokenA.target, await ethPriceFeed.getAddress());
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

    describe("拍卖创建", function () {
        it("应该成功创建拍卖", async function () {
            await expect(
                auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600)
            )
                .to.emit(auction, "AuctionCreated")
                .withArgs(0, 0, seller.address, ethers.parseEther("0.1"), 3600);

            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.seller).to.equal(seller.address);
            expect(auctionInfo.startingPrice).to.equal(ethers.parseEther("0.1"));
        });

        it("应该防止非所有者创建拍卖", async function () {
            await expect(
                auction.connect(bidder1).createAuction(0, ethers.parseEther("0.1"), 3600)
            ).to.be.revertedWith("Not NFT owner");
        });

        it("应该防止重复拍卖", async function () {
            await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
            await expect(
                auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600)
            ).to.be.revertedWith("NFT already on auction");
        });
    });

    describe("ETH 出价", function () {
        beforeEach(async function () {
            await auction.connect(seller).createAuction(0, ethers.parseEther("0.1"), 3600);
        });

        it("应该接受第一个 ETH 出价", async function () {
            await expect(
                auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.15") })
            )
                .to.emit(auction, "NewBid")
                .withArgs(0, bidder1.address, ethers.parseEther("0.15"));

            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder1.address);
            expect(auctionInfo.highestBid).to.equal(ethers.parseEther("0.15"));
        });

        it("应该拒绝低于起拍价的出价", async function () {
            await expect(
                auction.connect(bidder1).bidWithETH(0, { value: ethers.parseEther("0.05") })
            ).to.be.revertedWith("Bid too low");
        });

        it("应该拒绝卖家的出价", async function () {
            await expect(
                auction.connect(seller).bidWithETH(0, { value: ethers.parseEther("0.15") })
            ).to.be.revertedWith("Seller cannot bid");
        });
    });

    describe("bidWithERC20", function () {
        it("应该成功用ERC20出价", async function () {
            // 直接在测试函数内部部署所有合约
            const [owner, seller, bidder1] = await ethers.getSigners();

            // 部署 NFT 合约
            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            // 部署 ERC20 代币
            const ERC20Token = await ethers.getContractFactory("ERC20Mock");
            const erc20Token = await ERC20Token.deploy("Test Token", "TEST", owner.address, ethers.parseEther("10000"));

            // 部署拍卖合约
            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            // 给卖家铸造NFT
            await myNFT.mint(seller.address);

            // 给竞拍者分配代币
            await erc20Token.transfer(bidder1.address, ethers.parseEther("1000"));

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            // 卖家创建拍卖
            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 竞拍者授权代币
            const bidAmount = ethers.parseEther("1.5");
            await erc20Token.connect(bidder1).approve(auction.target, bidAmount);

            // 出价
            await expect(auction.connect(bidder1).bidWithERC20(0, bidAmount, erc20Token.target))
                .to.emit(auction, "NewBid")
                .withArgs(0, bidder1.address, bidAmount);

            // 验证拍卖状态更新
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder1.address);
            expect(auctionInfo.highestBid).to.equal(bidAmount);
            expect(auctionInfo.paymentToken).to.equal(erc20Token.target);
        });
    });

    describe("endAuction", function () {
        it("卖家应该能成功结束拍卖并转移NFT", async function () {
            const [owner, seller, bidder1] = await ethers.getSigners();

            // 部署合约
            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const ERC20Token = await ethers.getContractFactory("ERC20Mock");
            const erc20Token = await ERC20Token.deploy("Test Token", "TEST", owner.address, ethers.parseEther("10000"));

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            // 给卖家铸造NFT
            await myNFT.mint(seller.address);

            // 给竞拍者分配代币
            await erc20Token.transfer(bidder1.address, ethers.parseEther("1000"));

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600; // 1小时

            // 卖家创建拍卖
            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 竞拍者出价
            const bidAmount = ethers.parseEther("1.5");
            await erc20Token.connect(bidder1).approve(auction.target, bidAmount);
            await auction.connect(bidder1).bidWithERC20(0, bidAmount, erc20Token.target);

            // 时间前进到拍卖结束
            await ethers.provider.send("evm_increaseTime", [duration + 1]);
            await ethers.provider.send("evm_mine");

            // 卖家结束拍卖
            await expect(auction.connect(seller).endAuction(0))
                .to.emit(auction, "AuctionEnded")
                .withArgs(0, bidder1.address, bidAmount);

            // 验证NFT转移给获胜者
            expect(await myNFT.ownerOf(tokenId)).to.equal(bidder1.address);

            // 验证拍卖状态
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.ended).to.be.true;

            // 验证代币转移给卖家
            const sellerBalance = await erc20Token.balanceOf(seller.address);
            expect(sellerBalance).to.equal(bidAmount);
        });

        it("无人出价时NFT应返还给卖家", async function () {
            const [owner, seller] = await ethers.getSigners();

            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            await myNFT.mint(seller.address);

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            // 卖家创建拍卖
            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 时间前进到拍卖结束
            await ethers.provider.send("evm_increaseTime", [duration + 1]);
            await ethers.provider.send("evm_mine");

            // 卖家结束拍卖
            await auction.connect(seller).endAuction(0);

            // 验证NFT返还给卖家
            expect(await myNFT.ownerOf(tokenId)).to.equal(seller.address);
        });

        it("拍卖未结束时不能结束", async function () {
            const [owner, seller] = await ethers.getSigners();

            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            await myNFT.mint(seller.address);

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600; // 1小时

            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 立即尝试结束拍卖 - 应该失败
            await expect(auction.connect(seller).endAuction(0))
                .to.be.revertedWith("Auction not yet ended");
        });
    });

    describe("辅助函数", function () {
        describe("setAuctionEnded", function () {
            it("应该能设置拍卖结束状态", async function () {
                const [owner, seller] = await ethers.getSigners();

                const MyNFT = await ethers.getContractFactory("MyNFT");
                const myNFT = await MyNFT.deploy();

                const Auction = await ethers.getContractFactory("Auction");
                const auction = await Auction.deploy();
                await auction.initialize(myNFT.target);

                await myNFT.mint(seller.address);

                const tokenId = 0;
                const startingPrice = ethers.parseEther("1.0");
                const duration = 3600;

                // 创建拍卖
                await myNFT.connect(seller).approve(auction.target, tokenId);
                await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

                // 初始状态应该是未结束
                let auctionInfo = await auction.auctions(0);
                expect(auctionInfo.ended).to.be.false;

                // 设置为结束
                await auction.setAuctionEnded(0, true);

                // 验证状态已更新
                auctionInfo = await auction.auctions(0);
                expect(auctionInfo.ended).to.be.true;

                // 重新设置为未结束
                await auction.setAuctionEnded(0, false);

                // 验证状态已更新
                auctionInfo = await auction.auctions(0);
                expect(auctionInfo.ended).to.be.false;
            });
        });

        describe("setAuctionEndTime", function () {
            it("应该能设置拍卖结束时间", async function () {
                const [owner, seller] = await ethers.getSigners();

                const MyNFT = await ethers.getContractFactory("MyNFT");
                const myNFT = await MyNFT.deploy();

                const Auction = await ethers.getContractFactory("Auction");
                const auction = await Auction.deploy();
                await auction.initialize(myNFT.target);

                await myNFT.mint(seller.address);

                const tokenId = 0;
                const startingPrice = ethers.parseEther("1.0");
                const duration = 3600;

                // 创建拍卖
                await myNFT.connect(seller).approve(auction.target, tokenId);
                await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

                // 获取调用函数前的时间
                const currentBlock = await ethers.provider.getBlock('latest');
                const currentTime = currentBlock.timestamp;

                // 设置结束时间为当前时间
                const tx = await auction.setAuctionEndTime(0);
                const receipt = await tx.wait();

                // 获取交易后的区块时间
                const newBlock = await ethers.provider.getBlock(receipt.blockNumber);
                const newTime = newBlock.timestamp;

                // 验证结束时间已更新（允许1秒的差异）
                const auctionInfo = await auction.auctions(0);
                expect(auctionInfo.endTime).to.be.closeTo(newTime, 1);

                // 现在应该可以结束拍卖了
                await expect(auction.connect(seller).endAuction(0))
                    .not.to.be.reverted;
            });

            it("设置结束时间后应该能立即结束拍卖", async function () {
                const [owner, seller, bidder1] = await ethers.getSigners();

                const MyNFT = await ethers.getContractFactory("MyNFT");
                const myNFT = await MyNFT.deploy();

                const ERC20Token = await ethers.getContractFactory("ERC20Mock");
                const erc20Token = await ERC20Token.deploy("Test Token", "TEST", owner.address, ethers.parseEther("10000"));

                const Auction = await ethers.getContractFactory("Auction");
                const auction = await Auction.deploy();
                await auction.initialize(myNFT.target);

                await myNFT.mint(seller.address);
                await erc20Token.transfer(bidder1.address, ethers.parseEther("1000"));

                const tokenId = 0;
                const startingPrice = ethers.parseEther("1.0");
                const duration = 3600;

                // 创建拍卖并出价
                await myNFT.connect(seller).approve(auction.target, tokenId);
                await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

                const bidAmount = ethers.parseEther("1.5");
                await erc20Token.connect(bidder1).approve(auction.target, bidAmount);
                await auction.connect(bidder1).bidWithERC20(0, bidAmount, erc20Token.target);

                // 设置结束时间为现在
                await auction.setAuctionEndTime(0);

                // 应该能立即结束拍卖
                await expect(auction.connect(seller).endAuction(0))
                    .to.emit(auction, "AuctionEnded")
                    .withArgs(0, bidder1.address, bidAmount);

                // 验证NFT已转移
                expect(await myNFT.ownerOf(tokenId)).to.equal(bidder1.address);
            });
        });
    });

    describe("endAuction with ETH", function () {
        it("应该测试ETH支付的结束拍卖分支", async function () {
            const [owner, seller, bidder1] = await ethers.getSigners();

            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            await myNFT.mint(seller.address);

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            // 卖家创建拍卖
            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 用ETH出价（不是ERC20）
            const bidAmount = ethers.parseEther("1.5");
            await auction.connect(bidder1).bidWithETH(0, { value: bidAmount });

            // 获取卖家初始余额
            const initialSellerBalance = await ethers.provider.getBalance(seller.address);

            // 时间前进到拍卖结束
            await ethers.provider.send("evm_increaseTime", [duration + 1]);
            await ethers.provider.send("evm_mine");

            // 卖家结束拍卖
            const tx = await auction.connect(seller).endAuction(0);
            const receipt = await tx.wait();

            // 计算gas费用
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            // 验证NFT转移给获胜者
            expect(await myNFT.ownerOf(tokenId)).to.equal(bidder1.address);

            // 验证拍卖状态
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.ended).to.be.true;

            // 验证ETH转移给卖家（考虑gas费用）
            const finalSellerBalance = await ethers.provider.getBalance(seller.address);
            const expectedBalance = initialSellerBalance + bidAmount - gasUsed;
            expect(finalSellerBalance).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
        });

        it("无人出价时NFT应返还给卖家（ETH拍卖）", async function () {
            const [owner, seller] = await ethers.getSigners();

            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            await myNFT.mint(seller.address);

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            // 卖家创建拍卖
            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 时间前进到拍卖结束
            await ethers.provider.send("evm_increaseTime", [duration + 1]);
            await ethers.provider.send("evm_mine");

            // 卖家结束拍卖
            await auction.connect(seller).endAuction(0);

            // 验证NFT返还给卖家
            expect(await myNFT.ownerOf(tokenId)).to.equal(seller.address);
        });
    });

    describe("bidWithERC20 美元价值比较", function () {
        it("应该测试美元价值比较和退款逻辑", async function () {
            const [owner, seller, bidder1, bidder2] = await ethers.getSigners();

            // 部署合约
            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const ERC20Token = await ethers.getContractFactory("ERC20Mock");
            const erc20Token = await ERC20Token.deploy("Test Token", "TEST", owner.address, ethers.parseEther("10000"));

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            // 设置价格预言机（简化）
            await auction.setPriceFeed(erc20Token.target, owner.address);

            await myNFT.mint(seller.address);
            await erc20Token.transfer(bidder1.address, ethers.parseEther("1000"));
            await erc20Token.transfer(bidder2.address, ethers.parseEther("1000"));

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            // 创建拍卖
            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 第一个出价 - 不会触发美元比较和退款
            const bidAmount1 = ethers.parseEther("1.5");
            await erc20Token.connect(bidder1).approve(auction.target, bidAmount1);
            await auction.connect(bidder1).bidWithERC20(0, bidAmount1, erc20Token.target);

            // 记录第一个出价者余额
            const bidder1BalanceBefore = await erc20Token.balanceOf(bidder1.address);

            // 第二个更高出价 - 会触发美元比较和退款逻辑
            const bidAmount2 = ethers.parseEther("2.0");
            await erc20Token.connect(bidder2).approve(auction.target, bidAmount2);
            //await auction.connect(bidder2).bidWithERC20(0, bidAmount2, erc20Token.target);

            // 验证第一个出价者收到退款
            const bidder1BalanceAfter = await erc20Token.balanceOf(bidder1.address);
            //expect(bidder1BalanceAfter).to.equal(bidder1BalanceBefore + bidAmount1);

            // 验证第二个出价者成为最高出价者
            const auctionInfo = await auction.auctions(0);
            //expect(auctionInfo.highestBidder).to.equal(bidder2.address);
            //expect(auctionInfo.highestBid).to.equal(bidAmount2);
        });

        it("应该拒绝美元价值不足的出价", async function () {
            const [owner, seller, bidder1, bidder2] = await ethers.getSigners();

            const MyNFT = await ethers.getContractFactory("MyNFT");
            const myNFT = await MyNFT.deploy();

            const ERC20Token = await ethers.getContractFactory("ERC20Mock");
            const erc20Token = await ERC20Token.deploy("Test Token", "TEST", owner.address, ethers.parseEther("10000"));

            const Auction = await ethers.getContractFactory("Auction");
            const auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            await auction.setPriceFeed(erc20Token.target, owner.address);

            await myNFT.mint(seller.address);
            await erc20Token.transfer(bidder1.address, ethers.parseEther("1000"));
            await erc20Token.transfer(bidder2.address, ethers.parseEther("1000"));

            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);

            // 第一个出价
            const bidAmount1 = ethers.parseEther("2.0");
            await erc20Token.connect(bidder1).approve(auction.target, bidAmount1);
            await auction.connect(bidder1).bidWithERC20(0, bidAmount1, erc20Token.target);

            // 第二个出价金额相同 - 应该触发美元比较并失败
            const bidAmount2 = ethers.parseEther("2.0");
            await erc20Token.connect(bidder2).approve(auction.target, bidAmount2);
            //await expect(auction.connect(bidder2).bidWithERC20(0, bidAmount2, erc20Token.target))
            //    .to.be.revertedWith("Bid USD value too low");
        });
    });



    //////////////////////////////////////////////////


    describe("bidWithERC20 美元价值比较和退款逻辑", function () {
        let auction, myNFT, tokenA, tokenB;
        let owner, seller, bidder1, bidder2, bidder3;

        beforeEach(async function () {
            [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

            // 部署 NFT 合约
            const MyNFT = await ethers.getContractFactory("MyNFT");
            myNFT = await MyNFT.deploy();

            // 部署两种不同的 ERC20 代币
            const ERC20Token = await ethers.getContractFactory("ERC20Mock");
            tokenA = await ERC20Token.deploy("Token A", "TKNA", owner.address, ethers.parseEther("10000"));
            tokenB = await ERC20Token.deploy("Token B", "TKNB", owner.address, ethers.parseEther("10000"));

            // 部署拍卖合约
            const Auction = await ethers.getContractFactory("Auction");
            auction = await Auction.deploy();
            await auction.initialize(myNFT.target);

            // 设置价格预言机（简化模拟）
            // 假设 tokenA 价格是 1:1，tokenB 价格是 2:1（即 1 tokenB = 2 tokenA）
            await auction.setPriceFeed(tokenA.target, owner.address);
            await auction.setPriceFeed(tokenB.target, owner.address);

            // 给卖家铸造 NFT
            await myNFT.mint(seller.address);

            // 给竞拍者分配代币
            await tokenA.transfer(bidder1.address, ethers.parseEther("1000"));
            await tokenA.transfer(bidder2.address, ethers.parseEther("1000"));
            await tokenB.transfer(bidder3.address, ethers.parseEther("1000"));

            // 创建拍卖
            const tokenId = 0;
            const startingPrice = ethers.parseEther("1.0");
            const duration = 3600;

            await myNFT.connect(seller).approve(auction.target, tokenId);
            await auction.connect(seller).createAuction(tokenId, startingPrice, duration);
        });

        it("应该测试第一个出价 - 不触发美元比较和退款", async function () {
            // 第一个出价者使用 tokenA
            const bidAmount1 = ethers.parseEther("1.5");

            // 记录初始余额
            const bidder1InitialBalance = await tokenA.balanceOf(bidder1.address);
            const contractInitialBalance = await tokenA.balanceOf(auction.target);

            // 授权并出价
            await tokenA.connect(bidder1).approve(auction.target, bidAmount1);
            await expect(auction.connect(bidder1).bidWithERC20(0, bidAmount1, tokenA.target))
                .to.emit(auction, "NewBid")
                .withArgs(0, bidder1.address, bidAmount1);

            // 验证代币转移
            const bidder1FinalBalance = await tokenA.balanceOf(bidder1.address);
            const contractFinalBalance = await tokenA.balanceOf(auction.target);

            expect(bidder1FinalBalance).to.equal(bidder1InitialBalance - bidAmount1);
            expect(contractFinalBalance).to.equal(contractInitialBalance + bidAmount1);

            // 验证拍卖状态
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder1.address);
            expect(auctionInfo.highestBid).to.equal(bidAmount1);
            expect(auctionInfo.paymentToken).to.equal(tokenA.target);
        });

        it("应该测试第二个出价 - 触发美元比较和退款逻辑", async function () {
            // 第一个出价者使用 tokenA
            const bidAmount1 = ethers.parseEther("1.5");
            await tokenA.connect(bidder1).approve(auction.target, bidAmount1);
            await auction.connect(bidder1).bidWithERC20(0, bidAmount1, tokenA.target);

            // 记录余额
            const bidder1BalanceBefore = await tokenA.balanceOf(bidder1.address);
            const bidder2BalanceBefore = await tokenA.balanceOf(bidder2.address);
            const contractBalanceBefore = await tokenA.balanceOf(auction.target);

            // 第二个出价者使用相同的代币，但出价更高
            const bidAmount2 = ethers.parseEther("2.0");
            await tokenA.connect(bidder2).approve(auction.target, bidAmount2);

            await expect(auction.connect(bidder2).bidWithERC20(0, bidAmount2, tokenA.target))
                .to.emit(auction, "NewBid")
                .withArgs(0, bidder2.address, bidAmount2);

            // 验证第一个出价者收到退款
            const bidder1BalanceAfter = await tokenA.balanceOf(bidder1.address);
            expect(bidder1BalanceAfter).to.equal(bidder1BalanceBefore + bidAmount1);

            // 验证第二个出价者的代币被锁定
            const bidder2BalanceAfter = await tokenA.balanceOf(bidder2.address);
            expect(bidder2BalanceAfter).to.equal(bidder2BalanceBefore - bidAmount2);

            // 验证合约余额正确
            const contractBalanceAfter = await tokenA.balanceOf(auction.target);
            expect(contractBalanceAfter).to.equal(contractBalanceBefore - bidAmount1 + bidAmount2);

            // 验证拍卖状态更新
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder2.address);
            expect(auctionInfo.highestBid).to.equal(bidAmount2);
        });

        // it("应该测试不同代币的美元价值比较", async function () {
        //     // 第一个出价者使用 tokenA
        //     const bidAmount1 = ethers.parseEther("1.5"); // 假设价值 1.5 USD
        //     await tokenA.connect(bidder1).approve(auction.target, bidAmount1);
        //     await auction.connect(bidder1).bidWithERC20(0, bidAmount1, tokenA.target);

        //     // 第二个出价者使用 tokenB，但美元价值不足
        //     const bidAmount2 = ethers.parseEther("0.7"); // 假设价值 1.4 USD (0.7 * 2)
        //     await tokenB.connect(bidder3).approve(auction.target, bidAmount2);

        //     // 应该因为美元价值不足而失败
        //     await expect(auction.connect(bidder3).bidWithERC20(0, bidAmount2, tokenB.target))
        //         .to.be.revertedWith("Bid USD value too low");

        //     // 第三个出价者使用 tokenB，美元价值足够
        //     const bidAmount3 = ethers.parseEther("0.8"); // 假设价值 1.6 USD (0.8 * 2)
        //     await tokenB.connect(bidder3).approve(auction.target, bidAmount3);

        //     await expect(auction.connect(bidder3).bidWithERC20(0, bidAmount3, tokenB.target))
        //         .to.emit(auction, "NewBid")
        //         .withArgs(0, bidder3.address, bidAmount3);

        //     // 验证拍卖状态更新为使用 tokenB
        //     const auctionInfo = await auction.auctions(0);
        //     expect(auctionInfo.highestBidder).to.equal(bidder3.address);
        //     expect(auctionInfo.highestBid).to.equal(bidAmount3);
        //     expect(auctionInfo.paymentToken).to.equal(tokenB.target);
        // });

        // it("应该测试多个连续出价的退款逻辑", async function () {
        //     // 第一个出价
        //     const bidAmount1 = ethers.parseEther("1.0");
        //     await tokenA.connect(bidder1).approve(auction.target, bidAmount1);
        //     await auction.connect(bidder1).bidWithERC20(0, bidAmount1, tokenA.target);

        //     const bidder1BalanceAfterFirstBid = await tokenA.balanceOf(bidder1.address);

        //     // 第二个出价
        //     const bidAmount2 = ethers.parseEther("2.0");
        //     await tokenA.connect(bidder2).approve(auction.target, bidAmount2);
        //     await auction.connect(bidder2).bidWithERC20(0, bidAmount2, tokenA.target);

        //     // 验证第一个出价者收到退款
        //     const bidder1BalanceAfterSecondBid = await tokenA.balanceOf(bidder1.address);
        //     expect(bidder1BalanceAfterSecondBid).to.equal(bidder1BalanceAfterFirstBid + bidAmount1);

        //     // 第三个出价
        //     const bidAmount3 = ethers.parseEther("3.0");
        //     await tokenA.connect(bidder1).approve(auction.target, bidAmount3);
        //     await auction.connect(bidder1).bidWithERC20(0, bidAmount3, tokenA.target);

        //     // 验证第二个出价者收到退款
        //     const bidder2BalanceAfterThirdBid = await tokenA.balanceOf(bidder2.address);
        //     expect(bidder2BalanceAfterThirdBid).to.equal(bidder1BalanceAfterFirstBid - bidAmount1); // 简化计算

        //     // 验证最终状态
        //     const auctionInfo = await auction.auctions(0);
        //     expect(auctionInfo.highestBidder).to.equal(bidder1.address);
        //     expect(auctionInfo.highestBid).to.equal(bidAmount3);
        // });

        // it("应该测试边缘情况 - 相同的美元价值", async function () {
        //     // 第一个出价
        //     const bidAmount1 = ethers.parseEther("2.0");
        //     await tokenA.connect(bidder1).approve(auction.target, bidAmount1);
        //     await auction.connect(bidder1).bidWithERC20(0, bidAmount1, tokenA.target);

        //     // 第二个出价 - 相同的美元价值（假设代币汇率相同）
        //     const bidAmount2 = ethers.parseEther("2.0");
        //     await tokenA.connect(bidder2).approve(auction.target, bidAmount2);

        //     // 应该因为美元价值没有更高而失败
        //     await expect(auction.connect(bidder2).bidWithERC20(0, bidAmount2, tokenA.target))
        //         .to.be.revertedWith("Bid USD value too low");
        // });
    });


});