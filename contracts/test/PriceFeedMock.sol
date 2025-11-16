// 先创建一个真正的价格预言机Mock合约
// contracts/PriceFeedMock.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract PriceFeedMock {
    uint8 public decimals = 8;
    int256 public price;

    constructor(int256 _price) {
        price = _price;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, price, 0, 0, 0);
    }

    function setPrice(int256 _price) external {
        price = _price;
    }
}
