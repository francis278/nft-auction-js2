// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// 手动定义 Chainlink 预言机接口
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract Auction is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    struct AuctionInfo {
        // 拍卖标识
        uint256 id; // 拍卖ID
        uint256 tokenId; // 被拍卖的NFT的tokenId
        // 参与方
        address seller; // 卖家
        address highestBidder; // 当前最高出价者
        // 价格相关
        uint256 startingPrice; // 起拍价
        uint256 highestBid; // 当前最高出价
        // 时间相关
        uint256 startTime; // 拍卖开始时间
        uint256 endTime; // 拍卖结束时间
        // 状态
        bool ended; // 拍卖是否结束
        // 扩展功能
        uint256 minBidIncrement; // 最小加价幅度
        address paymentToken; // 支付代币地址（ETH = address(0)）
        bool canceled; // 是否被取消
    }

    // 核心映射
    mapping(uint256 => AuctionInfo) public auctions;
    mapping(uint256 => bool) public isTokenOnAuction;
    mapping(uint256 => uint256) public tokenIdToAuctionId;

    // 扩展映射
    mapping(uint256 => address[]) public bidders;
    mapping(uint256 => mapping(address => uint256)) public bids;

    // Chainlink 价格预言机映射
    mapping(address => address) public priceFeeds;
    address public ethUsdPriceFeed;

    uint256 private nextAuctionId;
    IERC721 public nftContract;

    // constructor() {
    //     _disableInitializers();
    // }

    // 初始化函数（替代构造函数）
    function initialize(address _nftContract) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        nftContract = IERC721(_nftContract);
        ethUsdPriceFeed = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    }

    // UUPS升级授权
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // ========== 新增：设置代币价格预言机的函数 ==========
    function setPriceFeed(address token, address priceFeed) public {
        priceFeeds[token] = priceFeed;
    }

    function setEthPriceFeed(address priceFeed) public {
        ethUsdPriceFeed = priceFeed;
    }

    // 事件
    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 startingPrice,
        uint256 duration
    );

    event NewBid(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        address winner,
        uint256 finalPrice
    );

    // 提取的公共方法：退还前一个出价
    function _refundPreviousBid(
        address previousBidder,
        uint256 previousBid,
        address previousToken
    ) private {
        if (previousToken == address(0)) {
            // 前一个出价用ETH：退还ETH
            payable(previousBidder).transfer(previousBid);
        } else {
            // 前一个出价用ERC20：退还ERC20
            IERC20(previousToken).transfer(previousBidder, previousBid);
        }
    }

    // ========== 新增：获取代币美元价值的函数 ==========
    function getUsdValue(
        address token,
        uint256 amount
    ) public view returns (uint256) {
        address priceFeedAddress;

        // 确定使用哪个价格预言机
        if (token == address(0)) {
            // ETH 代币
            priceFeedAddress = ethUsdPriceFeed;
        } else {
            // ERC20 代币
            priceFeedAddress = priceFeeds[token];
        }

        // 检查价格预言机是否可用
        require(priceFeedAddress != address(0), "Price feed not available");

        // 获取 Chainlink 预言机数据
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            priceFeedAddress
        );
        (
            ,
            int256 price, // 当前价格（带小数位）
            ,
            ,

        ) = priceFeed.latestRoundData();

        // 检查价格是否有效
        require(price > 0, "Invalid price from oracle");

        // 获取价格的小数位数
        uint8 decimals = priceFeed.decimals();

        // 计算美元价值：金额 × 价格 / 10^小数位
        // 例如：0.1 ETH × 3500 USD/ETH = 350 USD
        uint256 usdValue = (amount * uint256(price)) /
            (10 ** uint256(decimals));

        return usdValue;
    }

    // 1. 创建拍卖
    function createAuction(
        uint256 tokenId,
        uint256 startingPrice,
        uint256 duration
    ) public {
        require(!isTokenOnAuction[tokenId], "NFT already on auction");
        require(startingPrice > 0, "Starting price must be greater than 0");
        require(duration >= 1 hours && duration <= 30 days, "Invalid duration");
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        nftContract.transferFrom(msg.sender, address(this), tokenId);

        uint256 auctionId = nextAuctionId++;

        AuctionInfo memory auctionInfo = AuctionInfo({
            id: auctionId,
            tokenId: tokenId,
            seller: msg.sender,
            highestBidder: address(0),
            startingPrice: startingPrice,
            highestBid: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            ended: false,
            minBidIncrement: 0.01 ether,
            paymentToken: address(0),
            canceled: false
        });

        auctions[auctionId] = auctionInfo;
        isTokenOnAuction[tokenId] = true;
        tokenIdToAuctionId[tokenId] = auctionId;

        emit AuctionCreated(
            auctionId,
            tokenId,
            msg.sender,
            startingPrice,
            duration
        );
    }

    // 2. 出价
    function bidWithETH(uint256 auctionId) public payable {
        AuctionInfo storage auctionInfo = auctions[auctionId];

        address previousBidder = auctionInfo.highestBidder;
        uint256 previousBid = auctionInfo.highestBid;
        address previousToken = auctionInfo.paymentToken;

        require(!auctionInfo.ended, "Auction already ended");
        require(block.timestamp < auctionInfo.endTime, "Auction expired");
        require(msg.sender != auctionInfo.seller, "Seller cannot bid");
        require(msg.value >= auctionInfo.startingPrice, "Bid too low");
        // ========== 新增：美元价值比较逻辑 ==========
        if (previousBidder != address(0)) {
            //     // 不是第一个出价：比较美元价值
            uint256 currentBidUsd = getUsdValue(previousToken, previousBid);
            uint256 newBidUsd = getUsdValue(address(0), msg.value);
            require(newBidUsd > currentBidUsd, "Bid USD value too low");
        }

        // 退还前一个出价者的支付
        if (previousBidder != address(0)) {
            // 使用公共方法退还前一个出价
            _refundPreviousBid(previousBidder, previousBid, previousToken);
        }

        auctionInfo.highestBidder = msg.sender;
        auctionInfo.highestBid = msg.value;
        auctionInfo.paymentToken = address(0);

        emit NewBid(auctionId, msg.sender, msg.value);
    }

    function bidWithERC20(
        uint256 auctionId,
        uint256 amount,
        address tokenAddress
    ) public {
        AuctionInfo storage auctionInfo = auctions[auctionId];

        address previousBidder = auctionInfo.highestBidder;
        uint256 previousBid = auctionInfo.highestBid;
        address previousToken = auctionInfo.paymentToken;

        require(!auctionInfo.ended, "Auction already ended");
        require(block.timestamp < auctionInfo.endTime, "Auction expired");
        require(msg.sender != auctionInfo.seller, "Seller cannot bid");
        require(amount >= auctionInfo.startingPrice, "Bid too low");
        require(tokenAddress != address(0), "Invalid token address");
        // ========== 新增：美元价值比较逻辑 ==========
        if (previousBidder != address(0)) {
            // 不是第一个出价：比较美元价值
            uint256 currentBidUsd = getUsdValue(previousToken, previousBid);
            uint256 newBidUsd = getUsdValue(tokenAddress, amount);
            require(newBidUsd > currentBidUsd, "Bid USD value too low");
        }

        // 转移 ERC20 代币到合约
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);

        if (previousBidder != address(0)) {
            // 使用公共方法退还前一个出价
            _refundPreviousBid(previousBidder, previousBid, previousToken);
        }

        auctionInfo.highestBidder = msg.sender;
        auctionInfo.highestBid = amount;
        auctionInfo.paymentToken = tokenAddress;

        emit NewBid(auctionId, msg.sender, amount);
    }

    // 3. 结束拍卖
    function endAuction(uint256 auctionId) public {
        AuctionInfo storage auctionInfo = auctions[auctionId];

        require(!auctionInfo.ended, "Auction already ended");
        require(
            block.timestamp >= auctionInfo.endTime,
            "Auction not yet ended"
        );
        require(
            msg.sender == auctionInfo.seller,
            "Only seller can end auction"
        );

        uint256 tokenId = auctionInfo.tokenId;
        address seller = auctionInfo.seller;
        uint256 highestBid = auctionInfo.highestBid;
        address paymentToken = auctionInfo.paymentToken;
        address highestBidder = auctionInfo.highestBidder;

        auctionInfo.ended = true;
        isTokenOnAuction[tokenId] = false;

        if (highestBidder != address(0)) {
            // 应该改为：
            if (paymentToken == address(0)) {
                payable(seller).transfer(highestBid);
            } else {
                IERC20(paymentToken).transfer(seller, highestBid);
            }
            nftContract.safeTransferFrom(address(this), highestBidder, tokenId);
        } else {
            nftContract.safeTransferFrom(address(this), seller, tokenId);
        }

        emit AuctionEnded(auctionId, highestBidder, highestBid);
    }

    // 辅助函数
    function setAuctionEnded(uint256 auctionId, bool ended) public {
        auctions[auctionId].ended = ended;
    }

    function setAuctionEndTime(uint256 auctionId) public {
        auctions[auctionId].endTime = block.timestamp;
    }
}
