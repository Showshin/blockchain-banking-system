// SPDX-License-Identifier: MIT
pragma solidity ^0.8.38;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVaultManager} from "./interfaces/IVaultManager.sol";

/// @title Interest vault and emergency control for the term-deposit system.
/// @notice Principal stays in SavingCore. This contract only holds bank-funded interest.
contract VaultManager is AccessControl, Pausable, IVaultManager {
    using SafeERC20 for IERC20;

    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable asset;
    address public feeReceiver;

    event VaultFunded(address indexed funder, uint256 amount);
    event VaultWithdrawn(address indexed recipient, uint256 amount);
    event FeeReceiverUpdated(address indexed previousReceiver, address indexed newReceiver);
    event InterestPaid(address indexed recipient, uint256 amount);

    constructor(address asset_, address admin_, address feeReceiver_) {
        require(asset_ != address(0), "Vault: zero asset");
        require(admin_ != address(0), "Vault: zero admin");
        require(feeReceiver_ != address(0), "Vault: zero fee receiver");

        asset = IERC20(asset_);
        feeReceiver = feeReceiver_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
    }

    function fundVault(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "Vault: zero amount");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    function withdrawVault(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(amount > 0, "Vault: zero amount");
        require(amount <= asset.balanceOf(address(this)), "Vault: insufficient balance");
        asset.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    function setFeeReceiver(address nextReceiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(nextReceiver != address(0), "Vault: zero fee receiver");
        address previousReceiver = feeReceiver;
        feeReceiver = nextReceiver;
        emit FeeReceiverUpdated(previousReceiver, nextReceiver);
    }

    function payInterest(address to, uint256 amount) external onlyRole(CORE_ROLE) whenNotPaused {
        require(to != address(0), "Vault: zero recipient");
        require(amount > 0, "Vault: zero amount");
        require(amount <= asset.balanceOf(address(this)), "Vault: insufficient interest");
        asset.safeTransfer(to, amount);
        emit InterestPaid(to, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function paused() public view override(Pausable, IVaultManager) returns (bool) {
        return super.paused();
    }
}
