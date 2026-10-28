// SPDX-License-Identifier: MIT
pragma solidity ^0.8.38;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVaultManager} from "./interfaces/IVaultManager.sol";

/// @title Plans, deposit certificates, withdrawals and renewals.
/// @notice Principal is held here. Maturity interest is paid by VaultManager.
contract SavingCore is ERC721, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PLAN_MANAGER_ROLE = keccak256("PLAN_MANAGER_ROLE");

    uint16 private constant MAX_BPS = 10_000;
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    enum DepositStatus {
        None,
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed
    }

    struct SavingPlan {
        uint32 tenorDays;
        uint16 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit;
        uint16 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    struct Deposit {
        uint256 planId;
        uint256 principal;
        uint16 aprBpsAtOpen;
        uint16 penaltyBpsAtOpen;
        uint32 tenorDays;
        uint64 openedAt;
        uint64 maturityAt;
        DepositStatus status;
    }

    IERC20 public immutable asset;
    IVaultManager public immutable vault;
    uint256 public immutable gracePeriod;

    mapping(uint256 planId => SavingPlan) public plans;
    mapping(uint256 depositId => Deposit) public deposits;
    uint256 public nextPlanId = 1;
    uint256 public nextDepositId = 1;

    event PlanCreated(uint256 indexed planId, uint32 tenorDays, uint16 aprBps);
    event PlanUpdated(uint256 indexed planId, uint16 newAprBps);
    event PlanStatusChanged(uint256 indexed planId, bool enabled);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 maturityAt,
        uint16 aprBpsAtOpen
    );
    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool isEarly
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal,
        uint256 indexed newPlanId
    );

    constructor(address asset_, address vault_, uint256 gracePeriod_) ERC721("TICH Deposit Certificate", "TICHDEP") {
        require(asset_ != address(0), "Core: zero asset");
        require(vault_ != address(0), "Core: zero vault");
        require(gracePeriod_ > 0, "Core: zero grace period");

        asset = IERC20(asset_);
        vault = IVaultManager(vault_);
        gracePeriod = gracePeriod_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PLAN_MANAGER_ROLE, msg.sender);
    }

    function createPlan(
        uint32 tenorDays,
        uint16 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint16 earlyWithdrawPenaltyBps
    ) external onlyRole(PLAN_MANAGER_ROLE) returns (uint256 planId) {
        require(tenorDays > 0, "Core: invalid tenor");
        require(aprBps > 0 && aprBps <= MAX_BPS, "Core: invalid APR");
        require(earlyWithdrawPenaltyBps <= MAX_BPS, "Core: invalid penalty");
        require(maxDeposit == 0 || minDeposit <= maxDeposit, "Core: invalid limits");

        planId = nextPlanId++;
        plans[planId] = SavingPlan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });

        emit PlanCreated(planId, tenorDays, aprBps);
    }

    function updatePlan(uint256 planId, uint16 newAprBps) external onlyRole(PLAN_MANAGER_ROLE) {
        require(plans[planId].tenorDays > 0, "Core: unknown plan");
        require(newAprBps > 0 && newAprBps <= MAX_BPS, "Core: invalid APR");
        plans[planId].aprBps = newAprBps;
        emit PlanUpdated(planId, newAprBps);
    }

    function setPlanEnabled(uint256 planId, bool enabled) external onlyRole(PLAN_MANAGER_ROLE) {
        require(plans[planId].tenorDays > 0, "Core: unknown plan");
        plans[planId].enabled = enabled;
        emit PlanStatusChanged(planId, enabled);
    }

    function openDeposit(uint256 planId, uint256 amount) external nonReentrant returns (uint256 depositId) {
        require(!vault.paused(), "Core: system paused");
        SavingPlan storage plan = plans[planId];
        require(plan.tenorDays > 0 && plan.enabled, "Core: plan unavailable");
        require(amount > 0, "Core: invalid amount");
        require(amount >= plan.minDeposit, "Core: below minimum");
        require(plan.maxDeposit == 0 || amount <= plan.maxDeposit, "Core: above maximum");

        asset.safeTransferFrom(msg.sender, address(this), amount);
        depositId = _createDeposit(
            msg.sender,
            planId,
            amount,
            plan.aprBps,
            plan.earlyWithdrawPenaltyBps,
            plan.tenorDays
        );
    }

    function withdrawAtMaturity(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        _requireActiveOwner(depositId, deposit);
        require(block.timestamp >= deposit.maturityAt, "Core: not matured");
        require(!vault.paused(), "Core: system paused");

        uint256 interest = _interestFor(deposit);
        deposit.status = DepositStatus.Withdrawn;

        if (interest > 0) {
            vault.payInterest(msg.sender, interest);
        }
        asset.safeTransfer(msg.sender, deposit.principal);

        emit Withdrawn(depositId, msg.sender, deposit.principal, interest, false);
    }

    function earlyWithdraw(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        _requireActiveOwner(depositId, deposit);
        require(block.timestamp < deposit.maturityAt, "Core: already matured");
        require(!vault.paused(), "Core: system paused");

        uint256 penalty = _penaltyFor(deposit);
        uint256 payout = deposit.principal - penalty;
        deposit.status = DepositStatus.Withdrawn;

        if (penalty > 0) {
            asset.safeTransfer(vault.feeReceiver(), penalty);
        }
        if (payout > 0) {
            asset.safeTransfer(msg.sender, payout);
        }

        emit Withdrawn(depositId, msg.sender, deposit.principal, 0, true);
    }

    function renewDeposit(uint256 depositId, uint256 newPlanId) external nonReentrant returns (uint256 newDepositId) {
        Deposit storage deposit = deposits[depositId];
        _requireActiveOwner(depositId, deposit);
        require(block.timestamp >= deposit.maturityAt, "Core: not matured");
        require(!vault.paused(), "Core: system paused");

        SavingPlan storage newPlan = plans[newPlanId];
        require(newPlan.tenorDays > 0 && newPlan.enabled, "Core: plan unavailable");

        uint256 interest = _interestFor(deposit);
        uint256 newPrincipal = deposit.principal + interest;
        deposit.status = DepositStatus.ManualRenewed;

        if (interest > 0) {
            vault.payInterest(address(this), interest);
        }

        newDepositId = _createDeposit(
            msg.sender,
            newPlanId,
            newPrincipal,
            newPlan.aprBps,
            newPlan.earlyWithdrawPenaltyBps,
            newPlan.tenorDays
        );

        emit Renewed(depositId, newDepositId, newPrincipal, newPlanId);
    }

    function autoRenewDeposit(uint256 depositId) external nonReentrant returns (uint256 newDepositId) {
        Deposit storage deposit = deposits[depositId];
        require(deposit.status == DepositStatus.Active, "Core: deposit inactive");
        require(
            block.timestamp >= uint256(deposit.maturityAt) + gracePeriod,
            "Core: grace period not elapsed"
        );
        require(!vault.paused(), "Core: system paused");

        address owner = ownerOf(depositId);
        uint256 interest = _interestFor(deposit);
        uint256 newPrincipal = deposit.principal + interest;
        uint256 planId = deposit.planId;
        uint32 tenorDays = deposit.tenorDays;
        uint16 aprBpsAtOpen = deposit.aprBpsAtOpen;
        uint16 penaltyBpsAtOpen = deposit.penaltyBpsAtOpen;
        deposit.status = DepositStatus.AutoRenewed;

        if (interest > 0) {
            vault.payInterest(address(this), interest);
        }

        newDepositId = _createDeposit(
            owner,
            planId,
            newPrincipal,
            aprBpsAtOpen,
            penaltyBpsAtOpen,
            tenorDays
        );

        emit Renewed(depositId, newDepositId, newPrincipal, planId);
    }

    function interestAtMaturity(uint256 depositId) external view returns (uint256) {
        require(deposits[depositId].status != DepositStatus.None, "Core: unknown deposit");
        return _interestFor(deposits[depositId]);
    }

    function earlyWithdrawalPenalty(uint256 depositId) external view returns (uint256) {
        require(deposits[depositId].status != DepositStatus.None, "Core: unknown deposit");
        return _penaltyFor(deposits[depositId]);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _createDeposit(
        address owner,
        uint256 planId,
        uint256 principal,
        uint16 aprBpsAtOpen,
        uint16 penaltyBpsAtOpen,
        uint32 tenorDays
    ) internal returns (uint256 depositId) {
        depositId = nextDepositId++;
        uint64 maturityAt = uint64(block.timestamp + uint256(tenorDays) * 1 days);

        deposits[depositId] = Deposit({
            planId: planId,
            principal: principal,
            aprBpsAtOpen: aprBpsAtOpen,
            penaltyBpsAtOpen: penaltyBpsAtOpen,
            tenorDays: tenorDays,
            openedAt: uint64(block.timestamp),
            maturityAt: maturityAt,
            status: DepositStatus.Active
        });

        _safeMint(owner, depositId);
        emit DepositOpened(depositId, owner, planId, principal, maturityAt, aprBpsAtOpen);
    }

    function _requireActiveOwner(uint256 depositId, Deposit storage deposit) internal view {
        require(deposit.status == DepositStatus.Active, "Core: deposit inactive");
        require(ownerOf(depositId) == msg.sender, "Core: not certificate owner");
    }

    function _interestFor(Deposit storage deposit) internal view returns (uint256) {
        return
            Math.mulDiv(
                deposit.principal,
                uint256(deposit.aprBpsAtOpen) * uint256(deposit.tenorDays) * 1 days,
                SECONDS_PER_YEAR * MAX_BPS
            );
    }

    function _penaltyFor(Deposit storage deposit) internal view returns (uint256) {
        return Math.mulDiv(deposit.principal, deposit.penaltyBpsAtOpen, MAX_BPS);
    }
}
