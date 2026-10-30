/**
 * Human-readable ABIs. The keeper deliberately does not import Hardhat artifacts
 * or the contracts package, so this folder can be deployed on its own.
 */

export const SAVING_CORE_ABI = [
  "function gracePeriod() view returns (uint256)",
  "function nextDepositId() view returns (uint256)",
  "function deposits(uint256 depositId) view returns (uint256 planId, uint256 principal, uint16 aprBpsAtOpen, uint16 penaltyBpsAtOpen, uint32 tenorDays, uint64 openedAt, uint64 maturityAt, uint8 status, uint256 principalSeconds)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function interestAtMaturity(uint256 depositId) view returns (uint256)",
  "function autoRenewDeposit(uint256 depositId) returns (uint256 newDepositId)",
  "event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal, uint256 indexed newPlanId)",
];

export const VAULT_MANAGER_ABI = [
  "function paused() view returns (bool)",
  "function reservedInterest() view returns (uint256)",
];

export const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
