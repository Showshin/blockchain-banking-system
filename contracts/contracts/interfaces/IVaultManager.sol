// SPDX-License-Identifier: MIT
pragma solidity ^0.8.38;

interface IVaultManager {
    function feeReceiver() external view returns (address);

    function paused() external view returns (bool);

    function reservedInterest() external view returns (uint256);

    function reserveInterest(uint256 amount) external;

    function releaseInterest(uint256 amount) external;

    function payInterest(address to, uint256 amount) external;
}
