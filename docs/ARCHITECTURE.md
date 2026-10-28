# Architecture — TÍCH

## Contracts

| Contract | Responsibility | Does not hold |
|---|---|---|
| `MockUSDC` | ERC-20 with 6 decimals and a public test mint | Real funds |
| `VaultManager` | Bank-funded interest pool, fee receiver, pause control, interest payment | User principal |
| `SavingCore` | Plans, deposit state, ERC-721 certificates, principal custody, withdrawals and renewals | Bank interest pool |

Deployment order is `MockUSDC`, `VaultManager`, `SavingCore`, then `grantRole(CORE_ROLE, SavingCore)`. The admin funds the vault and creates plans before users approve and open deposits.

`IVaultManager` is a compile-time interface, not a fourth deployment. The deployer keeps `DEFAULT_ADMIN_ROLE` and `PLAN_MANAGER_ROLE` on `SavingCore`, and `DEFAULT_ADMIN_ROLE` plus `PAUSER_ROLE` on `VaultManager`. Only the deployed `SavingCore` receives `VaultManager.CORE_ROLE`.

## Personal variant

- Student ID: `22665321`.
- `A = 1`, `B = 2`.
- Grace period: 3 days.
- Default APR: 225 bps (2.25%).
- Early-withdrawal penalty: 400 bps (4.00%).
- Default tenor: 90 days.

The single contract-side source is `contracts/config/personal.ts`. The frontend seed mirrors the default plan for the local-wallet fallback.

## Invariants

- USDC amounts use six-decimal integer units; interest uses multiply-before-divide and rounds down.
- `SavingCore` holds principal. `VaultManager` pays every positive interest amount.
- APR, penalty and tenor are copied into the deposit when it opens. Updating a plan affects only new deposits.
- A deposit has one terminal action: withdraw, manual renew, or auto renew. The status is checked before funds move.
- The current ERC-721 owner controls a certificate and receives a renewed certificate. Past owners have no claim after transfer.
- Manual renewal is allowed at or after maturity. Auto renewal is allowed only at or after maturity plus the 3-day grace period.
- Auto renewal reuses the original APR and penalty snapshots and the original tenor even if the current plan changed or was disabled.
- While the vault is paused, opening deposits, withdrawals and renewals revert. Funding the vault remains available for recovery.
- The base specification has no solvency reserve or delayed-interest queue. If the vault lacks interest at maturity, the whole withdrawal reverts and the deposit remains active.

## Timing boundaries

- `withdrawAtMaturity` and manual `renewDeposit` use `block.timestamp >= maturityAt`.
- `earlyWithdraw` uses `block.timestamp < maturityAt`.
- `autoRenewDeposit` uses `block.timestamp >= maturityAt + gracePeriod`.
- A user who waits past grace may still renew manually while the certificate is active and the bot has not renewed it.

## Current boundary

The Solidity implementation, 35-test suite and 100% line/statement coverage exist. `scripts/deploy.ts` deploys the full set to a local Hardhat node or Sepolia and writes a deployment manifest; `scripts/verify-deployment.ts` checks the manifest against a live RPC; `scripts/configure-frontend.ts` turns that manifest into `frontend/.env.local` without exposing a private key. `scripts/sepolia-e2e.ts` performs real Sepolia transactions for open and early withdrawal, then uses a time-travel fork of the deployed Sepolia state for maturity withdrawal, manual renewal and auto-renewal. The compiler target is explicit (`osaka`) so the toolchain reports a deterministic EVM target.

The frontend keeps a local-wallet mode for UI review and adds a MetaMask mode that activates only when all three addresses and the chain ID are configured. The typed adapter reads plans, vault balance, wallet balance and the current user's deposit certificates from contract events, then executes approve/open/withdraw/renew transactions and waits for receipts. Revert reasons are mapped to VI/EN messages. See `frontend/src/contracts/adapter.ts`.

Network `testnet` is locked to Sepolia chain ID `11155111` and configured through `TESTNET_RPC_URL` and `DEPLOYER_PRIVATE_KEY`. Three contracts are deployed on public Sepolia: `MockUSDC` at `0x4A5ee598558e49c78a545417B38251566482785c`, `VaultManager` at `0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5`, and `SavingCore` at `0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf`. Real open and early-withdraw transactions succeeded; maturity, manual renewal and auto-renewal passed on a time-travel fork of finalized Sepolia state. MetaMask extension signing in a browser and the demo video remain **unverified**; all three sources are verified on Sepolia Etherscan. Local Hardhat addresses are ephemeral and must not be presented as persistent testnet addresses.
