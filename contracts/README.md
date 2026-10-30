# Contracts — TÍCH

Ba contract chính, cộng một interface định kiểu:

| File | Vai trò |
| --- | --- |
| `contracts/MockUSDC.sol` | ERC-20 test token, 6 decimals, public mint |
| `contracts/VaultManager.sol` | Kho lãi, `reservedInterest`, fee receiver, pause, trả lãi |
| `contracts/SavingCore.sol` | Gói, chứng chỉ ERC-721, tất toán, claim, top-up, rút sớm, tái gửi |
| `contracts/interfaces/IVaultManager.sol` | Ranh giới `SavingCore` → `VaultManager` |

`IVaultManager` không có bytecode deploy riêng. Ba contract còn lại tách đúng ba loại tiền: gốc của người gửi, tiền lãi của ngân hàng và mock token.

## Lệnh

```powershell
npm install
npm run compile
npm test
npm run coverage
npm run typecheck
npm run export:abis
```

`export:abis` đọc artifact đã compile và ghi `frontend/src/contracts/abis.ts`; không sửa ABI bằng tay.

## Tham số cố định

Nguồn duy nhất ở `config/personal.ts`:

- Grace period: 3 ngày (`259200` giây).
- APR mặc định: 225 bps.
- Penalty mặc định: 400 bps.
- Tenor mặc định: 90 ngày.

## Deploy Sepolia

Repo chỉ có một đường deploy: network `testnet`, khóa chain ID `11155111`. Không có script deploy local, fork hay deploy song song; mạng in-process `31337` chỉ dùng cho unit test. Cấu hình bắt buộc: `TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`. Tùy chọn: `FEE_RECEIVER_ADDRESS`, `EXPLORER_BASE_URL`, `ETHERSCAN_API_KEY`. Có thể đặt trong `contracts/.env` (đã ignore) hoặc truyền qua biến môi trường; không ghi private key vào source.

```text
# contracts/.env — không commit
TESTNET_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
DEPLOYER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
EXPLORER_BASE_URL=https://sepolia.etherscan.io
```

```powershell
npm run deploy:testnet:dry
npm run deploy:testnet
npm run verify:testnet
npm run configure:frontend -- testnet
```

Script deploy:

1. Deploy `MockUSDC` và `VaultManager`.
2. Deploy `SavingCore` với grace period của bộ tham số cố định.
3. Gọi `vault.setCoreOnce(core)` để cấp `CORE_ROLE` và khóa admin của role.
4. Mint 150.000 MockUSDC cho deployer, approve và nạp 100.000 vào vault.
5. Tạo năm gói 30/90/180/365/1 ngày.
6. Ghi `deployments/testnet.json` gồm chain ID, block, địa chỉ, 12 giao dịch setup, gas và thông số gói.

`deploy:testnet:dry` chỉ đọc RPC, ước lượng gas và ghi báo cáo tạm; không gửi giao dịch. `configure:frontend` chuyển manifest thành `frontend/.env.local`; cả `.env.local` lẫn report dry-run đều không được commit.

`verify:testnet` đối chiếu chain thật với manifest: chain ID, địa chỉ sinh ra từ receipt, nonce liên tục, block range, gas, bytecode tồn tại, liên kết token–vault–core, `vault.core()`, `grantRole`/`setCoreOnce` role lock, fee receiver, grace period, đúng 5 gói, funding và `reservedInterest <= vault balance`. Sau khi e2e đã mở sổ, dùng `ALLOW_POST_E2E=1 npm run verify:testnet` để bỏ qua các check snapshot mới deploy.

Source verification dùng `hardhat-verify`:

```powershell
npx hardhat verify --network testnet <MockUSDC>
npx hardhat verify --network testnet <VaultManager> <MockUSDC> <admin> <feeReceiver>
npx hardhat verify --network testnet <SavingCore> <MockUSDC> <VaultManager> 259200
```

Deployment công khai hiện tại trên Sepolia:

| Contract | Address |
| --- | --- |
| `MockUSDC` | `0x460193B776F34D63413d358203516CA44d78ecfE` |
| `VaultManager` | `0x1c5533537118320021b5795473cb2552d11Bf9B5` |
| `SavingCore` | `0x10E9eDb55C0cD100F67DEc8b558649e66B263c79` |

Deployer kiêm fee receiver: `0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731`. Bản này deploy ngày 2026-10-30, block `12026923`–`12026936`, 12 giao dịch setup, gas thực tế `2,929,946,052` wei. Vault giữ `100.000 USDC`; `verify:testnet` xác nhận đủ 5 gói và invariant reserve. Cả ba contract verified trên Etherscan; Sourcify: `MockUSDC` runtime `match`, `VaultManager` và `SavingCore` `exact_match`.

## E2E Sepolia

Ba phase nằm trong `scripts/e2e`, dùng chung state `deployments/testnet.e2e.json` (đã ignore):

```powershell
npm run testnet:e2e:immediate
npm run testnet:e2e:status
npm run testnet:e2e:mature
npm run testnet:e2e:auto-renew
```

- `immediate`: approve, mở D1 gói 30 ngày, top-up, rút sớm một phần, pause/role/reserve probe, rút sớm toàn bộ, mở T1–T6 gói 1 ngày, rút sớm một phần T2, top-up T3, chuyển NFT T4 và kiểm tra invariant. Đã chạy xong ngày 2026-10-29 với 19 giao dịch thật.
- `mature`: tất toán T2–T4, tái gửi T6 sang gói 90 ngày; chờ đáo hạn. T1 đã bị rút sớm trên chain ngày 2026-10-29 nên phase bỏ qua T1.
- `auto-renew`: gia hạn T5 sau grace; chờ đáo hạn + 3 ngày.

Script không time-travel và không fork; nếu chưa tới mốc thời gian thật, nó in mốc sớm nhất và không gửi giao dịch. Mọi giao dịch đi qua gas guard với cap `MAX_E2E_COST_ETH`.

## Keeper tự động gia hạn

Keeper cho `autoRenewDeposit` (mục 3.5 của đề) **không còn nằm trong package này**. Nó là package độc lập ở [`../keeper`](../keeper/README.md): không import Hardhat hay artifact, chỉ cần Node và một RPC endpoint, nên copy nguyên folder lên VPS/PaaS là chạy.

Lý do tách: bot phải deploy được mà không kéo theo Hardhat và bộ contract; và khóa của bot không nên nằm cùng chỗ với khóa deploy.

```powershell
cd ../keeper
npm install
npm start                                   # một lượt
KEEPER_DRY_RUN=1 npm start                  # chỉ in, không gửi giao dịch
KEEPER_MODE=watch npm start                 # lặp theo interval
```

Địa chỉ contract: đặt `CORE_ADDRESS`/`VAULT_ADDRESS`/`USDC_ADDRESS`, hoặc để trống và keeper đọc `deployments/testnet.json` qua `MANIFEST_PATH`. Xem bảng biến đầy đủ trong [`../keeper/README.md`](../keeper/README.md).

## Test

Lần chạy gần nhất (2026-10-30):

```text
104 passing
Total 100.00% lines / 100.00% statements
```

Test của keeper nằm ở package riêng: `npm --prefix keeper test` (20 trường hợp).

Các nhóm đã phủ:

- Plan hợp lệ, APR/tenor/limit sai, role management, enable/disable và cập nhật APR tương lai.
- Open deposit, min/max, snapshot APR/penalty/tenor, NFT owner.
- Interest đúng công thức, đáo hạn đúng giây, rút sớm, penalty 0/100%, double-withdraw.
- Vault thiếu lãi, pause, role của vault, funding/withdraw và overdraw.
- Manual renew, target plan bị disable, renew sau grace và auto-renew đúng biên grace.
- Auto-renew giữ APR/penalty/tenor gốc; NFT transfer chuyển quyền thao tác.
- Constructor từ chối địa chỉ/grace period bằng 0; open deposit thiếu allowance không mint NFT.
- Vault thiếu lãi rollback cả manual renew và auto-renew; pause chặn cả năm lối ra; penalty đi theo fee receiver hiện tại.
- **C1:** tất toán trả gốc và ghi nợ lãi khi vault thiếu; claim sau khi nạp vault; claim đi theo NFT; pause chặn claim; sổ `PrincipalWithdrawn` không dùng lại cho lối ra đáo hạn.
- **C2:** chỉ core giữ `CORE_ROLE`; admin không grant/revoke được sau khi khóa; one-time setup; reserve vượt số dư bị chặn; cap rút admin theo `balance − reservedInterest`; vault mất backing thì admin không rút được; release đúng khi rút sớm toàn bộ/một phần.
- **C3:** rút sớm một phần, penalty trên phần rút, min còn lại, snapshot/tenor/maturity giữ nguyên, lãi đáo hạn trên phần còn lại, owner/NFT transfer, pause, penalty 0/100% và full withdrawal sau partial.
- **C4:** top-up giữa kỳ dùng principal-seconds, reserve delta, chặn owner/zero/max/pause/maturity, giảm pro-rata sau rút sớm một phần và tái gửi sổ đã top-up.

## Quản trị

Các hàm admin có trên contract; frontend chỉ tập trung vào luồng người dùng nên không có màn hình admin.

| Hàm | Role | Việc |
| --- | --- | --- |
| `createPlan` | `PLAN_MANAGER_ROLE` | tạo gói mới |
| `updatePlan` | `PLAN_MANAGER_ROLE` | sửa APR của gói; limit/penalty/tenor cố định từ lúc tạo; không đổi sổ đã mở |
| `setPlanEnabled` | `PLAN_MANAGER_ROLE` | bật/tắt gói cho sổ mới |
| `fundVault` / `withdrawVault` | `DEFAULT_ADMIN_ROLE` | nạp hoặc rút phần chưa hứa khỏi vault |
| `setFeeReceiver` | `DEFAULT_ADMIN_ROLE` | đổi nơi nhận penalty |
| `pause` / `unpause` | `PAUSER_ROLE` | dừng mọi lối ra vào tiền |

## Quyết định triển khai

- Gốc nằm ở `SavingCore`; mọi khoản lãi dương được `VaultManager` trả riêng.
- APR, penalty và tenor được snapshot vào từng deposit. Update plan không sửa deposit cũ.
- Auto-renew không đọc APR hiện tại. Nó dùng snapshot gốc và vẫn chạy nếu plan đã bị disable.
- Manual renewal vào một plan đang disable bị chặn.
- C1: nếu vault thiếu lãi lúc tất toán, `SavingCore` vẫn trả gốc, chuyển sổ sang `PrincipalWithdrawn` và ghi `pendingInterest`; chủ NFT hiện tại gọi `claimInterest` khi vault có tiền. Manual renew và auto-renew vẫn revert khi vault thiếu lãi vì chúng cần lãi để tạo gốc mới.
- Chủ sở hữu NFT hiện tại có quyền thao tác. Transfer không tự chuyển tiền lần hai.
- C3: `earlyWithdrawPartial` giảm `principal`, giữ snapshot APR/penalty/tenor/maturity; phần còn lại phải `>= plan.minDeposit`; phát event `PartialEarlyWithdrawn`.
- C4: `Deposit.principalSeconds` lưu tổng principal-seconds; `topUpDeposit` cộng thêm `amount × remainingSeconds`, reserve phần lãi tăng thêm và không đổi APR/maturity/tenor. Rút sớm một phần giảm `principalSeconds` pro-rata.
- C2: `reservedInterest` cộng khi mở sổ/top-up và trừ khi rút sớm hoặc trả lãi. `withdrawVault` bị cap ở `balance − reservedInterest`. `payInterest` từ chối khoản chưa reserve.
- `setCoreOnce` cấp `CORE_ROLE` cho `SavingCore` một lần rồi đặt admin của `CORE_ROLE` thành chính nó; `reserveInterest` từ chối nếu tổng reservation vượt số dư vault. Invariant: `vault balance >= reservedInterest`.
- Reservation vẫn là accounting trong cùng vault, không phải escrow riêng. Nếu token bị mất khỏi vault, invariant vỡ; khi đó `withdrawVault` bị chặn và C1 vẫn bảo vệ gốc.

## Phân quyền

- Deployer nhận `DEFAULT_ADMIN_ROLE` và `PLAN_MANAGER_ROLE` trên `SavingCore`.
- Deployer nhận `DEFAULT_ADMIN_ROLE` và `PAUSER_ROLE` trên `VaultManager`.
- `SavingCore` nhận `CORE_ROLE` trên `VaultManager` qua `setCoreOnce`. Sau đó `CORE_ROLE` tự quản lý admin của nó; deployer không grant/revoke được nữa.
- Admin vẫn tin cậy cho plan, pause, fee receiver và rút phần chưa hứa. Chưa có timelock/multisig hay tách role chi tiết hơn.
- Không có proxy hay upgrade path; địa chỉ được chốt khi deploy và contract không thể bị thay thế sau đó.

Các câu hỏi thiết kế và giải thích đầy đủ nằm trong mục **Design Answers** của [README gốc](../README.md#design-answers).
