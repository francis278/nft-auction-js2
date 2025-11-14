// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./Auction.sol"; // 导入可升级版本的 Auction

contract AuctionV2 is Auction {
    // 新增功能：支持拍卖取消
    function cancelAuction(uint256 auctionId) public {
        AuctionInfo storage auctionInfo = auctions[auctionId];

        require(msg.sender == auctionInfo.seller, "Only seller can cancel");
        require(!auctionInfo.ended, "Auction already ended");
        require(
            auctionInfo.highestBidder == address(0),
            "Cannot cancel with active bids"
        );

        auctionInfo.canceled = true;
        auctionInfo.ended = true;
        isTokenOnAuction[auctionInfo.tokenId] = false;

        // 退还 NFT 给卖家
        nftContract.safeTransferFrom(
            address(this),
            auctionInfo.seller,
            auctionInfo.tokenId
        );

        emit AuctionEnded(auctionId, address(0), 0);
    }
}
