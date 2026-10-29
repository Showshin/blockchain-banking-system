# TÍCH — project operating rules

## What this repository is

This is the final assignment for a blockchain programming course: an on-chain term-deposit system. The original brief is the course handout; distilled requirements and local working notes are kept in an untracked `docs/` folder and are not part of the submission. The current phase has a bilingual frontend, Solidity contracts with 100% line/statement coverage, a redeployed and source-verified public Sepolia deployment and a MetaMask contract adapter. All three contracts are source-verified on Sepolia Etherscan. The contracts implement C1 deferred interest (`claimInterest`), C2 reserved-interest accounting (`reservedInterest`), C3 partial early withdrawal (`earlyWithdrawPartial`, 11 tests) and C4 top-ups (`topUpDeposit`). The frontend exposes C1, C3 and C4 in the deposit card and action dialogs; C2 is admin/vault-only and has no dedicated screen. The new Sepolia deployment (`SavingCore 0x215b88d6…bc89`, blocks `12017324`–`12017340`) includes all four challenges, but live smoke testing covers only open and full early withdrawal; partial withdrawal, top-up, maturity, renewal, auto-renew and claim still need Sepolia ETH or maturity time. A real MetaMask walkthrough and the demo video remain open.

## Default workflow

Follow the local working notes when they are present. The short version is: read the brief, state assumptions, write the smallest complete vertical slice, verify it, then update the README. Do not stop at a plan when implementation is requested.

## UI work

Use the project skill [`.agents/skills/fintech-product-ui/SKILL.md`](.agents/skills/fintech-product-ui/SKILL.md) before changing screens. Longer design notes live in the untracked local `docs/` folder when present. Reuse the existing token layer in [`frontend/src/index.css`](frontend/src/index.css) and the components in `frontend/src/components`. Do not introduce a second palette, icon family, font pairing or card system.

The frontend covers the four required flows in section 7.3 (view plans, open a deposit, view deposits, withdraw or renew) plus the user-facing C1/C3/C4 actions: partial early withdrawal, top-up and deferred-interest claim. `frontend/src/state/BankProvider.tsx` starts with empty plans and deposits. Plans shows a connect prompt, then a loading state until chain data arrives. There is no seed or mock bank state. MetaMask is the only transaction mode and activates only when `frontend/.env.local` has all three contract addresses and the chain ID. Contract calls belong in `frontend/src/contracts/adapter.ts`; do not spread them across pages or components. The adapter targets the current C1–C4 build only. Never describe empty or loading states as on-chain data.

Every screen must work in both Vietnamese and English. Add user-facing copy to `frontend/src/i18n/messages.ts`; do not hard-code a new string in a component.

## Commands

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

From the repository root, `npm run dev`, `npm run build` and `npm run lint` proxy the frontend commands.

```powershell
npm test
npm run coverage
npm run contracts:typecheck
npm run deploy:local
npm run verify:local
npm run test:sepolia
```

The Sepolia path is locked to chain ID `11155111` and uses `deploy:testnet`, `verify:testnet` and `test:sepolia` with `TESTNET_RPC_URL` and `DEPLOYER_PRIVATE_KEY` supplied through the environment. `verify:testnet` only reads, but Hardhat still resolves the private-key variable, so set a dummy or real key for that command. Never put a deployer private key in source, `VITE_*`, or a committed file.

## Non-negotiable project rules

- The personal variant is locked for Student ID `22665321`: `A=1`, `B=2`, grace 3 days, default APR 225 bps, penalty 400 bps and default tenor 90 days.
- Keep the separation between `SavingCore` principal and `VaultManager` interest money. The UI note on the plans screen should keep that separation visible.
- APR and penalty are snapshotted when a deposit opens. Never let a plan edit change an existing certificate.
- Auto-renew must use the original APR and the actual grace period. Do not silently change the rule to make a flow easier.
- Every meaningful flow needs success, loading, empty and error states. A static happy path is not complete.
- Vietnamese and English must show the same data, validation and success/error behavior.
- User-facing copy is Vietnamese and English. Code identifiers and technical comments are English.
- There is no seed or mock bank state; use connect, loading, empty and error states.
- Do not invent contract addresses, ABIs, deployment results, coverage numbers or test results. Mark a boundary when it has not been verified.
- Do not commit or push unless the user asks. If asked, stage explicit paths and report the destination.

## Definition of done for the current phase

- `npm run build` passes.
- `npm run lint` passes.
- Contract tests and TypeScript check pass.
- Plans and deposits work at desktop and mobile widths.
- Open, withdraw-at-maturity, early-withdraw (full and partial), top-up, claim and renew flows have been exercised in a browser against the local deployment.
- The README never claims C1/C2/C4 are on Sepolia until that deployment is redeployed, verified and smoke-tested.
- Language switching works, persists after reload and does not leave untranslated copy.
- The README and tracked READMEs match the implementation; `docs/` is local working notes and is not part of the submission.
