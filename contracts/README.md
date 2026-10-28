# Contracts — TÍCH

Solidity implementation for the three required contracts in the project specification.

| File | Vai trò |
|---|---|
| `contracts/MockUSDC.sol` | ERC-20 test token, 6 decimals, public mint |
| `contracts/VaultManager.sol` | Kho lãi của ngân hàng, fee receiver, pause và trả lãi |
| `contracts/SavingCore.sol` | Gói, chứng chỉ ERC-721, tất toán, rút sớm và tái gửi |
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

`configure:frontend` chuyển deployment đó thành `frontend/.env.local`. File `.env.local` và thư mục `deployments/` không được commit. Địa chỉ local là tạm thời; phải deploy và cấu hình lại sau mỗi lần reset node.

`verify:local` kiểm tra manifest với RPC đang chạy: chain ID, bytecode, địa chỉ token/vault/core, `CORE_ROLE`, fee receiver, grace period, bốn gói và funding vault. Nó không mở MetaMask nên không thay thế kiểm tra bằng ví thật.

## Sepolia testnet deployment

Network `testnet` bị khóa ở Sepolia chain ID `11155111` và dùng hai cấu hình bắt buộc: `TESTNET_RPC_URL` và `DEPLOYER_PRIVATE_KEY`. `FEE_RECEIVER_ADDRESS` và `EXPLORER_BASE_URL` là tùy chọn. Truyền chúng bằng biến môi trường của shell; không ghi private key vào file source.

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
npm run deploy:testnet
npm run verify:testnet
npm run testnet:smoke
npm run testnet:fork
npm run configure:frontend -- testnet
```

Script deploy từ chối chain ID `1`, ghi manifest vào `deployments/testnet.json`, và `verify:testnet` sẽ fail nếu chain thật khác Sepolia hoặc nếu bytecode/role/plan/funding không khớp. `testnet:smoke` gửi giao dịch thật để mở một sổ, kiểm tra chặn rút trước hạn và rút sớm. `testnet:fork` dùng network `sepoliaFork` để mô phỏng thời gian trên bản sao trạng thái Sepolia, sau đó kiểm tra tất toán, manual renew và auto-renew.

Deployment hiện tại trên Sepolia:

| Contract | Address |
|---|---|
| `MockUSDC` | `0x4A5ee598558e49c78a545417B38251566482785c` |
| `VaultManager` | `0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5` |
| `SavingCore` | `0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf` |

`verify:testnet` đã xác nhận 11 setup transaction thành công. Smoke test đã mở và rút sớm sổ #1 với penalty `2.0 USDC`, đồng thời giữ sổ #2 `500 USDC` active. Fork test tại block `12010648` đã qua tất toán, manual renew (gốc mới `1,001.438356 USDC`) và auto-renew giữ APR `175 bps`, tenor `30 ngày`.

## Test

Lần chạy gần nhất:

```text
35 passing
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
- Vault thiếu lãi rollback cả manual renew và auto-renew; pause chặn cả bốn lối ra; penalty đi theo fee receiver hiện tại.

## Quyết định triển khai

- Gốc nằm ở `SavingCore`; mọi khoản lãi dương được `VaultManager` trả riêng.
- APR, penalty và tenor được snapshot vào từng deposit. Update plan không sửa deposit cũ.
- Auto-renew không đọc APR hiện tại. Nó dùng snapshot gốc và vẫn chạy nếu plan đã bị disable.
- Manual renewal vào một plan đang disable bị chặn.
- Nếu vault thiếu lãi, giao dịch revert; gốc không thể bị rút nửa vời.
- Chủ sở hữu NFT hiện tại có quyền thao tác. Transfer không tự chuyển tiền lần hai.
- Vault admin có thể rút tiền đã hứa do base spec không có solvency reserve. Đây là giới hạn có chủ đích; bonus C2 chưa làm.

## Phân quyền

- Deployer nhận `DEFAULT_ADMIN_ROLE` và `PLAN_MANAGER_ROLE` trên `SavingCore`.
- Deployer nhận `DEFAULT_ADMIN_ROLE` và `PAUSER_ROLE` trên `VaultManager`.
- Chỉ `SavingCore` nhận `CORE_ROLE` để gọi `payInterest`.
- Không có proxy hay upgrade path; địa chỉ được chốt khi deploy và contract không thể bị thay thế sau đó.

Các câu hỏi thiết kế và giải thích đầy đủ nằm trong mục **Design Answers** của [README gốc](../README.md#design-answers).
