# TÍCH — Sổ tiết kiệm on-chain

Bài **Online Banking System**: người dùng xem gói, mở sổ bằng USDC, nhận chứng chỉ ERC-721 và tất toán hoặc tái tục khi đáo hạn. Ứng dụng có tiếng Việt, tiếng Anh, giao diện Sáng/Tối và hai chế độ dữ liệu: contract qua MetaMask hoặc ví nội bộ dùng dữ liệu mô phỏng.

## Personal variant

MSSV **22665321** → `A = 1`, `B = 2`.

| Tham số | Công thức | Giá trị đã khóa |
|---|---|---|
| Grace period | `(A mod 3) + 2` ngày | 3 ngày = 259.200 giây |
| APR mặc định | `200 + A × 25` bps | 225 bps = 2,25% |
| Penalty rút sớm | `300 + B × 50` bps | 400 bps = 4,00% |
| Tenor mặc định | `B` chẵn → 90 ngày | 90 ngày |

Các giá trị này nằm ở `contracts/config/personal.ts`, được dùng bởi contract test, deployment và gói mặc định trên frontend.

## Công nghệ

Các phiên bản dưới đây là phiên bản đang cài và đã được lock. Node.js dùng bản **LTS 24.22.1** để Hardhat và Vite có môi trường ổn định; npm hiện tại là **11.19.1**. Node 24.22.1 là bản LTS mới nhất tại thời điểm kiểm tra; code cũng đã chạy test, build và lint với Node Current **26.12.1**.

| Lớp | Công nghệ | Phiên bản |
|---|---|---|
| Runtime | Node.js | 24.22.1 LTS |
| Frontend | React / React DOM | 19.3.1 |
| Frontend | Vite | 8.3.5 |
| Frontend | TypeScript | 7.0.2 |
| Frontend | Tailwind CSS | 4.3.3 |
| Frontend | React Router | 7.18.5 |
| Frontend | Motion / Phosphor | 14.7.1 / 2.1.10 |
| Frontend | ethers / oxlint | 6.17.0 / 1.90.0 |
| Contract | Hardhat / Solidity | 3.21.1 / 0.8.38 |
| Contract | OpenZeppelin Contracts | 5.6.1 |
| Test | Mocha / Chai / ethers | 12.0.3 / 6.3.0 / 6.17.0 |

Kiểm tra ngày 2026-10-28: `npm outdated` trống ở cả `frontend` và `contracts`, tức các gói trực tiếp đang ở bản mới nhất trong registry. Build frontend không có cảnh báo chunk lớn; các trang được lazy-load và vendor được tách nhóm.

`npm audit` của frontend và `npm audit --omit=dev` của contracts đều báo 0 lỗ hổng. Audit đầy đủ trong contracts hiện có 7 mục high, tất cả cùng trỏ về advisory của `zod@3.25.76` mà Hardhat 3.21.1 kéo vào; chưa có bản Hardhat mới hơn tương thích. `npm audit fix` đề xuất hạ `hardhat-network-helpers` xuống nhánh 1.x, nên không chạy `--force`; đây là giới hạn dev-tooling đã biết, không phải dependency runtime của contract hay frontend.

## Trạng thái đã kiểm chứng

- Frontend bám phạm vi mục **7.3**: xem gói, mở sổ, xem sổ, tất toán hoặc tái tục.
- Giao diện VI/EN và Sáng/Tối được lưu sau reload; chuyển ngôn ngữ giữ nguyên vị trí nút hành động và action trên chứng chỉ trong phép đo ở 1440px và 390px.
- Mở sổ, rút trước hạn, tất toán đúng hạn và tái tục đã được bấm lại trên trình duyệt với state mô phỏng. Ở 1440px và 390px, sau hiệu ứng chuyển ngôn ngữ, nav, nút hành động, summary và action trên chứng chỉ giữ nguyên tọa độ; trang không tràn ngang.
- Ba contract bắt buộc và interface đã được implement. `35` test Hardhat đang pass; coverage thật là **100% dòng và 100% statement** cho cả ba contract.
- Deployment script đã chạy thành công với Hardhat node tại `127.0.0.1:8545`; artifact, ABI và địa chỉ deployment được sinh thật. Địa chỉ này là tạm thời và mất khi node được khởi động lại.
- Sepolia deployment đã được chạy thật trên chain ID `11155111`; `verify:testnet` xác nhận bytecode, liên kết contract, role, bốn gói, vault và **11 setup transaction** đều thành công.
- `test:sepolia` đã gửi giao dịch thật để mở sổ, chặn tất toán trước hạn và rút sớm; một sổ `500 USDC` được giữ active để kiểm tra tiếp.
- `test:sepolia:fork` chạy trên bản fork state Sepolia và đã qua tất toán đúng hạn, tái tục thủ công và auto-renew đúng biên grace.
- Frontend có adapter contract, kiểm tra chain ID, approve USDC khi cần, chờ receipt và ánh xạ revert sang VI/EN. Chưa có test ký giao dịch thật với extension MetaMask vì môi trường hiện tại không có MetaMask đã cấu hình.
- Đã mở lại frontend trên `127.0.0.1:5173`: chuyển VI/EN và Sáng/Tối, reload vẫn giữ lựa chọn; ví nội bộ mở sổ #1, rút trước hạn và hiện empty state đúng. Nhánh MetaMask hiển thị chain ID `11155111`; extension MetaMask chưa được dùng để ký.
- Qua harness EIP-1193 tạm thời (không lưu trong repo), frontend đã đọc đúng bốn gói, sổ #2 `500 USDC` đang active và số dư `49.500 USDC` từ deployment Sepolia. Một bridge ký cục bộ sau đó đã nhận giao dịch từ UI, ký ngoài trang và gửi thật lên Sepolia: mở #3/#4 rồi rút sớm cả hai. Bốn receipt có status `1`; trạng thái testnet đã trở lại chỉ còn sổ #2 active. Adapter đọc lại deposit tại block của receipt để không hiển thị state rỗng do RPC chậm.

Source của cả ba contract đã được verify trên Etherscan Sepolia bằng standard JSON input lấy từ build-info, compiler `v0.8.38+commit.1835d247`. Giao diện đã kết nối và ký giao dịch thực tế qua extension MetaMask (mở sổ #5 thành công). Video demo vẫn chưa hoàn tất; bonus challenge C1–C5 không được chọn.

## Kiến trúc contract

| Contract | Giữ gì | Trách nhiệm |
|---|---|---|
| `MockUSDC` | Không giữ tiền | ERC-20 6 decimals, mint công khai để test |
| `VaultManager` | Tiền lãi của ngân hàng | Fund/withdraw vault, fee receiver, pause, trả lãi cho `SavingCore` |
| `SavingCore` | Gốc của người gửi | Gói, NFT, snapshot, tất toán, rút sớm, tái tục thủ công và auto-renew |

`IVaultManager` là interface định kiểu cho ba lời gọi từ `SavingCore` sang vault, không phải contract được deploy riêng. `SavingCore` nhận `CORE_ROLE` trên `VaultManager`; tài khoản deploy giữ role admin và plan manager. ABI của cả `MockUSDC`, `VaultManager`, `SavingCore` được sinh từ artifact Hardhat, không viết tay.

Gốc và lãi luôn tách riêng. Khi mở sổ, `SavingCore` giữ USDC của người gửi và mint NFT. Khi đáo hạn, `SavingCore` gọi `VaultManager.payInterest` cho phần lãi rồi trả gốc. Nếu vault thiếu lãi, toàn bộ giao dịch revert và sổ vẫn `Active`.

Các invariant và ranh giới thời gian chi tiết nằm trong [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Chạy frontend với dữ liệu mô phỏng

```powershell
cd frontend
npm install
npm run dev
```

Mở `http://localhost:5173`, chọn **Ví nội bộ**. Danh sách sổ mặc định trống và chỉ có chứng chỉ sau khi bạn mở sổ; chế độ này không gửi giao dịch và không đại diện cho số dư on-chain.

Kiểm tra build và lint từ thư mục gốc:

```powershell
npm run build
npm run lint
```

## Chạy contract và nối frontend vào local chain

Mở ba terminal tại thư mục gốc.

```powershell
# Terminal 1: giữ Hardhat node chạy
npm --prefix contracts run node

# Terminal 2: deploy và sinh cấu hình frontend
npm --prefix contracts run deploy:local
npm --prefix contracts run verify:local
npm --prefix contracts run configure:frontend -- localhost

# Terminal 3: khởi động lại Vite sau khi .env.local được tạo
npm --prefix frontend run dev
```

Trong MetaMask, thêm mạng local `http://127.0.0.1:8545`, chain ID `31337`, và dùng một tài khoản test do lệnh `hardhat node` in ra. Tài khoản deployer nhận 150.000 MockUSDC để thử approve và mở sổ. Không dùng các khóa test này trên mạng thật.

Nếu sửa ABI hoặc contract, chạy lại:

```powershell
npm --prefix contracts run export:abis
npm --prefix contracts run deploy:local
npm --prefix contracts run configure:frontend -- localhost
```

`configure:frontend` chỉ ghi `frontend/.env.local`, gồm chain ID, block deploy và ba địa chỉ contract. Không có private key trong biến `VITE_*`. Mẫu cấu hình nằm ở `frontend/.env.example`. Để quay lại chế độ mô phỏng, xóa `frontend/.env.local` rồi restart Vite.

`verify:local` đọc manifest trong `contracts/deployments/localhost.json`, đối chiếu chain ID, bytecode, liên kết token/vault/core, role, grace period, fee receiver, bốn gói và số dư vault. Lệnh này không thay thế việc bấm thử giao dịch trong trình duyệt.

## Deploy lên Sepolia testnet

Network `testnet` được khóa vào Sepolia chain ID `11155111`. RPC có thể lấy từ [Chainlist Sepolia](https://chainlist.org/chain/11155111); repo đang dùng endpoint PublicNode. Không đặt private key trong source, `.env.local` hay biến `VITE_*`; truyền biến môi trường cho riêng phiên PowerShell.

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:FEE_RECEIVER_ADDRESS='0x...'      # tùy chọn
$env:EXPLORER_BASE_URL='https://sepolia.etherscan.io'  # tùy chọn, chỉ lưu vào manifest

npm --prefix contracts run deploy:testnet
npm --prefix contracts run verify:testnet
npm run test:sepolia
npm run test:sepolia:fork
npm --prefix contracts run configure:frontend -- testnet
```

Khởi động lại Vite sau khi `frontend/.env.local` được ghi. `verify:testnet` kiểm tra chain ID thật từ RPC, bytecode, liên kết contract, role, grace period, fee receiver, các gói và funding vault. `test:sepolia` gửi giao dịch thật để mở sổ và rút trước hạn; `test:sepolia:fork` fork trạng thái Sepolia đã deploy thành chain local rồi tua thời gian để kiểm tra tất toán, manual renew và auto-renew. Fork là bản sao chỉ đọc của Sepolia và không ghi giao dịch lên testnet.

### Deployment hiện tại

| Contract | Địa chỉ Sepolia |
|---|---|
| `MockUSDC` | [`0x4A5ee598558e49c78a545417B38251566482785c`](https://sepolia.etherscan.io/address/0x4A5ee598558e49c78a545417B38251566482785c) |
| `VaultManager` | [`0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5`](https://sepolia.etherscan.io/address/0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5) |
| `SavingCore` | [`0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf`](https://sepolia.etherscan.io/address/0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf) |

Deployer và fee receiver: [`0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731`](https://sepolia.etherscan.io/address/0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731). Deployment bắt đầu từ block `12010637`, hoàn tất setup ở block `12010648`; manifest đầy đủ nằm trong `contracts/deployments/testnet.json` và `frontend/.env.local` đang trỏ vào deployment này.

Giao dịch smoke test thật:

- Mở sổ #1: [`0x20d46a1328c1a324661757cf8d1a09db05fd4e21599792fc79de07f757360021`](https://sepolia.etherscan.io/tx/0x20d46a1328c1a324661757cf8d1a09db05fd4e21599792fc79de07f757360021)
- Rút sớm sổ #1: [`0xc6b611b31e964f34858fad56f1c136190ba4ddcb4bf0ce9bdb85881f4805df36`](https://sepolia.etherscan.io/tx/0xc6b611b31e964f34858fad56f1c136190ba4ddcb4bf0ce9bdb85881f4805df36)
- Mở sổ #2 và giữ active: [`0x8276434d4bf8f12d3c0a92bd6679778414ebdc601b39eedd724ced12bf536fe8`](https://sepolia.etherscan.io/tx/0x8276434d4bf8f12d3c0a92bd6679778414ebdc601b39eedd724ced12bf536fe8)
- UI → bridge local: mở #3 [`0xcfb224...012dbc`](https://sepolia.etherscan.io/tx/0xcfb224aa1e68d38fb9bd8a3631a17d53b4ea834c883147215ec8d5711c012dbc), rút sớm #3 [`0xaebb39...dd5aa`](https://sepolia.etherscan.io/tx/0xaebb39079f2f3c49f2a14886e7e878fb83f1595241b1c2608081f871925dd5aa).
- UI → bridge local: mở #4 [`0x35d2df...facc2c`](https://sepolia.etherscan.io/tx/0x35d2dff23b49ed157a3fd5827164e763bd48365ce5fe5833126525feb4facc2c), rút sớm #4 [`0x539bcc...126298`](https://sepolia.etherscan.io/tx/0x539bcc406bd2b502ea0bb0c0f198fdad7851738013c1120e92d142f4cc126298).

`test:sepolia:fork` dùng block `12010648` đã có đủ state của deployment; transaction hash in ra bởi lệnh này chỉ tồn tại trên fork local, không phải giao dịch Sepolia.

## Test và coverage

```powershell
npm test
npm run coverage
npm run contracts:typecheck
```

Kết quả lần chạy ngày 2026-10-28:

```text
35 passing
MockUSDC       100.00% lines / 100.00% statements
VaultManager   100.00% lines / 100.00% statements
SavingCore     100.00% lines / 100.00% statements
Total          100.00% lines / 100.00% statements
```

Bộ test phủ các flow bắt buộc, constructor, thiếu allowance, snapshot APR/penalty, biên đáo hạn và grace, double-withdraw, vault thiếu lãi khi cả rút và tái tục, pause ở mọi lối ra, NFT transfer, penalty bằng 0 và rounding xuống 0. Xem [contracts/README.md](contracts/README.md) để biết lệnh và lựa chọn triển khai.

## Cấu trúc

```text
.
├── AGENTS.md                    # luật làm việc cho coding agent
├── docs/
│   ├── ARCHITECTURE.md          # invariant, thời gian và ranh giới tích hợp
│   ├── DESIGN.md                # design system và interaction states
│   ├── ROADMAP.md               # phần đã làm và phần còn lại
│   ├── SKILLS.md                # nguồn skill tham khảo
│   ├── SPEC.md                  # yêu cầu bài tập
│   └── WORKFLOW.md              # quy trình end-to-end và prompt mẫu
├── frontend/                    # React/Vite, mock adapter và contract adapter
└── contracts/                   # Solidity, Hardhat, test, ABI export, deploy
```

## Design Answers

### 1. Transferable certificate

The current NFT owner has the claim. [`_requireActiveOwner`](contracts/contracts/SavingCore.sol#L293) requires `ownerOf(depositId) == msg.sender` before withdrawal or renewal, and auto-renew mints the replacement certificate to `ownerOf(depositId)`. Therefore Alice loses the right to withdraw after transferring the NFT to Bob; Bob receives the principal and interest. This supports a real secondary market for deposit claims, but it also means losing or selling the NFT transfers the entire claim. The UI should continue to show the current owner and warn before transfer; it must not cache the original depositor as the owner.

### 2. Empty vault

The base specification says to revert, and that is the implemented behavior. [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L153) changes the status inside the transaction, calls [`VaultManager.payInterest`](contracts/contracts/VaultManager.sol#L57), and the entire transaction rolls back if the vault lacks the promised interest. The test `reverts without changing status when the vault cannot pay interest` proves that the principal remains locked and the status stays `Active`. This is harsh because an underfunded bank can block a user's own principal. A safer alternative is to pay principal immediately, record unpaid interest as a claim, and let the user collect it when the vault is funded; that is creative challenge C1 and is not implemented here. I kept the revert rule because it matches the required base flows and makes the solvency failure explicit rather than hiding it.

### 3. Dead bot

If the auto-renew bot is offline, the deposit stays `Active` after maturity and grace; it is not deleted and the user does not lose principal or the interest already fixed at opening. The user can still call `withdrawAtMaturity` or manually renew because both use `block.timestamp >= maturityAt`, and [`autoRenewDeposit`](contracts/contracts/SavingCore.sol#L219) is permissionless rather than restricted to one bot address. The cost is opportunity cost: the next term starts later than intended. A useful protection is a "renew now" action in the frontend at the grace boundary, plus an independent keeper; the contract should keep the permissionless fallback so one dead operator cannot strand a deposit.

### 4. Rounding dust

Interest and penalty use OpenZeppelin `Math.mulDiv` in [`_interestFor`](contracts/contracts/SavingCore.sol#L298) and [`_penaltyFor`](contracts/contracts/SavingCore.sol#L307), which multiply before dividing and round down. For maturity interest, the lost fractional unit remains in the vault; for an early penalty, the fractional unit remains in `SavingCore` with the principal backing rather than being credited to the fee receiver. The test with a one-unit principal, 1 bps APR and a one-day term returns exactly zero interest and still lets the user withdraw the principal; this proves the zero-interest branch does not call `payInterest` and cannot block the principal. No separate dust accounting exists, so dust cannot be withdrawn twice or create a negative balance.

### 5. Boundary times

[`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L153) and manual [`renewDeposit`](contracts/contracts/SavingCore.sol#L190) use `block.timestamp >= maturityAt`, while [`earlyWithdraw`](contracts/contracts/SavingCore.sol#L170) uses `block.timestamp < maturityAt`. Exactly at maturity is therefore a maturity withdrawal, never an early withdrawal. `autoRenewDeposit` uses `block.timestamp >= maturityAt + gracePeriod`; the end of grace is inclusive, so the bot or any caller may auto-renew at that second. The user may also manually renew at that second if no auto-renew transaction has executed, because manual renewal only checks the maturity boundary and the deposit remains active.

### 6. Disabled plan with active deposits

Disabling a plan changes only `plans[planId].enabled`; it does not change any deposit snapshot. Existing users can still withdraw at maturity, withdraw early under their snapshotted penalty, or renew into another enabled plan. `renewDeposit` rejects a disabled target plan, so a user cannot manually move new principal back into a closed product. [`autoRenewDeposit`](contracts/contracts/SavingCore.sol#L219) is deliberately allowed to continue using the original plan snapshot even when the plan is disabled: it is an obligation already promised to an active deposit, not a new deposit opened by a new customer. This rule prevents a routine product closure from taking away a user's renewal path.

### 7. Attack thinking

The realistic attack I chose is a reentrancy/double-withdraw attempt. [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L153) and [`earlyWithdraw`](contracts/contracts/SavingCore.sol#L170) are `nonReentrant`; [`_requireActiveOwner`](contracts/contracts/SavingCore.sol#L293) checks the current owner and `Active` status, then the function changes status inside the transaction before external token calls, and a second call after settlement reverts with `Core: deposit inactive`. The vault also checks `CORE_ROLE` on `payInterest`, and the token and vault addresses are immutable constructor inputs, so a caller cannot substitute a fake token or vault after deployment. The remaining limitation is the base spec's vault drain risk; a solvency reserve would be a separate design change, not a reason to trust an unverified deployment.

## Phần còn lại trước khi nộp

1. Chạy lại bốn flow qua MetaMask thật trên Sepolia; adapter hiện đã typecheck và build nhưng ký giao dịch qua extension chưa được xác minh trong môi trường này.
2. Verify source trên Etherscan nếu có API key.
3. Quay video demo 3–5 phút bằng dữ liệu Sepolia ở trên. Không dùng số liệu mô phỏng như bằng chứng on-chain.

## Tài liệu

- [Đặc tả đã chắt lọc](docs/SPEC.md)
- [Kiến trúc và invariant](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN.md)
- [Quy trình end-to-end và prompt mẫu](docs/WORKFLOW.md)
- [Contract và lệnh chạy](contracts/README.md)
- [Roadmap](docs/ROADMAP.md)
