# Contracts — TÍCH

Solidity implementation for the three required contracts in the project specification.

| File | Vai trò |
|---|---|
| `contracts/MockUSDC.sol` | ERC-20 test token, 6 decimals, public mint |
| `contracts/VaultManager.sol` | Kho lãi của ngân hàng, reserve phần lãi đã hứa, fee receiver, pause và trả lãi |
| `contracts/SavingCore.sol` | Gói, chứng chỉ ERC-721, tất toán, nhận lãi chờ, nạp thêm, rút sớm và tái gửi |
| `contracts/interfaces/IVaultManager.sol` | Ranh giới `SavingCore` → `VaultManager` |

`IVaultManager` chỉ là interface định kiểu; không có bytecode được deploy riêng. Ba contract còn lại giữ đúng vai trò tiền gốc, kho lãi và mock token của đề bài.

## Lệnh

```powershell
npm install
npm run compile
npm test
npm run coverage
npm run typecheck
npm run export:abis
```

`export:abis` đọc artifact đã compile và ghi `frontend/src/contracts/abis.ts`; không sửa file ABI bằng tay.

## Personal variant

Nguồn duy nhất ở `config/personal.ts`:

- Grace period: 3 ngày (`259200` giây).
- APR mặc định: 225 bps.
- Penalty mặc định: 400 bps.
- Tenor mặc định: 90 ngày.

## Local deployment

```powershell
# Terminal 1
npm run node

# Terminal 2
npm run deploy:local
npm run verify:local
npm run configure:frontend -- localhost
```

Script deploy thực hiện theo thứ tự:

1. Deploy `MockUSDC` và `VaultManager`.
2. Deploy `SavingCore` với grace period của personal variant.
3. Grant `CORE_ROLE` cho `SavingCore`.
4. Mint 150.000 MockUSDC cho deployer và fund 100.000 vào vault.
5. Tạo bốn gói 30/90/180/365 ngày.
6. Ghi `deployments/<network>.json` gồm chain ID, block deploy, địa chỉ contract và thông số gói.

`configure:frontend` chuyển deployment đó thành `frontend/.env.local`. File `.env.local` không được commit; `deployments/localhost.json` là artifact tạm của node local và cũng không được commit, còn `deployments/testnet.json` được track để làm manifest công khai cho Sepolia. Địa chỉ local là tạm thời; phải deploy và cấu hình lại sau mỗi lần reset node.

`verify:local` kiểm tra manifest với RPC đang chạy: chain ID, bytecode, địa chỉ token/vault/core, `CORE_ROLE`, fee receiver, grace period, bốn gói và funding vault. Nó không mở MetaMask nên không thay thế kiểm tra bằng ví thật.

## Sepolia testnet deployment

Network `testnet` bị khóa ở Sepolia chain ID `11155111` và dùng hai cấu hình bắt buộc: `TESTNET_RPC_URL` và `DEPLOYER_PRIVATE_KEY`. `FEE_RECEIVER_ADDRESS` và `EXPLORER_BASE_URL` là tùy chọn. Có thể đặt trong `contracts/.env` (file đã ignore) hoặc truyền bằng biến môi trường của shell; không ghi private key vào file source.

```text
# contracts/.env — không commit
TESTNET_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
DEPLOYER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
EXPLORER_BASE_URL=https://sepolia.etherscan.io
```

```powershell
npm run deploy:testnet
npm run verify:testnet
npm run testnet:smoke
npm run configure:frontend -- testnet
```

`verify:testnet` chỉ kiểm tra manifest/bytecode/role/gói; source verification dùng plugin `hardhat-verify` (API key lấy từ `ETHERSCAN_API_KEY`):

```powershell
npx hardhat verify --network testnet <MockUSDC>
npx hardhat verify --network testnet <VaultManager> <MockUSDC> <admin> <feeReceiver>
npx hardhat verify --network testnet <SavingCore> <MockUSDC> <VaultManager> 259200
```

Script deploy từ chối chain ID `1`, ghi manifest vào `deployments/testnet.json`, và `verify:testnet` sẽ fail nếu chain thật khác Sepolia hoặc nếu bytecode/role/plan/funding không khớp. `testnet:smoke` gửi giao dịch thật để mở một sổ, kiểm tra chặn rút trước hạn và rút sớm.

Deployment hiện tại trên Sepolia:

| Contract | Address |
|---|---|
| `MockUSDC` | `0x56790fee15a3E0A7921ccc7852a07b8C1E0C8289` |
| `VaultManager` | `0x14BB3b3579f00087127d998d1362f8082F2cDD10` |
| `SavingCore` | `0x215b88d623B6c66fFa1c4778503C2525ff03bc89` |

`verify:testnet` đã xác nhận 11 setup transaction thành công, bốn gói và vault `100,000 USDC`; source của cả ba contract đã verify trên Etherscan (`VaultManager` và `SavingCore` cũng có trên Sourcify). Smoke test giao dịch thật đã mở sổ #1 `100 USDC` (gói 30 ngày) và rút sớm với penalty `2.0 USDC`; sổ #2 `500 USDC` (gói 90 ngày) được giữ active. Bản deploy này gồm đủ C1–C4. Các luồng cần tua thời gian chưa chạy trên Sepolia thật và sẽ được kiểm tra khi có thêm Sepolia ETH.

## Test

Lần chạy gần nhất:

```text
58 passing
Total 100.00% lines / 100.00% statements
```

Các nhóm đã phủ:

- Plan hợp lệ, APR/tenor/limit sai, role management, enable/disable và cập nhật APR tương lai.
- Open deposit, min/max, snapshot APR/penalty/tenor, NFT owner.
- Interest đúng công thức, đáo hạn đúng giây, rút sớm, penalty bằng 0 và double-withdraw.
- Vault thiếu lãi, pause, role của vault, funding/withdraw và overdraw.
- Manual renew, target plan bị disable, renew sau grace và auto-renew đúng biên grace.
- Auto-renew giữ APR/penalty/tenor gốc; NFT transfer chuyển quyền thao tác.
- Constructor từ chối địa chỉ/grace period bằng 0; open deposit không có allowance không mint NFT.
- Vault thiếu lãi rollback cả manual renew và auto-renew; pause chặn cả năm lối ra; penalty đi theo fee receiver hiện tại.
- C3: rút sớm một phần, penalty trên phần rút, min còn lại, snapshot/tenor/maturity giữ nguyên, lãi đáo hạn trên phần còn lại, owner/NFT transfer, pause, penalty 0/100% và full withdrawal sau partial.
- C1: tất toán trả gốc và ghi nợ lãi khi vault thiếu; claim sau khi nạp vault; claim đi theo NFT; pause chặn claim; sổ `PrincipalWithdrawn` không dùng lại cho lối ra đáo hạn.
- C2: reserve/release chỉ qua `CORE_ROLE`; cap rút admin theo `balance − reservedInterest`; chặn khi reserve vượt số dư; release đúng khi rút sớm toàn bộ/một phần.
- C4: top-up giữa kỳ dùng principal-seconds, reserve delta, chặn owner/zero/max/pause/maturity, giảm pro-rata sau rút sớm một phần và tái gửi sổ đã top-up.

## Quyết định triển khai

- Gốc nằm ở `SavingCore`; mọi khoản lãi dương được `VaultManager` trả riêng.
- APR, penalty và tenor được snapshot vào từng deposit. Update plan không sửa deposit cũ.
- Auto-renew không đọc APR hiện tại. Nó dùng snapshot gốc và vẫn chạy nếu plan đã bị disable.
- Manual renewal vào một plan đang disable bị chặn.
- C1: nếu vault thiếu lãi lúc tất toán, `SavingCore` vẫn trả gốc, chuyển sổ sang `PrincipalWithdrawn` và ghi `pendingInterest`; chủ NFT hiện tại gọi `claimInterest` khi vault có tiền. Manual renew và auto-renew vẫn revert khi vault thiếu lãi vì chúng cần lãi để tạo gốc mới.
- Chủ sở hữu NFT hiện tại có quyền thao tác. Transfer không tự chuyển tiền lần hai.
- C3: `earlyWithdrawPartial` giảm `principal`, giữ snapshot APR/penalty/tenor/maturity; phần còn lại phải `>= plan.minDeposit`; phát event `PartialEarlyWithdrawn`.
- C4: `Deposit.principalSeconds` lưu tổng principal-seconds; `topUpDeposit` cộng thêm `amount × remainingSeconds`, reserve phần lãi tăng thêm và không đổi APR/maturity/tenor. Rút sớm một phần giảm `principalSeconds` pro-rata.
- C2: `VaultManager.reservedInterest` cộng khi mở sổ/top-up và trừ khi rút sớm hoặc trả lãi. `withdrawVault` bị cap ở `balance − reservedInterest`; `payInterest` từ chối khoản chưa reserve và chặn khi reserve vượt số dư.
- Reservation là accounting trong cùng vault, không phải escrow riêng. Reserve không kiểm tra số dư lúc reserve, nên vault có thể under-collateralized nếu admin rút hết phần chưa hứa; C1 giữ gốc rút được trong trường hợp đó.

## Phân quyền

- Deployer nhận `DEFAULT_ADMIN_ROLE` và `PLAN_MANAGER_ROLE` trên `SavingCore`.
- Deployer nhận `DEFAULT_ADMIN_ROLE` và `PAUSER_ROLE` trên `VaultManager`.
- Chỉ `SavingCore` nhận `CORE_ROLE` để gọi `reserveInterest`, `releaseInterest` và `payInterest`.
- Không có proxy hay upgrade path; địa chỉ được chốt khi deploy và contract không thể bị thay thế sau đó.

Các câu hỏi thiết kế và giải thích đầy đủ nằm trong mục **Design Answers** của [README gốc](../README.md#design-answers).
