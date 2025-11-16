// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

// 直接定义接口，避免导入问题
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

/**
 * @title MockV3Aggregator
 * @notice 模拟 Chainlink 价格预言机用于测试
 */
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 private _decimals;
    int256 private _answer;

    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    RoundData private _roundData;

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals = decimals_;
        _answer = initialAnswer;
        _roundData = RoundData({
            roundId: 1,
            answer: initialAnswer,
            startedAt: block.timestamp,
            updatedAt: block.timestamp,
            answeredInRound: 1
        });
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "Mock V3 Aggregator";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        require(_roundId > 0, "Round not found");
        return (
            _roundData.roundId,
            _roundData.answer,
            _roundData.startedAt,
            _roundData.updatedAt,
            _roundData.answeredInRound
        );
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            _roundData.roundId,
            _roundData.answer,
            _roundData.startedAt,
            _roundData.updatedAt,
            _roundData.answeredInRound
        );
    }

    // 测试专用：更新价格
    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _roundData.answer = newAnswer;
        _roundData.updatedAt = block.timestamp;
        _roundData.roundId++;
        _roundData.answeredInRound++;

        emit AnswerUpdated(newAnswer, _roundData.roundId, block.timestamp);
    }

    // 测试专用：获取当前价格
    function getAnswer() external view returns (int256) {
        return _answer;
    }
}
