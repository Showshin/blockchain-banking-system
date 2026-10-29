---
name: fintech-product-ui
description: Build or extend the TÍCH on-chain term-deposit product UI with its neutral light/dark system, Vietnamese/English copy, and the four required user flows. Use inside this repo; not for unrelated landing pages, admin dashboards, or new design systems.
---

# Fintech Product UI — TÍCH

Read the local design notes in the untracked `docs/` folder when present, `frontend/src/index.css`, and the existing components in `frontend/src/components` before editing. Reuse the current system; do not create a parallel one.

## Product frame

The frontend covers section 7.3 of the assignment only:

- Plans: available terms, APR, min/max and early-withdrawal penalty.
- Deposits: active certificates, matured certificates ready to withdraw or renew, and principal-returned certificates with deferred interest to claim.
- Open a deposit with validation and an interest preview.

Withdraw at maturity, full or partial early withdrawal, top-up, deferred-interest claim and renewal happen in dialogs from the deposit card. Do not add a dashboard, vault-admin screen, auto-renew bot controls or other admin surfaces; they are not part of the required frontend.

MetaMask is the only transaction mode. It is enabled only when `frontend/.env.local` contains the chain ID and all three deployed addresses. `src/contracts/adapter.ts` reads the configured chain and sends approve/open/withdraw/partial-withdraw/top-up/claim/renew transactions through the wallet.

`BankProvider` starts with empty plans and deposits. Plans shows a connect prompt, then a loading state until chain data arrives. There is no seed or mock bank state; never describe empty or loading states as on-chain data. A connected MetaMask address by itself is not proof of a contract write; require the configured chain and a transaction receipt.

The adapter targets the current C1–C4 SavingCore ABI and reads the full nine-field deposit struct.

## Bilingual rules

- Every visible string lives in `frontend/src/i18n/messages.ts`; components must not contain new hard-coded copy.

- Vietnamese and English must expose the same actions, validation and results.

- Dates follow the selected locale; USDC amounts keep en-US grouping with two decimals.

- Test both languages, including dialogs and validation messages, at desktop and mobile widths.

- Switching languages must preserve the same shell geometry: nav, header actions, summary cards and certificate actions stay in place. Reserve stable widths and line heights rather than letting translated copy resize the layout.

## Visual invariants

- Theme: only Light and Dark, selected manually and persisted in `tich-theme-v1`.

- Light tokens: paper #f5f6f3, paper-deep #e9ebe7, surface #ffffff, ink #141615, muted #646965, line #d9ddd8.

- Dark tokens: paper #0e100f, paper-deep #171a18, surface #141715, ink #f1f4f0, muted #979d98, line #2b302c.

- Type: Geist Variable + Geist Mono Variable only. No Inter, Roboto, Arial or a new serif.

- Shape: cards 20px, modal/drawer 24px, controls 10px, badges pill.

- Use hairline borders and very soft tinted shadows. No heavy black shadows.

- Keep the interface neutral. Green, amber and red are reserved for semantic status, warnings and errors.

- Use Phosphor icons at light weight and the monochrome TÍCH seal. Do not mix icon families.

- Use CSS texture from `index.css`; no stock photos, no purple gradients, no glassmorphism everywhere.

## Component choices

- Page intro: PageHeader.

- Default information surface: `.panel`.

- Deposit certificate: CertificateCard + `.certificate`.

- Saving plan: PlanCard + `.plan-card`.

- Actions: `.btn` variants; do not invent a new button shape.

- Amount entry: `.amount-input`; other fields: `.input`.

- Wallet choice: `.wallet-option`.

## Interaction completeness

Every flow needs an observable pending state, success state, and error/empty state. Forms need min/max validation and a clear reason when a button is disabled. Modal/drawer must lock body scroll, close with Escape, and expose an accessible label. Respect prefers-reduced-motion.

Mobile behavior is designed, not squeezed: stack grids, use full-width sheets for deposit flows, keep primary actions reachable, and test at 390px.

Language and route changes should confirm the interaction immediately: animate the language or navigation pill and fade the new content in with opacity/transform for at most 250ms. Do not hold the old page through an exit animation or show a blank waiting frame. Respect reduced-motion preferences.

## Workflow

1. State the screen/flow and acceptance criteria.

2. Inspect the current page, shared components, state provider and messages file.

3. Reuse tokens/components; add one component only when the role is genuinely new.

4. Implement the full vertical slice: UI → state action → result → persistence where appropriate.

5. Verify `npm run build`, `npm run lint`, and the flow in a browser at desktop and mobile widths in both languages.

When contract mode is configured, also verify network mismatch, wallet rejection, pending approval/receipt and the vault-shortfall error before claiming the flow works on-chain.

6. Update README.md, and the local docs notes when present, only if behavior or rules changed.

## Definition of done

- No placeholder names, unused screens or fake on-chain claims.

- Only Light and Dark themes exist; no System option or legacy System fallback.

- No unused imports or new dependency without a concrete reason.

- Amount/date formatting is consistent: USDC with en-US, dates with vi-VN or en-US.

- The flow works with wallet disconnected, connected, and insufficient-balance states where relevant.

- Both languages are complete; no untranslated string remains.

- The final handoff names changed files, checks run, and any unverified boundary.
