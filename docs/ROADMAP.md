# Roadmap

## Phase 1 — Frontend skeleton (đã có)

- [x] Vite + React + TypeScript + Tailwind v4.
- [x] Design tokens, typography, responsive shell.
- [x] Plans and deposits pages, limited to the section 7.3 flows.
- [x] Mock bank state with localStorage.
- [x] Vietnamese and English UI with persisted language choice.
- [x] Wallet connect; internal wallet for local-only UI testing.
- [x] Open, withdraw-at-maturity, early-withdraw and renew flows.
- [x] Desktop and mobile visual checks.

## Phase 2 — Contracts

- [x] Khởi tạo Hardhat + OpenZeppelin.
- [x] `MockUSDC` 6 decimals.
- [x] `VaultManager` với fund/withdraw/feeReceiver/pause.
- [x] `SavingCore` với plan, deposit NFT, snapshot, withdraw, renew, auto-renew.
- [x] Thay demo constants bằng personal variant thật.
- [x] Test đủ case trong `docs/SPEC.md`, coverage 100% dòng/statement.
- [x] Ghi lại các quyết định design và edge case.

## Phase 3 — Integration

- [x] Deploy local, lưu address/ABI.
- [x] Tạo adapter `frontend/src/contracts/adapter.ts` dùng ethers.
- [x] Thay mock actions bằng read/write contract khi có cấu hình deployment.
- [x] Giữ local-wallet mode để xem UI khi chưa có chain.
- [x] Xử lý pending, rejected, revert và sai network trong code.
- [x] Có network HTTP cho testnet và script kiểm tra manifest/bytecode/role/plan.
- [x] Chạy thử nhánh deploy/verify testnet bằng node RPC local trong giai đoạn chuẩn bị.
- [x] Xác minh giao dịch trên explorer Sepolia.
- [x] Đã kết nối và ký giao dịch thực tế qua extension MetaMask (giao dịch #5 đã được mở thành công).
- [x] Deploy Sepolia và lưu manifest/địa chỉ được xác minh.
- [x] Gửi giao dịch thật cho open và early withdrawal trên Sepolia.
- [x] Chạy maturity withdrawal, manual renewal và auto-renew trên fork state Sepolia đã finalize.
- [x] Kiểm tra frontend đọc deployment Sepolia và gửi open/early-withdraw qua bridge ký cục bộ; không dùng private key trong trang.
- [x] Verify source cả ba contract trên Etherscan Sepolia.

## Phase 4 — Submission

- [x] README có cách chạy, stack, variant và đủ bảy Design Answers.
- [x] Kiểm tra coverage và các invariant.
- [ ] Quay video 3–5 phút.
- [ ] Kiểm tra repo public/private và license.
