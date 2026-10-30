# Keeper — tự động gia hạn sổ đáo hạn

Bot off-chain cho `autoRenewDeposit` (mục 3.5 của đề). Đây là **package độc lập**: không import Hardhat, không import `contracts/`, chỉ cần Node và một RPC endpoint. Copy nguyên folder này lên VPS hoặc PaaS là chạy được.

## Yêu cầu

- Node.js >= 22.12
- Một địa chỉ Sepolia có ETH trả gas. `autoRenewDeposit` không giới hạn người gọi nên ví bot **không cần role**, cũng **không cần USDC** và **không cần approve**.

## Cài đặt

```powershell
npm install
Copy-Item .env.example .env
# điền RPC_URL và KEEPER_PRIVATE_KEY
```

`keeper/.env` đã nằm trong `.gitignore` và chứa khóa riêng — không commit.

Nếu repo đã có `contracts/.env`, sinh `keeper/.env` từ đó thay vì chép tay:

```bash
cd keeper
RPC=$(grep '^TESTNET_RPC_URL=' ../contracts/.env | cut -d= -f2-)
KEY=$(grep '^DEPLOYER_PRIVATE_KEY=' ../contracts/.env | cut -d= -f2-)
printf 'RPC_URL=%s\nKEEPER_PRIVATE_KEY=%s\nKEEPER_DRY_RUN=1\n' "$RPC" "$KEY" > .env
```

Dùng chung ví deployer là hợp lệ vì `autoRenewDeposit` không phân quyền, nhưng hai tiến trình dùng chung một account sẽ chung nonce: đừng chạy keeper cùng lúc với `deploy:testnet`, và khi có giao dịch đang treo keeper sẽ bỏ qua lượt đó (đây là kiểm tra an toàn, không phải lỗi).

Địa chỉ contract lấy theo thứ tự ưu tiên: `CORE_ADDRESS`/`VAULT_ADDRESS`/`USDC_ADDRESS` nếu có, ngược lại đọc `MANIFEST_PATH` (mặc định `../contracts/deployments/testnet.json`). Điền đủ ba địa chỉ thì **không cần** `MANIFEST_PATH` — biến đó chỉ là đường dự phòng khi chạy trong repo; deploy xa repo thì đặt thẳng ba biến địa chỉ.

## Chạy

```powershell
npm start                                     # treo chạy mãi, lặp theo interval
KEEPER_DRY_RUN=1 npm start                    # chỉ in, không gửi giao dịch
KEEPER_MODE=once npm start                    # kiểm tra nhanh một lượt rồi thoát
```

Mặc định là `watch`: bot treo và in `--- pass N ---` mỗi chu kỳ, chỉ dừng khi `Ctrl+C`. Chỉ những sổ đã qua `maturityAt + gracePeriod` mới được gửi giao dịch; sổ chưa đáo hạn chỉ được liệt kê ở dòng `waiting`.

Chạy nền trên Linux:

```bash
nohup npm start >> keeper.log 2>&1 &
```

## Cấu hình

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `RPC_URL` | — | JSON-RPC endpoint, bắt buộc |
| `CHAIN_ID` | `11155111` | Chain ID phải khớp RPC |
| `KEEPER_PRIVATE_KEY` | — | Khóa ví bot, bắt buộc |
| `CORE_ADDRESS` / `VAULT_ADDRESS` / `USDC_ADDRESS` | — | Địa chỉ contract; bỏ trống thì đọc manifest |
| `MANIFEST_PATH` | `../contracts/deployments/testnet.json` | Nguồn địa chỉ dự phòng |
| `KEEPER_MODE` | `watch` | `watch` treo chạy mãi; `once` chạy một lượt rồi thoát |
| `KEEPER_DRY_RUN` | `0` | `1` chỉ báo cáo, không gửi giao dịch |
| `KEEPER_INTERVAL_SECONDS` | `300` | Nghỉ giữa hai lượt ở chế độ `watch` |
| `KEEPER_MAX_RENEWALS_PER_RUN` | `10` | Chặn số giao dịch mỗi lượt |
| `KEEPER_LOG_WAITING_LIMIT` | `0` | Số sổ đang chờ được in mỗi lượt; `0` là in hết |
| `KEEPER_MAX_COST_ETH` | `0.005` | Trần chi phí gas cộng dồn trong một lượt |
| `KEEPER_MIN_BALANCE_RESERVE_ETH` | `0.005` | Số dư ETH tối thiểu phải giữ lại |
| `MAX_BASE_FEE_GWEI` | `1` | Từ chối gửi khi base fee vượt ngưỡng |
| `MAX_FEE_GWEI` | `2` | Trần `maxFeePerGas` |
| `MAX_PRIORITY_FEE_GWEI` | `0.1` | Trần tip |
| `GAS_LIMIT_MULTIPLIER_BPS` | `12000` | Gas limit = estimate × 1,2 |

## Cách hoạt động

Mỗi lượt:

1. Đọc `nextDepositId`, `gracePeriod`, `paused`, số dư và `reservedInterest` của vault.
2. Đọc từng sổ (`deposits`, `ownerOf`, `interestAtMaturity`) và chỉ chọn sổ `Active` có `block.timestamp >= maturityAt + gracePeriod`.
3. `staticCall` mô phỏng `autoRenewDeposit` — revert bị chặn ở đây, không tốn gas.
4. Gửi giao dịch qua gas guard, đọc event `Renewed` để lấy `newDepositId`.

Mỗi sổ chỉ renew một lần: sau khi thành công `status` thành `AutoRenewed` và lần quét sau bỏ qua.

## An toàn

- `staticCall` trước khi gửi: chưa hết grace, hệ thống pause, vault thiếu lãi đều bị bỏ qua mà không mất phí.
- Gas guard: kiểm tra nonce treo, base fee, trần phí, số dư dự trữ và đối chiếu receipt sau khi gửi.
- Trần chi phí mỗi lượt và trần số giao dịch mỗi lượt — hai giới hạn độc lập.
- Lỗi ở một sổ không dừng cả lượt; `SIGINT` dừng sau giao dịch đang chạy.

## Giới hạn đã biết

- Quét toàn bộ sổ mỗi lượt: O(n) lần `eth_call`. Với vài chục sổ thì ổn; quy mô lớn nên chuyển sang theo dõi event hoặc indexer.
- Không có cơ chế chống chạy trùng: hai keeper cùng trỏ vào một deployment sẽ tranh nonce và một trong hai bỏ lượt.

## Test

```powershell
npm run typecheck
npm test
```
