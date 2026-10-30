// SPDX-License-Identifier: MIT
pragma solidity ^0.8.38;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
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

    /// @dev Tier artwork on IPFS. Five seals cover every possible tenor, so a new
    ///      plan never needs a new image and this URI never changes.
    string private constant BASE_IMAGE_URI =
        "https://plum-negative-aardwolf-541.mypinata.cloud/ipfs/bafybeibkfr24msv7lvcpcb5rfykrn2yrfyoq4xar37rfbnxklkkzllo6kq/";

    string private constant DESCRIPTION =
        "On-chain term-deposit certificate issued by TICH. The principal is held by SavingCore and the promised interest is reserved in VaultManager.";

    enum DepositStatus {
        None,
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed,
        PrincipalWithdrawn
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
        uint256 principalSeconds;
    }

    IERC20 public immutable asset;
    IVaultManager public immutable vault;
    uint256 public immutable gracePeriod;

    mapping(uint256 planId => SavingPlan) public plans;
    mapping(uint256 depositId => Deposit) public deposits;
    mapping(uint256 depositId => uint256 amount) public pendingInterest;
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
    event PartialEarlyWithdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 amount,
        uint256 penalty,
        uint256 remainingPrincipal
    );
    event InterestDeferred(uint256 indexed depositId, address indexed owner, uint256 amount);
    event InterestClaimed(uint256 indexed depositId, address indexed owner, uint256 amount);
    event DepositToppedUp(
        uint256 indexed depositId,
        address indexed owner,
        uint256 amount,
        uint256 newPrincipal,
        uint256 interestAdded
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

        bool interestDeferred;
        if (interest > 0) {
            try vault.payInterest(msg.sender, interest) {
                // The vault released this interest reservation when it paid.
            } catch {
                // C1: the principal must never be locked behind an underfunded vault.
                deposit.status = DepositStatus.PrincipalWithdrawn;
                pendingInterest[depositId] = interest;
                interestDeferred = true;
            }
        }
        asset.safeTransfer(msg.sender, deposit.principal);

        emit Withdrawn(depositId, msg.sender, deposit.principal, interest, false);
        if (interestDeferred) {
            emit InterestDeferred(depositId, msg.sender, interest);
        }
    }

    function claimInterest(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        require(deposit.status == DepositStatus.PrincipalWithdrawn, "Core: no pending interest");
        require(ownerOf(depositId) == msg.sender, "Core: not certificate owner");
        require(!vault.paused(), "Core: system paused");

        uint256 amount = pendingInterest[depositId];
        require(amount > 0, "Core: no pending interest");
        pendingInterest[depositId] = 0;
        vault.payInterest(msg.sender, amount);

        emit InterestClaimed(depositId, msg.sender, amount);
    }

    function topUpDeposit(uint256 depositId, uint256 amount) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        _requireActiveOwner(depositId, deposit);
        require(block.timestamp < deposit.maturityAt, "Core: already matured");
        require(!vault.paused(), "Core: system paused");
        require(amount > 0, "Core: invalid amount");

        uint256 newPrincipal = deposit.principal + amount;
        SavingPlan storage plan = plans[deposit.planId];
        require(plan.maxDeposit == 0 || newPrincipal <= plan.maxDeposit, "Core: above maximum");

        uint256 beforeInterest = _interestFor(deposit);
        uint256 remainingSeconds = uint256(deposit.maturityAt) - block.timestamp;
        asset.safeTransferFrom(msg.sender, address(this), amount);

        deposit.principal = newPrincipal;
        deposit.principalSeconds += amount * remainingSeconds;
        uint256 interestAdded = _interestFor(deposit) - beforeInterest;
        if (interestAdded > 0) {
            vault.reserveInterest(interestAdded);
        }

        emit DepositToppedUp(depositId, msg.sender, amount, newPrincipal, interestAdded);
    }

    function earlyWithdraw(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        _requireActiveOwner(depositId, deposit);
        require(block.timestamp < deposit.maturityAt, "Core: already matured");
        require(!vault.paused(), "Core: system paused");

        uint256 interestReserved = _interestFor(deposit);
        uint256 penalty = _penaltyFor(deposit);
        uint256 payout = deposit.principal - penalty;
        deposit.status = DepositStatus.Withdrawn;
        if (interestReserved > 0) {
            vault.releaseInterest(interestReserved);
        }

        if (penalty > 0) {
            asset.safeTransfer(vault.feeReceiver(), penalty);
        }
        if (payout > 0) {
            asset.safeTransfer(msg.sender, payout);
        }

        emit Withdrawn(depositId, msg.sender, deposit.principal, 0, true);
    }

    function earlyWithdrawPartial(uint256 depositId, uint256 amount) external nonReentrant {
        Deposit storage deposit = deposits[depositId];
        _requireActiveOwner(depositId, deposit);
        require(block.timestamp < deposit.maturityAt, "Core: already matured");
        require(!vault.paused(), "Core: system paused");
        require(amount > 0 && amount < deposit.principal, "Core: invalid partial amount");

        uint256 remainingPrincipal = deposit.principal - amount;
        require(
            remainingPrincipal >= plans[deposit.planId].minDeposit,
            "Core: remaining below minimum"
        );

        uint256 beforeInterest = _interestFor(deposit);
        uint256 previousPrincipal = deposit.principal;
        uint256 penalty = _penaltyForAmount(amount, deposit.penaltyBpsAtOpen);
        uint256 payout = amount - penalty;
        deposit.principal = remainingPrincipal;
        deposit.principalSeconds = Math.mulDiv(
            deposit.principalSeconds,
            remainingPrincipal,
            previousPrincipal
        );
        uint256 afterInterest = _interestFor(deposit);
        if (beforeInterest > afterInterest) {
            vault.releaseInterest(beforeInterest - afterInterest);
        }

        if (penalty > 0) {
            asset.safeTransfer(vault.feeReceiver(), penalty);
        }
        if (payout > 0) {
            asset.safeTransfer(msg.sender, payout);
        }

        emit PartialEarlyWithdrawn(depositId, msg.sender, amount, penalty, remainingPrincipal);
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

    /// @notice A certificate can change hands only while its deposit is open.
    /// @dev Once the deposit is closed (settled at maturity, withdrawn early, or
    ///      renewed) the certificate is a record, not a claim, so it stays put.
    function isTransferable(uint256 tokenId) public view returns (bool) {
        _requireOwned(tokenId);
        return deposits[tokenId].status == DepositStatus.Active;
    }

    /// @notice Certificates ever issued. Nothing is burned, so this is also the
    ///         current supply and the number explorer pages ask for.
    function totalSupply() external view returns (uint256) {
        return nextDepositId - 1;
    }

    /// @dev Minting skips the lock; every change of holder is gated.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            require(deposits[tokenId].status == DepositStatus.Active, "Core: certificate locked");
        }
        return super._update(to, tokenId, auth);
    }

    /// @notice ERC-721 metadata: a name, the tier artwork on IPFS and the deposit traits.
    /// @dev The image is derived from the tenor snapshot, never from the live plan, so
    ///      editing a plan cannot change an existing certificate.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Deposit storage deposit = deposits[tokenId];

        string memory image = string.concat(
            BASE_IMAGE_URI,
            _artName(deposit.tenorDays, deposit.status),
            ".svg"
        );

        string memory head = string.concat(
            '{"name":"TICH Deposit Certificate #',
            _pad4(tokenId),
            '","description":"',
            DESCRIPTION,
            '","image":"',
            image,
            '","attributes":['
        );
        string memory json = string.concat(head, _attributes(deposit), "]}");

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev A closed certificate keeps its artwork slot but uses the grey seal.
    function _artName(uint32 tenorDays, DepositStatus status) private pure returns (string memory) {
        if (status != DepositStatus.Active) return "closed";
        return _tierName(tenorDays);
    }

    /// @dev Tier thresholds must mirror frontend/src/lib/seal.ts (sealTierFor).
    function _tierName(uint32 tenorDays) private pure returns (string memory) {
        if (tenorDays <= 1) return "bronze";
        if (tenorDays <= 30) return "silver";
        if (tenorDays <= 90) return "gold";
        if (tenorDays <= 180) return "diamond";
        return "emerald";
    }

    function _statusName(DepositStatus status) private pure returns (string memory) {
        if (status == DepositStatus.Active) return "Active";
        if (status == DepositStatus.PrincipalWithdrawn) return "Interest pending";
        if (status == DepositStatus.Withdrawn) return "Settled";
        if (status == DepositStatus.ManualRenewed) return "Renewed";
        return "Auto renewed";
    }

    /// @dev Left-pads to four digits so every certificate number has a stable width.
    ///      Longer ids pass through unchanged.
    function _pad4(uint256 value) private pure returns (string memory) {
        bytes memory digits = bytes(Strings.toString(value));
        uint256 pad = digits.length < 4 ? 4 - digits.length : 0;
        bytes memory out = new bytes(pad + digits.length);
        for (uint256 i = 0; i < pad; i++) {
            out[i] = "0";
        }
        for (uint256 i = 0; i < digits.length; i++) {
            out[pad + i] = digits[i];
        }
        return string(out);
    }

    function _attributes(Deposit storage deposit) private view returns (string memory) {
        string memory first = string.concat(
            '{"trait_type":"Tier","value":"',
            _tierName(deposit.tenorDays),
            '"},{"trait_type":"Tenor (days)","value":',
            Strings.toString(deposit.tenorDays),
            '},{"trait_type":"APR (bps)","value":',
            Strings.toString(deposit.aprBpsAtOpen)
        );
        string memory second = string.concat(
            '},{"trait_type":"Principal (units)","value":"',
            Strings.toString(deposit.principal),
            '"},{"trait_type":"Matures (unix)","value":',
            Strings.toString(deposit.maturityAt),
            '},{"trait_type":"Status","value":"',
            _statusName(deposit.status),
            '"}'
        );
        return string.concat(first, second);
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
            status: DepositStatus.Active,
            principalSeconds: principal * uint256(tenorDays) * 1 days
        });

        _safeMint(owner, depositId);
        emit DepositOpened(depositId, owner, planId, principal, maturityAt, aprBpsAtOpen);

        uint256 interest = _interestFor(deposits[depositId]);
        if (interest > 0) {
            vault.reserveInterest(interest);
        }
    }

    function _requireActiveOwner(uint256 depositId, Deposit storage deposit) internal view {
        require(deposit.status == DepositStatus.Active, "Core: deposit inactive");
        require(ownerOf(depositId) == msg.sender, "Core: not certificate owner");
    }

    function _interestFor(Deposit storage deposit) internal view returns (uint256) {
        return
            Math.mulDiv(
                deposit.principalSeconds,
                uint256(deposit.aprBpsAtOpen),
                SECONDS_PER_YEAR * MAX_BPS
            );
    }

    function _penaltyForAmount(uint256 amount, uint16 penaltyBps) internal pure returns (uint256) {
        return Math.mulDiv(amount, penaltyBps, MAX_BPS);
    }

    function _penaltyFor(Deposit storage deposit) internal view returns (uint256) {
        return _penaltyForAmount(deposit.principal, deposit.penaltyBpsAtOpen);
    }
}
