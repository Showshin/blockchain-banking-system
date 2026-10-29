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

    /// @notice Interest promised to active deposits. It cannot be withdrawn by the admin.
    uint256 public reservedInterest;

    /// @notice The only SavingCore contract allowed to reserve, release and pay interest.
    address public core;

    event VaultFunded(address indexed funder, uint256 amount);
    event VaultWithdrawn(address indexed recipient, uint256 amount);
    event FeeReceiverUpdated(address indexed previousReceiver, address indexed newReceiver);
    event InterestReserved(uint256 amount, uint256 totalReserved);
    event InterestReleased(uint256 amount, uint256 totalReserved);
    event InterestPaid(address indexed recipient, uint256 amount);
    event CoreRoleLocked(address indexed core);

    constructor(address asset_, address admin_, address feeReceiver_) {
        require(asset_ != address(0), "Vault: zero asset");
        require(admin_ != address(0), "Vault: zero admin");
        require(feeReceiver_ != address(0), "Vault: zero fee receiver");

        asset = IERC20(asset_);
        feeReceiver = feeReceiver_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
    }

    /// @notice Grants CORE_ROLE to SavingCore once and freezes CORE_ROLE administration.
    /// @dev After this call, DEFAULT_ADMIN_ROLE can no longer grant or revoke CORE_ROLE.
    function setCoreOnce(address core_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(core == address(0), "Vault: core already set");
        require(
            core_ != address(0) && core_ != address(this) && core_.code.length > 0,
            "Vault: invalid core"
        );

        core = core_;
        _grantRole(CORE_ROLE, core_);
        _setRoleAdmin(CORE_ROLE, CORE_ROLE);
        emit CoreRoleLocked(core_);
    }

    function fundVault(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "Vault: zero amount");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    function withdrawVault(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(amount > 0, "Vault: zero amount");
        uint256 balance = asset.balanceOf(address(this));
        require(amount <= balance, "Vault: insufficient balance");
        require(reservedInterest <= balance, "Vault: undercollateralized");
        require(amount <= balance - reservedInterest, "Vault: reserved interest");
        asset.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    function setFeeReceiver(address nextReceiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(nextReceiver != address(0), "Vault: zero fee receiver");
        address previousReceiver = feeReceiver;
        feeReceiver = nextReceiver;
        emit FeeReceiverUpdated(previousReceiver, nextReceiver);
    }

    function reserveInterest(uint256 amount) external onlyRole(CORE_ROLE) whenNotPaused {
        require(amount > 0, "Vault: zero amount");
        uint256 nextReserved = reservedInterest + amount;
        require(
            nextReserved <= asset.balanceOf(address(this)),
            "Vault: reserve exceeds balance"
        );
        reservedInterest = nextReserved;
        emit InterestReserved(amount, nextReserved);
    }

    function releaseInterest(uint256 amount) external onlyRole(CORE_ROLE) {
        require(amount > 0, "Vault: zero amount");
        require(amount <= reservedInterest, "Vault: release exceeds reserved");
        reservedInterest -= amount;
        emit InterestReleased(amount, reservedInterest);
    }

    function payInterest(address to, uint256 amount) external onlyRole(CORE_ROLE) whenNotPaused {
        require(to != address(0), "Vault: zero recipient");
        require(amount > 0, "Vault: zero amount");
        require(amount <= reservedInterest, "Vault: interest not reserved");
        require(amount <= asset.balanceOf(address(this)), "Vault: insufficient interest");
        reservedInterest -= amount;
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
