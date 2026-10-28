# TÍCH — project operating rules

## What this repository is

This is the final assignment for a blockchain programming course: an on-chain term-deposit system. The original brief is [Final_Assignment.docx](Final_Assignment.docx); the distilled requirements are in [docs/SPEC.md](docs/SPEC.md). The current phase has a tested bilingual frontend, persistent mock state, Solidity contracts with 100% line/statement coverage, a verified public Sepolia deployment and a MetaMask contract adapter. Real-wallet browser verification, explorer source verification and the demo video remain open.

## Default workflow

Follow [docs/WORKFLOW.md](docs/WORKFLOW.md) for every feature. The short version is: read the brief, state assumptions, write the smallest complete vertical slice, verify it, then update the docs. Do not stop at a plan when implementation is requested.

## UI work

Use the project skill [`.agents/skills/fintech-product-ui/SKILL.md`](.agents/skills/fintech-product-ui/SKILL.md) and read [docs/DESIGN.md](docs/DESIGN.md) before changing screens. Reuse the existing token layer in [`frontend/src/index.css`](frontend/src/index.css) and the components in `frontend/src/components`. Do not introduce a second palette, icon family, font pairing or card system.

The frontend covers the four user flows in section 7.3: view plans, open a deposit, view deposits, withdraw or renew. `frontend/src/state/BankProvider.tsx` owns the boundary between mock state and chain state. Contract calls belong in `frontend/src/contracts/adapter.ts`; do not spread them across pages or components. Local-wallet actions are mock data. MetaMask actions send transactions only when `frontend/.env.local` has all three contract addresses and the chain ID. Never describe local-wallet data as on-chain state.

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
npm run test:sepolia:fork
```

The Sepolia path is locked to chain ID `11155111` and uses `deploy:testnet`, `verify:testnet`, `test:sepolia` and `test:sepolia:fork` with `TESTNET_RPC_URL` and `DEPLOYER_PRIVATE_KEY` supplied through the environment. Never put a deployer private key in source, `VITE_*`, or a committed file.

## Non-negotiable project rules

- The personal variant is locked for Student ID `22665321`: `A=1`, `B=2`, grace 3 days, default APR 225 bps, penalty 400 bps and default tenor 90 days.
- Keep the separation between `SavingCore` principal and `VaultManager` interest money. The UI note on the plans screen should keep that separation visible.
- APR and penalty are snapshotted when a deposit opens. Never let a plan edit change an existing certificate.
- Auto-renew must use the original APR and the actual grace period. Do not silently change the rule to make a flow easier.
- Every meaningful flow needs success, loading, empty and error states. A static happy path is not complete.
- Vietnamese and English must show the same data, validation and success/error behavior.
- User-facing copy is Vietnamese and English. Code identifiers and technical comments are English.
- Do not invent contract addresses, ABIs, deployment results, coverage numbers or test results. Mark a boundary when it has not been verified.
- Do not commit or push unless the user asks. If asked, stage explicit paths and report the destination.

## Definition of done for the current phase

- `npm run build` passes.
- `npm run lint` passes.
- Contract tests and TypeScript check pass.
- Plans and deposits work at desktop and mobile widths.
- Open, withdraw-at-maturity, early-withdraw and renew flows have been exercised in a browser.
- Language switching works, persists after reload and does not leave untranslated copy.
- The README and docs match the implementation, including mock-data limitations.
