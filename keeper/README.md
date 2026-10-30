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
| `KEEPER_TABLE` | theo terminal | `1` luôn in bảng, `0` luôn in dòng log; bỏ trống thì tự chọn |
| `KEEPER_MAX_COST_ETH` | `0.005` | Trần chi phí gas cộng dồn trong một lượt |
| `KEEPER_MIN_BALANCE_RESERVE_ETH` | `0.005` | Số dư ETH tối thiểu phải giữ lại |
| `MAX_BASE_FEE_GWEI` | `1` | Từ chối gửi khi base fee vượt ngưỡng |
| `MAX_FEE_GWEI` | `2` | Trần `maxFeePerGas` |
| `MAX_PRIORITY_FEE_GWEI` | `0.1` | Trần tip |
| `GAS_LIMIT_MULTIPLIER_BPS` | `12000` | Gas limit = estimate × 1,2 |

## Bảng theo dõi

Khi chạy trực tiếp trong terminal, mỗi lượt in một bảng thay vì danh sách dòng:

```text
7 sổ đang mở · 0 tới hạn · 3 đã đóng · tổng gốc 15,070.00 USDC
chain 2026-10-30 03:04:24 UTC · vault 100,000.00 USDC (đã hứa 27.89 USDC) · 1 eth_call (multicall)

  ID   Gói    Gốc (USDC)   Lãi (USDC)  Trạng thái    Đáo hạn       Renew từ      Còn lại
───────────────────────────────────────────────────────────────────────────────────────────
  #3     5         20.00     0.002739  đang chờ      10-30 08:20   11-02 08:20   3d 05h
  #9     5     10,000.00     0.136986  đang chờ      10-30 17:38   11-02 17:38   3d 14h
 #10     2      5,000.00        27.74  đang chờ      01-27 18:12   01-30 18:12   92d 15h

đã đóng: #1 đã tất toán, #2 đã tất toán, #8 đã tất toán
```

Sổ tới hạn được tô xanh và xếp lên đầu; sổ đã đóng chỉ liệt kê một dòng ở cuối. Khi output bị pipe sang file hoặc process khác, keeper tự chuyển về dòng log để dễ grep; đặt `KEEPER_TABLE=1` để ép in bảng.

## Cách hoạt động

Mỗi lượt là **một `eth_call`** gửi tới Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`), gộp trong cùng một block:

1. `getCurrentBlockTimestamp`, `gracePeriod`, `nextDepositId`, `paused`, `balanceOf(vault)`, `reservedInterest`.
2. `deposits(id)` cho từng sổ — lãi tính tại chỗ từ `principalSeconds` và `aprBpsAtOpen`, không cần gọi `interestAtMaturity`.
3. Chọn sổ `Active` có `block.timestamp >= maturityAt + gracePeriod`.
4. `staticCall` mô phỏng `autoRenewDeposit` — revert bị chặn ở đây, không tốn gas.
5. Gửi giao dịch qua gas guard, đọc event `Renewed` để lấy `newDepositId`.

Đọc gộp trong một block còn chính xác hơn cách cũ: đồng hồ và trạng thái sổ là ảnh chụp tại cùng một thời điểm, không có khe hở giữa lúc đọc block và lúc đọc từng sổ. Nếu RPC không có Multicall3, keeper tự lùi về đọc từng sổ và ghi rõ lý do trong log.

Mỗi sổ chỉ renew một lần: sau khi thành công `status` thành `AutoRenewed` và lần quét sau bỏ qua.

## An toàn

- `staticCall` trước khi gửi: chưa hết grace, hệ thống pause, vault thiếu lãi đều bị bỏ qua mà không mất phí.
- Gas guard: kiểm tra nonce treo, base fee, trần phí, số dư dự trữ và đối chiếu receipt sau khi gửi.
- Trần chi phí mỗi lượt và trần số giao dịch mỗi lượt — hai giới hạn độc lập.
- Lỗi ở một sổ không dừng cả lượt; `SIGINT` dừng sau giao dịch đang chạy.

## Giới hạn đã biết

- Mỗi lượt tốn **1 `eth_call`** bất kể có bao nhiêu sổ, miễn là tổng số sub-call không vượt 300. Vượt ngưỡng đó keeper chia lô, nên 1.000 sổ là 4 lần gọi chứ không phải 1.
- `ownerOf` chỉ được gọi cho sổ đủ điều kiện (dùng để in dry-run), nên khi không có sổ nào tới hạn thì lượt quét đúng 1 lần gọi.
- Phụ thuộc Multicall3 tại địa chỉ chuẩn. Nếu RPC không có contract này, keeper lùi về đọc từng sổ (`6 + N` lần) và ghi lý do vào log.
- Không có cơ chế chống chạy trùng: hai keeper cùng trỏ vào một deployment sẽ tranh nonce và một trong hai bỏ lượt.

## Test

```powershell
npm run typecheck
npm test
```
