# TÍCH — Sổ tiết kiệm kỳ hạn on-chain

Đồ án môn Lập trình Blockchain: một hệ thống gửi tiết kiệm có kỳ hạn chạy hoàn toàn bằng smart contract. Người dùng khóa MockUSDC vào contract, nhận một chứng chỉ NFT (ERC-721) làm bằng chứng cho khoản gửi, hưởng lãi đơn theo lãi suất đã chốt lúc mở sổ, có thể nạp thêm gốc, rồi tất toán đúng hạn, rút trước hạn chịu phạt, nhận lãi chờ hoặc tái gửi sang kỳ hạn mới.

Phần giao diện là React + TypeScript, kết nối MetaMask và đọc/ghi trực tiếp lên ba contract đã deploy. Sau khi kết nối, số dư, danh sách gói và danh sách sổ đều đọc từ chain; trong lúc chờ RPC, giao diện hiển thị loading state, không dùng dữ liệu mẫu.

Bản local và bản công khai trên Sepolia đều có đủ C1, C2, C3 và C4. Bộ contract hiện tại được deploy lại lên Sepolia ngày 2026-10-29, đã verify source trên Etherscan và chạy smoke test giao dịch thật. Các luồng cần chờ đáo hạn sẽ được kiểm tra khi ví có thêm Sepolia ETH.

## Thông số cá nhân

MSSV **22665321** lấy hai chữ số cuối: `A = 1` (chữ số cuối) và `B = 2` (chữ số áp út). Bốn tham số của đồ án suy ra từ hai số này:

| Tham số | Công thức | Giá trị | Diễn giải |
| --- | --- | --- | --- |
| Grace period | `(A mod 3) + 2` ngày | 3 ngày (259.200 giây) | Chờ 3 ngày sau đáo hạn rồi mới tự động gia hạn |
| APR mặc định | `200 + A × 25` bps | 225 bps = 2,25%/năm | Lãi suất năm; 100 bps = 1% |
| Phạt rút sớm | `300 + B × 50` bps | 400 bps = 4,00% | Rút trước hạn bị trừ 4% phần gốc rút ra |
| Kỳ hạn mặc định | `B` chẵn → 90 ngày | 90 ngày | Gói mặc định gửi trong 90 ngày |

Tất cả nằm trong [contracts/config/personal.ts](contracts/config/personal.ts). Test ([fixtures.ts](contracts/test/fixtures.ts)) và script deploy ([deploy.ts](contracts/scripts/deploy.ts)) đều đọc từ file này, nên phần contract không có số cứng nào khác. Frontend đọc APR, penalty và tenor của từng gói từ chain, không giữ bản sao seed. Grace period là tham số constructor, không sửa được sau deploy, nên đổi MSSV là phải deploy bộ contract mới.

## Công nghệ

| Lớp | Công nghệ | Phiên bản |
| --- | --- | --- |
| Runtime | Node.js | 24.22.1 (LTS) |
| Contract | Solidity / Hardhat | 0.8.38 / 3.21.1 |
| Contract | OpenZeppelin Contracts | 5.6.1 |
| Test | Mocha / Chai / ethers | 12.0.3 / 6.3.0 / 6.17.0 |
| Frontend | React / Vite | 19.3.1 / 8.3.5 |
| Frontend | TypeScript / Tailwind CSS | 7.0.2 / 4.3.3 |
| Frontend | ethers / React Router | 6.17.0 / 7.18.5 |

`package.json` ở gốc khai báo `engines.node >= 24.22.1`. Nếu máy bạn đang dùng Node cũ hơn, Hardhat 3 sẽ báo lỗi ngay khi chạy lệnh đầu tiên.

## Cài đặt

Clone repo rồi cài dependency cho hai phần. Thư mục gốc chỉ chứa script điều hướng, không có dependency riêng, nên `npm install` ở đây là tùy chọn.

```powershell
npm install                 # tùy chọn, chỉ đọc root package.json
npm --prefix contracts install
npm --prefix frontend install
```

## Cấu hình địa chỉ contract

Tạo file .env.local tham khảo file .env.example:

```text
VITE_CHAIN_ID=11155111
VITE_DEPLOY_BLOCK=12017324
VITE_CORE_ADDRESS=0x215b88d623B6c66fFa1c4778503C2525ff03bc89
VITE_VAULT_ADDRESS=0x14BB3b3579f00087127d998d1362f8082F2cDD10
VITE_USDC_ADDRESS=0x56790fee15a3E0A7921ccc7852a07b8C1E0C8289
```

Cách nhanh nhất là để script sinh hộ, vì nó đọc manifest deployment và ghi đúng định dạng:

```powershell
npm --prefix contracts run configure:frontend -- testnet
```

Mẫu rỗng nằm ở [frontend/.env.example](frontend/.env.example). Chỉ có địa chỉ công khai và chain ID trong các biến `VITE_*`; private key không bao giờ được đặt ở đây vì mọi thứ tiền tố `VITE_` đều bị đóng gói vào bundle và ai mở trang cũng đọc được. Việc ký giao dịch do MetaMask thực hiện trong trình duyệt.

Nếu thiếu một trong ba địa chỉ, [config.ts](frontend/src/contracts/config.ts) sẽ báo lỗi cấu hình và nút kết nối ví hiển thị thông báo thay vì cố gọi contract.

## Chạy giao diện

```powershell
npm run dev
```

Mở `http://127.0.0.1:5173/`. Sau khi Vite chạy:

1. Bấm **Kết nối ví**, chọn **MetaMask**.
2. Chuyển MetaMask sang **Sepolia** (chain ID `11155111`). Danh sách RPC có ở [chainlist.org/chain/11155111](https://chainlist.org/chain/11155111).
3. Thêm token để nhìn thấy số dư: contract `0x56790fee15a3E0A7921ccc7852a07b8C1E0C8289`, symbol `USDC`, decimals `6`.
4. Vào **Gói tiết kiệm**, chọn kỳ hạn, bấm mở sổ. Lần đầu tiên, ví sẽ hỏi hai giao dịch: `approve` cấp hạn mức USDC cho contract, sau đó `openDeposit`. Những lần sau hạn mức vẫn còn nên chỉ còn một giao dịch mở sổ.
5. Vào **Sổ của tôi** để xem chứng chỉ NFT, tất toán, rút trước hạn (toàn bộ hoặc một phần), nạp thêm, nhận lãi chờ hoặc tái gửi.

Ba địa chỉ Sepolia ở trên là bản deploy C1–C4 hiện tại. Bản C3 cũ vẫn còn trên chain nhưng không còn dùng và frontend không đọc bản đó nữa; adapter chỉ hỗ trợ bản C1–C4.

MockUSDC là token test và hàm `mint` mở công khai, nên ví chưa có tiền vẫn lấy được: vào trang [Write Contract](https://sepolia.etherscan.io/address/0x56790fee15a3E0A7921ccc7852a07b8C1E0C8289#writeContract), gọi `mint` với địa chỉ ví và số lượng theo đơn vị 6 decimals (1.000 USDC = `1000000000`). Ví cũng cần một ít Sepolia ETH để trả gas; faucet có trong chainlist hoặc ở [sepoliafaucet.com](https://sepoliafaucet.com).

## Kiểm thử

```powershell
npm test
npm run coverage
npm run contracts:typecheck
```

Kết quả lần chạy gần nhất (2026-10-29):

```text
58 passing
MockUSDC       100.00% lines / 100.00% statements
VaultManager   100.00% lines / 100.00% statements
SavingCore     100.00% lines / 100.00% statements
Total          100.00% lines / 100.00% statements
```

Bộ test phủ các luồng bắt buộc, các nhánh lỗi và mấy chỗ dễ sai: thiếu allowance, snapshot APR sau khi admin sửa gói, biên đáo hạn và biên grace, rút hai lần, rút sớm một phần (C3), vault thiếu lãi khi rút và tái gửi, pause chặn mọi lối ra, chuyển NFT đổi chủ, gói có penalty bằng 0 và trường hợp lãi làm tròn xuống 0. C1 có thêm nhánh trả gốc ngay rồi ghi nợ lãi, quyền nhận lãi theo chủ NFT hiện tại và pause; C2 có reserve/release, chặn admin rút phần đã hứa; C4 có top-up giữa kỳ, nhiều lần top-up, giảm gốc pro-rata khi rút sớm một phần và tái gửi sổ đã top-up. Chi tiết cách chia nhóm test nằm trong [contracts/README.md](contracts/README.md).

## Đổi bộ tham số theo MSSV khác

**Bước 1 — sửa file cấu hình.** Mở [contracts/config/personal.ts](contracts/config/personal.ts), thay `STUDENT_ID`, `A`, `B`:

```ts
export const STUDENT_ID = "22665321";
export const A = 1;   // chữ số cuối
export const B = 2;   // chữ số áp út
```

Bốn hằng số còn lại (`GRACE_PERIOD_DAYS`, `DEFAULT_APR_BPS`, `DEFAULT_PENALTY_BPS`, `DEFAULT_TENOR_DAYS`) được tính từ `A` và `B`, không sửa tay.

**Bước 2 — chạy lại test.** Fixture trong `contracts/test/fixtures.ts` đọc đúng các hằng số này, nên `npm test` sẽ kiểm tra contract với bộ số mới thay vì bộ số cũ.

**Bước 3 — deploy lại.** Đây là phần dễ hiểu sai nhất. Grace period là tham số constructor của `SavingCore` và được lưu dạng `immutable`, còn APR, penalty và tenor của gói mặc định là state do `deploy.ts` tạo ra sau khi deploy. Không có hàm nào sửa được grace period của contract đã deploy, nên đổi variant đồng nghĩa với deploy một bộ contract mới:

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
npm --prefix contracts run deploy:testnet
npm --prefix contracts run verify:testnet
npm --prefix contracts run configure:frontend -- testnet
```

**Bước 4 — khởi động lại Vite** để nó đọc `.env.local` mới. Trong manifest `contracts/deployments/testnet.json` có mục `personalVariant` ghi lại `studentId`, grace, APR, penalty và tenor thực tế đã deploy; mở file đó để đối chiếu nhanh.

Frontend không hard-code các tham số này: nó đọc gói qua `plans(planId)` và đọc APR/penalty/tenor đã snapshot trên từng sổ từ chain, nên đổi variant chỉ cần deploy lại và trỏ `.env.local` sang địa chỉ mới.

## Deploy lên Sepolia

Network `testnet` trong [hardhat.config.ts](contracts/hardhat.config.ts) bị khóa vào chain ID `11155111`. Deploy cần hai biến bắt buộc; verify source cần thêm Etherscan API key. Có thể đặt tất cả trong `contracts/.env` (đã ignore) hoặc truyền riêng cho phiên PowerShell:

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:FEE_RECEIVER_ADDRESS='0x...'                     # tùy chọn, mặc định là deployer
$env:EXPLORER_BASE_URL='https://sepolia.etherscan.io'  # tùy chọn, chỉ ghi vào manifest
$env:ETHERSCAN_API_KEY='...'                           # chỉ cần khi verify source

npm --prefix contracts run deploy:testnet
npm --prefix contracts run verify:testnet
npm run test:sepolia
```

Source verification chạy trong `contracts/`: `npx hardhat verify --network testnet <address> [constructor args]`.

`verify:testnet` đọc RPC thật rồi đối chiếu chain ID, bytecode từng contract, liên kết token–vault–core, role, grace period, fee receiver, bốn gói và số dư vault. `test:sepolia` gửi giao dịch thật để mở sổ và rút trước hạn.

Deploy một lần là đủ cho cả đồ án. Chạy lại `deploy:testnet` sẽ tạo bộ địa chỉ mới và tốn thêm Sepolia ETH. Các biến `TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY` và `EXPLORER_BASE_URL` có thể đặt trong `contracts/.env` (đã ignore); `hardhat.config.ts` tự nạp file này, nên các lần sau chỉ cần sửa code rồi chạy lại lệnh.

### Deployment đang dùng

| Contract | Địa chỉ trên Sepolia |
| --- | --- |
| `MockUSDC` | [`0x56790fee15a3E0A7921ccc7852a07b8C1E0C8289`](https://sepolia.etherscan.io/address/0x56790fee15a3E0A7921ccc7852a07b8C1E0C8289#code) |
| `VaultManager` | [`0x14BB3b3579f00087127d998d1362f8082F2cDD10`](https://sepolia.etherscan.io/address/0x14BB3b3579f00087127d998d1362f8082F2cDD10#code) |
| `SavingCore` | [`0x215b88d623B6c66fFa1c4778503C2525ff03bc89`](https://sepolia.etherscan.io/address/0x215b88d623B6c66fFa1c4778503C2525ff03bc89#code) |

Deployer kiêm fee receiver: [`0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731`](https://sepolia.etherscan.io/address/0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731). Contract được deploy ở block `12017324`, phần setup (cấp role, mint, approve, nạp vault, tạo bốn gói) kết thúc ở block `12017340`. `verify:testnet` đã đối chiếu 11 setup transaction, bốn gói và số dư vault `100.000 USDC`. Source của cả ba contract đã được verify trên Etherscan; `VaultManager` và `SavingCore` cũng có trên Sourcify. Bản deploy này gồm đủ C1 `claimInterest`, C2 `reservedInterest`, C3 `earlyWithdrawPartial` và C4 `topUpDeposit`.

Giao dịch thật để đối chiếu:

- Deploy `MockUSDC`: [`0xdcf008...e52237`](https://sepolia.etherscan.io/tx/0xdcf00838937f96258eecb965d0076bccc62b0f72fb4ba78caf56d761a5e52237)
- Deploy `VaultManager`: [`0x148e12...2c1a41c`](https://sepolia.etherscan.io/tx/0x148e12d455b2568ee854305141754d0387fc6e0041ea45809194b61d92c1a41c)
- Deploy `SavingCore`: [`0x7d5318...fbae3872`](https://sepolia.etherscan.io/tx/0x7d5318a2070fdb1969353d6c071255be35fc15e0f9f9b06bdc4eb2adfbae3872)
- Cấp `CORE_ROLE`, mint, approve và nạp vault: [`0x017d04...3ce30d2`](https://sepolia.etherscan.io/tx/0x017d042a5083ba6120d95309692cc641efb438eb83e1dd1ae7b857e643ce30d2), [`0x43118c...1ebd884`](https://sepolia.etherscan.io/tx/0x43118cc9b799f1ce1f26f1518ba06af37cf22f63ddb4353c9c667a1fa1ebd884), [`0xf43228...185188c`](https://sepolia.etherscan.io/tx/0xf4322888837fc48332287880645412a408d5519160cf46aa43e5b935e185188c), [`0x4fb9d8...6efa8cb`](https://sepolia.etherscan.io/tx/0x4fb9d8b7aa2a355560c1ca38bce1a33f990b2b0ab793274624fac54416efa8cb)
- Tạo bốn gói: [`0x7d7800...26636f66`](https://sepolia.etherscan.io/tx/0x7d78005cd351781aa72c80fab6367b62c3807b121914a2976f4c883266636f66), [`0x611fdd...f56984ef`](https://sepolia.etherscan.io/tx/0x611fdd6f38fb9407d8cbe7b4edbbc116cb461990ad0a1140fdaa7b2cf56984ef), [`0x18a3c4...5058ef48`](https://sepolia.etherscan.io/tx/0x18a3c4280721cf069aea12040eca46ebac1a135340c67b4932ed00ac5058ef48), [`0xfaaa1f...dfbe6283`](https://sepolia.etherscan.io/tx/0xfaaa1fb65f11622e3e76dd4002b1ae9ba42ce6c7debff6004324d380dfbe6283)
- Smoke mở sổ #1 (100 USDC): [`0x128813...058f020d`](https://sepolia.etherscan.io/tx/0x128813f5c571e0c7c5a401f0d2468700b4f99b7e604ca5876149c843058f020d)
- Rút sớm sổ #1, penalty `2.0 USDC`: [`0xc78667...b4069c999a`](https://sepolia.etherscan.io/tx/0xc78667a36a3943cc8d004863f4740bc6ed271c9dba7ed32ce475a3b4069c999a)
- Mở sổ #2 (500 USDC, gói 90 ngày, còn active): [`0x7a5358...3441ae8bf`](https://sepolia.etherscan.io/tx/0x7a53583af6b71fba1024c492cbea7ff1e3432b8186fd2f3a00e29913441ae8bf)

Các luồng cần tua thời gian (tất toán, tái gửi, auto-renew, nhận lãi chờ) chưa chạy trên Sepolia thật; chúng cần chờ đáo hạn hoặc thêm Sepolia ETH để kiểm thử tiếp. Bản deploy hiện tại chỉ mới được xác nhận bằng `verify:testnet` và smoke test mở sổ/rút sớm.

## Kiến trúc

Ba contract, mỗi cái giữ một loại tiền khác nhau:

| Contract | Giữ gì | Việc chính |
| --- | --- | --- |
| `MockUSDC` | không giữ tiền | ERC-20 6 decimals, `mint` công khai để test |
| `VaultManager` | tiền lãi của ngân hàng | nạp/rút vault, fee receiver, pause, trả lãi cho `SavingCore` |
| `SavingCore` | gốc của người gửi | gói, NFT chứng chỉ, snapshot, tất toán, nhận lãi chờ, nạp thêm, rút sớm toàn bộ/một phần, tái gửi |
| `IVaultManager` | — | interface định kiểu cho các lời gọi từ core sang vault |

Việc tách gốc và lãi không chỉ để cho giống ngân hàng thật. Nếu gộp chung, một sổ đáo hạn sẽ được trả bằng tiền của người gửi sau, tức là mô hình Ponzi thu nhỏ. Ở đây `SavingCore` chỉ trả gốc bằng đúng khoản đã nhận khi mở sổ, còn lãi luôn đi qua `VaultManager`. Với C1, nếu vault thiếu tiền lúc đáo hạn thì gốc vẫn được trả ngay và phần lãi được ghi nợ trong `pendingInterest`; người giữ NFT hiện tại gọi `claimInterest` khi vault đã có tiền. Tái gửi vẫn là giao dịch nguyên tử: vault thiếu lãi thì cả lần tái gửi revert.

Mỗi lần mở sổ, contract lưu một struct `Deposit` gồm `principal`, `aprBpsAtOpen`, `penaltyBpsAtOpen`, `tenorDays`, `openedAt`, `maturityAt`, `status` và `principalSeconds`. Lãi và phạt luôn tính từ bản snapshot này, nên admin sửa gói về sau chỉ ảnh hưởng người mở sổ mới.

Công thức lãi đơn dùng `principalSeconds`, nhờ vậy top-up giữa kỳ (C4) chỉ cộng thêm phần thời gian còn lại:

```text
mở sổ:      principalSeconds = principal × tenorDays × 1 ngày
top-up:     principalSeconds += amount × (maturityAt − block.timestamp)
interest    = principalSeconds × aprBpsAtOpen / (365 × 86_400 × 10_000)
penalty     = amount × penaltyBpsAtOpen / 10_000
```

Năm trạng thái của một sổ là `Active`, `Withdrawn`, `ManualRenewed`, `AutoRenewed` và `PrincipalWithdrawn`. Ba lối ra kết thúc sổ là tất toán, rút sớm toàn bộ và tái gửi thủ công; cả ba đều kiểm tra `status == Active` lẫn `ownerOf(depositId) == msg.sender`. Riêng `autoRenewDeposit` cố tình không chặn người gọi, nhưng vẫn chỉ nhận sổ `Active` và mint chứng chỉ mới cho chủ sở hữu hiện tại của NFT. `claimInterest` chỉ nhận sổ `PrincipalWithdrawn`, còn `topUpDeposit` chỉ nhận sổ `Active` trước đáo hạn.

## Design Answers

Bảy câu trả lời dưới đây ứng với bảy câu hỏi ở mục 8.2 của đề. Mỗi câu bắt đầu bằng cách hiểu đời thường, sau đó dẫn tới đoạn code quyết định và trade-off.

### 1. Alice bán NFT cho Bob thì ai được rút?

Bob. Chứng chỉ là NFT nên quyền rút đi theo người đang giữ NFT, không theo người mở sổ. [`_requireActiveOwner`](contracts/contracts/SavingCore.sol#L410) kiểm tra `ownerOf(depositId) == msg.sender` ở bốn lối ra chính: [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L172), [`earlyWithdraw`](contracts/contracts/SavingCore.sol#L239), [`earlyWithdrawPartial`](contracts/contracts/SavingCore.sol#L263) và [`renewDeposit`](contracts/contracts/SavingCore.sol#L301). [`claimInterest`](contracts/contracts/SavingCore.sol#L200) kiểm tra chủ NFT riêng, còn [`topUpDeposit`](contracts/contracts/SavingCore.sol#L214) dùng chung `_requireActiveOwner`. Auto-renew cũng mint sổ mới cho `ownerOf(depositId)` tại [L339](contracts/contracts/SavingCore.sol#L339). Alice bán xong mà gọi vào sẽ nhận `Core: not certificate owner`.

Đổi lại, NFT là tài sản "ai cầm là của người đó": mất ví hoặc chuyển nhầm là mất quyền rút, ngân hàng không can thiệp được. Được lợi là có thị trường thứ cấp thanh khoản cao cần tiền gấp thì bán sổ thay vì chịu phạt 4%.

### 2. Vault hết tiền lúc đáo hạn thì sao?

Gốc vẫn được trả ngay, lãi được ghi nợ và nhận sau (C1). Hệ thống tách két giữ gốc của khách ([`SavingCore`](contracts/contracts/SavingCore.sol)) khỏi két giữ lãi của ngân hàng ([`VaultManager`](contracts/contracts/VaultManager.sol)). [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L172) thử gọi `payInterest` trong `try/catch` ở [L183](contracts/contracts/SavingCore.sol#L183). Nếu két lãi thiếu tiền, contract chuyển sổ sang `PrincipalWithdrawn`, ghi `pendingInterest[depositId] = interest`, phát `InterestDeferred` và vẫn trả đủ gốc ở [L192](contracts/contracts/SavingCore.sol#L192). Người giữ NFT hiện tại gọi [`claimInterest`](contracts/contracts/SavingCore.sol#L200) khi vault đã được nạp; hàm này xóa khoản nợ trước rồi mới gọi `payInterest`, nên nếu vault vẫn thiếu thì toàn bộ giao dịch revert và người dùng thử lại được. Claim cũng bị chặn khi hệ thống pause.

Điểm mạnh: ngân hàng thiếu quỹ không còn khóa tiền gốc của khách. Đánh đổi: lãi chờ không tự động trả, người dùng phải quay lại claim; frontend hiển thị chứng chỉ ở trạng thái `CHỜ LÃI` cho đến khi claim xong. Tái gửi thủ công và auto-renew vẫn là all-or-nothing vì chúng cần lãi để tạo gốc mới.

### 3. Bot tự động gia hạn chết một tháng thì ai mất gì?

Không ai mất tiền. Bot chỉ là người bấm hộ nút gia hạn: sổ cũ nằm yên ở trạng thái `Active`, không bị xóa và không mất lãi đã chốt. Người dùng vẫn tự rút qua [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L172) hoặc tái gửi qua [`renewDeposit`](contracts/contracts/SavingCore.sol#L301) bất cứ lúc nào, vì hai hàm chỉ cần `block.timestamp >= maturityAt` ([L175](contracts/contracts/SavingCore.sol#L175), [L304](contracts/contracts/SavingCore.sol#L304)) mà không có hạn chót. [`autoRenewDeposit`](contracts/contracts/SavingCore.sol#L330) mở cho mọi người gọi, chỉ cần qua mốc đáo hạn cộng grace ([L334](contracts/contracts/SavingCore.sol#L334)), nên ví người dùng hay bên thứ ba đều thay bot được.

Cái mất là cơ hội: tiền nằm im thêm một tháng. Nếu làm tiếp, tôi sẽ thêm nút "gia hạn ngay" ở mốc grace và chạy thêm một bot dự phòng.

### 4. Phần lẻ khi chia lãi đi đâu?

Với lãi, phần lẻ nằm lại trong vault; với phạt, nó được trả lại cùng gốc cho người rút. Cả hai dùng `Math.mulDiv` trong [`_interestFor`](contracts/contracts/SavingCore.sol#L415) và [`_penaltyFor`](contracts/contracts/SavingCore.sol#L428): nhân trước chia sau, luôn làm tròn xuống, nên số phải trả chỉ nhỏ đi chứ không bao giờ âm. Lãi 2,777... USDC thì trả 2,77, phần dưới một đơn vị 6 decimals ở lại vault.

Lãi tròn về 0 cũng không kẹt: [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L182) có `if (interest > 0)` nên bỏ qua két lãi và trả đủ gốc. Test [`rounds a sub-unit interest amount down without blocking principal withdrawal`](contracts/test/SavingCore.ts#L887) mở sổ 1 đơn vị, APR 1 bps, kỳ hạn 1 ngày và vẫn rút gốc bình thường. Không có sổ kế toán riêng nên phần lẻ không thể bị rút hai lần.

### 5. Đúng giây đáo hạn là rút sớm hay rút đúng hạn?

Là rút đúng hạn. Hợp đồng vạch ranh giới: trước `maturityAt` là sớm, từ mốc đó trở đi là đúng hạn, không có vùng lưng chừng. [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L172) và [`renewDeposit`](contracts/contracts/SavingCore.sol#L301) dùng `>=` ([L175](contracts/contracts/SavingCore.sol#L175), [L304](contracts/contracts/SavingCore.sol#L304)), còn [`earlyWithdraw`](contracts/contracts/SavingCore.sol#L239) dùng `<` ở [L242](contracts/contracts/SavingCore.sol#L242) và [`earlyWithdrawPartial`](contracts/contracts/SavingCore.sol#L263) dùng `<` ở [L266](contracts/contracts/SavingCore.sol#L266). Chọn `>=` để người canh đúng giây đáo hạn không bị phạt oan.

Auto-renew cần `block.timestamp >= maturityAt + gracePeriod` ([L334](contracts/contracts/SavingCore.sol#L334)), nên đúng mốc hết grace là bot đã có thể gia hạn. **Có**, người dùng vẫn tái gửi tay được ở đúng giây cuối grace nếu bot chưa chạy, vì [`renewDeposit`](contracts/contracts/SavingCore.sol#L301) chỉ yêu cầu `>= maturityAt` và không bị giới hạn bởi grace.

### 6. Admin tắt gói trong khi còn sổ đang chạy thì sao?

Các sổ đang chạy không bị gì. Lúc mở sổ, hợp đồng đã lưu snapshot lãi suất, kỳ hạn và mức phạt vào chính sổ đó, nên sửa hay tắt gói về sau chỉ ảnh hưởng người mở mới. [`openDeposit`](contracts/contracts/SavingCore.sol#L153) truyền `plan.aprBps`, `plan.earlyWithdrawPenaltyBps`, `plan.tenorDays` vào sổ ở [L162-L169](contracts/contracts/SavingCore.sol#L162), còn [`setPlanEnabled`](contracts/contracts/SavingCore.sol#L147) chỉ đổi cờ `enabled` ở [L149](contracts/contracts/SavingCore.sol#L149). Người có sổ cũ vẫn tất toán, rút sớm (toàn bộ hoặc một phần) theo mức cũ, hoặc tái gửi sang gói khác đang mở.

Hai ngoại lệ: tái gửi tay vào gói đã tắt bị chặn vì [`renewDeposit`](contracts/contracts/SavingCore.sol#L301) đòi `newPlan.enabled` ở [L308](contracts/contracts/SavingCore.sol#L308); auto-renew vẫn dùng gói gốc ([`autoRenewDeposit`](contracts/contracts/SavingCore.sol#L330) đọc `deposit.planId` ở [L342](contracts/contracts/SavingCore.sol#L342)) vì đó là cam kết với khách cũ.

### 7. Một cuộc tấn công thực tế và cách chặn

Kịch bản tôi chọn là rút hai lần, kể cả gọi lồng trong lúc giao dịch đầu chưa xong (reentrancy). Bốn lớp chặn trong code:

1. Tám hàm động vào tiền (`openDeposit` [L153](contracts/contracts/SavingCore.sol#L153), `withdrawAtMaturity` [L172](contracts/contracts/SavingCore.sol#L172), `claimInterest` [L200](contracts/contracts/SavingCore.sol#L200), `topUpDeposit` [L214](contracts/contracts/SavingCore.sol#L214), `earlyWithdraw` [L239](contracts/contracts/SavingCore.sol#L239), `earlyWithdrawPartial` [L263](contracts/contracts/SavingCore.sol#L263), `renewDeposit` [L301](contracts/contracts/SavingCore.sol#L301), `autoRenewDeposit` [L330](contracts/contracts/SavingCore.sol#L330)) đều gắn `nonReentrant`, nên lời gọi lồng bị chặn ngay.
2. Trạng thái đổi trước khi chuyển tiền ([L179](contracts/contracts/SavingCore.sol#L179) trước [L192](contracts/contracts/SavingCore.sol#L192); [L248](contracts/contracts/SavingCore.sol#L248) trước [L253-L258](contracts/contracts/SavingCore.sol#L253)), nên lần rút thứ hai dừng ở [`_requireActiveOwner`](contracts/contracts/SavingCore.sol#L410) với `Core: deposit inactive`. `claimInterest` xóa `pendingInterest` trước khi gọi vault, còn `earlyWithdrawPartial` giảm `principal` và `principalSeconds` trước khi chuyển tiền, nên không thể rút lại phần đã rút.
3. Két lãi chỉ nhận lệnh từ `SavingCore` ([`payInterest`](contracts/contracts/VaultManager.sol#L78), `reserveInterest`, `releaseInterest` đều đòi `CORE_ROLE`), còn `asset` và `vault` là `immutable` nên không tráo được contract giả sau deploy.
4. C2 giữ một sổ `reservedInterest`: admin chỉ rút được phần chưa hứa ([`withdrawVault`](contracts/contracts/VaultManager.sol#L48) chặn ở [L52-L53](contracts/contracts/VaultManager.sol#L52)), và `payInterest` từ chối khoản chưa reserve. Nhờ vậy admin không thể rút cạn đúng phần lãi đang nợ các sổ.

Điểm yếu còn lại: reservation là sổ kế toán trong cùng một vault, không phải escrow riêng; nếu admin rút hết phần chưa reserve rồi một sổ mới mở, vault có thể under-collateralized. Khi đó claim/renew revert cho đến khi admin nạp thêm, nhưng gốc vẫn rút được nhờ C1. Admin cũng có quyền pause và đổi fee receiver, nên vẫn là trusted role.

## Creative Challenge C3 — Rút sớm một phần

**Vấn đề.** `earlyWithdraw` là all-or-nothing: cần 10% tiền vẫn phải đóng cả sổ và chịu phạt 4% trên toàn bộ gốc.

**Cách làm.** Thêm [`earlyWithdrawPartial`](contracts/contracts/SavingCore.sol#L263) vào `SavingCore`:
- Chỉ chạy trước `maturityAt`, khi sổ `Active` và ví gọi là chủ NFT hiện tại.
- Phạt tính trên đúng phần rút bằng [`_penaltyForAmount`](contracts/contracts/SavingCore.sol#L424); phần còn lại `principal - amount` phải `>= minDeposit` của gói ở [L271-L274](contracts/contracts/SavingCore.sol#L271), nếu không revert `Core: remaining below minimum`.
- Không đổi APR, penalty, tenor hay `maturityAt`; NFT giữ nguyên, chỉ giảm `principal`. Phần đã rút không sinh lãi; lãi đáo hạn tính trên phần còn lại.
- Phát event `PartialEarlyWithdrawn(depositId, owner, amount, penalty, remainingPrincipal)`.

Ví dụ: sổ 1.000 USDC ở gói min 500, rút sớm 200 → phạt 8 USDC, nhận 192, còn 800 tiếp tục đến đáo hạn cũ. Sổ 500 rút 200 → còn 300 < min 500 nên revert; muốn thoát phải dùng `earlyWithdraw` toàn bộ.

**Đánh đổi.**
- Một NFT, một `depositId`; không tạo tranche mới, nên lịch sử thay đổi phải đọc từ event.
- Không thể rút số tiền làm phần còn lại dưới min; đây là invariant của gói, không phải lỗi.
- Lãi tương lai giảm theo phần gốc còn lại; phần đã rút không có lãi.
- Frontend đã nối trong dialog rút trước hạn: mặc định rút toàn bộ, nhập số nhỏ hơn thì gọi `earlyWithdrawPartial` và hiển thị phần còn lại/min.
- Bản deploy Sepolia `12017324`/`12017340` đã gồm C3 và source của cả ba contract đã verify trên Etherscan.

**Test.** 11 case mới trong [contracts/test/SavingCore.ts](contracts/test/SavingCore.ts#L257), gồm penalty trên phần rút, giữ snapshot, min còn lại, owner/NFT, pause, penalty 0/100%, lãi đáo hạn trên phần còn lại và full withdrawal sau partial.

## Creative Challenge C1 — Trả gốc ngay, ghi nợ lãi

**Vấn đề.** Đề gốc bắt `withdrawAtMaturity` revert nếu vault thiếu lãi. Như vậy tiền gốc của khách bị khóa bởi một khoản tiền mà ngân hàng nợ, dù gốc vẫn nằm đủ trong `SavingCore`.

**Cách làm.**
- [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L172) bọc `vault.payInterest` trong `try/catch`. Nếu vault trả được, sổ thành `Withdrawn` như cũ.
- Nếu vault revert, sổ thành `PrincipalWithdrawn`, `pendingInterest[depositId] = interest` và event `InterestDeferred` được phát. Gốc vẫn được chuyển ngay cho chủ NFT.
- [`claimInterest`](contracts/contracts/SavingCore.sol#L200) cho chủ NFT hiện tại nhận đúng khoản đã ghi nợ. Hàm xóa `pendingInterest` trước rồi mới gọi vault, nên vault vẫn thiếu thì cả giao dịch revert và người dùng thử lại được; claim bị chặn khi pause.
- Khoản lãi chờ vẫn nằm trong `reservedInterest` của vault, nên C2 không cho admin rút phần đó.

**Đánh đổi.**
- Người dùng phải quay lại claim; lãi không tự động chuyển vào ví.
- Sổ đã trả gốc không còn dùng để tái gửi hay rút tiếp, chỉ còn quyền claim lãi.
- Tái gửi thủ công và auto-renew vẫn revert khi vault thiếu lãi, vì chúng cần lãi để tạo gốc mới.

**Test.** Năm case trong [contracts/test/SavingCore.ts](contracts/test/SavingCore.ts#L513): trả gốc và ghi nợ khi vault thiếu, claim sau khi nạp vault, claim đi theo NFT khi chuyển chủ, pause chặn claim, và sổ `PrincipalWithdrawn` không dùng lại được cho lối ra đáo hạn. Luồng UI đã chạy local: sổ 500.000 USDC trả gốc, lãi 20.000 USDC chờ, claim bị chặn khi vault thiếu, claim thành công sau khi nạp 25.000 USDC và chứng chỉ biến mất khỏi danh sách.

## Creative Challenge C2 — Khóa phần lãi đã hứa

**Vấn đề.** Nếu admin rút tự do, admin có thể rút đúng khoản lãi đang nợ các sổ active. Người gửi vẫn thấy lãi dự kiến trên UI nhưng đến đáo hạn mới biết vault trống.

**Cách làm.**
- [`VaultManager`](contracts/contracts/VaultManager.sol) thêm biến `reservedInterest`, cộng dồn mọi khoản lãi đã hứa.
- `SavingCore` gọi [`reserveInterest`](contracts/contracts/VaultManager.sol#L65) khi mở sổ, khi top-up thêm lãi, và [`releaseInterest`](contracts/contracts/VaultManager.sol#L71) khi rút sớm toàn bộ hoặc giảm gốc một phần. Cả hai hàm chỉ nhận `CORE_ROLE`.
- [`payInterest`](contracts/contracts/VaultManager.sol#L78) từ chối khoản chưa reserve và trừ `reservedInterest` khi trả thành công.
- [`withdrawVault`](contracts/contracts/VaultManager.sol#L48) chỉ cho admin rút `balance − reservedInterest`; nếu `balance < reservedInterest` thì revert `Vault: undercollateralized` cho đến khi nạp thêm.

Frontend không có màn hình C2 riêng vì đây là kế toán nội bộ của vault. UI chỉ đọc số dư vault để khóa nút **Nhận lãi** khi vault chưa đủ tiền trả khoản đã ghi nợ.

**Đánh đổi.**
- Đây là sổ kế toán, không phải escrow riêng: tiền vẫn nằm chung trong một địa chỉ vault, và reserve không kiểm tra số dư lúc reserve. Vault có thể under-collateralized nếu admin rút hết phần chưa hứa rồi có sổ mới mở; C1 đảm bảo gốc vẫn rút được trong tình huống đó.
- Reserve là con số lãi đơn đã chốt, không phải chiến lược đầu tư hay lãi kép.
- Admin vẫn là trusted role: có thể pause, đổi fee receiver và nạp/rút phần chưa hứa.

**Test.** Bốn case trong [contracts/test/VaultManager.ts](contracts/test/VaultManager.ts#L119): chỉ core role reserve/release, cap rút admin theo phần chưa hứa, chặn rút khi reserve vượt số dư, và release đúng khi rút sớm toàn bộ/một phần. Các case mở sổ, top-up, tất toán trong `SavingCore.ts` cũng kiểm tra `reservedInterest` tăng/giảm tương ứng.

## Creative Challenge C4 — Nạp thêm vào sổ đang chạy

**Vấn đề.** Sổ đã mở là all-or-nothing: muốn gửi thêm phải mở sổ mới, mất ngày đáo hạn cũ và phải chốt APR mới.

**Cách làm.**
- `Deposit` thêm `principalSeconds`. Lúc mở sổ, giá trị này bằng `principal × tenorDays × 1 ngày`; lãi vẫn tính bằng `principalSeconds × aprBpsAtOpen / (365 ngày × 10.000)`.
- [`topUpDeposit`](contracts/contracts/SavingCore.sol#L214) chỉ chạy khi sổ `Active`, trước đáo hạn, đúng chủ NFT và hệ thống không pause. Contract nhận thêm gốc, cộng `amount × (maturityAt − block.timestamp)` vào `principalSeconds`, rồi reserve đúng phần lãi tăng thêm.
- Kỳ hạn, APR, penalty và `maturityAt` giữ nguyên; top-up không mint NFT mới và không đổi `depositId`.
- `principalSeconds` giảm pro-rata khi [`earlyWithdrawPartial`](contracts/contracts/SavingCore.sol#L263) rút bớt gốc, nên phần đã rút không tiếp tục sinh lãi.
- Tái gửi sổ đã top-up dùng tổng lãi theo `principalSeconds` để tạo gốc mới, giống mọi sổ khác.

Ví dụ: sổ 1.000 USDC kỳ 90 ngày, top-up 500 USDC sau 30 ngày. 500 USDC mới chỉ sinh lãi cho 60 ngày còn lại, không được hưởng 90 ngày. Giới hạn `maxDeposit` của gói gốc vẫn áp trên tổng gốc sau top-up.

**Đánh đổi.**
- Không có tranche riêng: lịch sử top-up phải đọc từ event `DepositToppedUp`, và mọi khoản gốc dùng chung một APR snapshot.
- Không thể top-up sau đáo hạn; muốn gửi thêm lúc đó phải tái gửi hoặc mở sổ mới.
- Top-up cộng dồn vào `principal`, nên rút sớm sau đó tính penalty trên toàn bộ gốc còn lại theo snapshot ban đầu.

**Test.** Bốn case trong [contracts/test/SavingCore.ts](contracts/test/SavingCore.ts#L615): top-up giữa kỳ với lãi theo principal-seconds và reserve tăng đúng, chặn sai chủ/zero/vượt max/pause/sau đáo hạn, giảm pro-rata sau rút sớm một phần, và tái gửi sổ đã top-up. UI local đã chạy: preview 3,64 USDC cho top-up 1.000 USDC, toast cộng lãi, gốc và lãi dự kiến cập nhật; lần top-up thứ hai ở bản EN preview 2,77 USDC.

## Những phần chưa làm

- Các flow Sepolia thật còn lại: rút sớm một phần, nạp thêm, nhận lãi chờ, tất toán, tái gửi và auto-renew. Smoke test hiện chỉ mới mở sổ và rút sớm toàn bộ; cần thêm Sepolia ETH để chạy tiếp.
- Video demo 3–5 phút theo yêu cầu mục 11 của đề.
- Walkthrough MetaMask thật với bản deploy Sepolia mới; các lần kiểm thử giao diện trước đây dùng injected provider.
- Creative challenge C5. C1, C2, C3 và C4 đã làm; C5 chưa được triển khai.
- Ví khác ngoài MetaMask. Adapter chỉ dùng EIP-1193 nên ví khác có thể chạy được, nhưng tôi mới kiểm thử với MetaMask.

## Lệnh thường dùng

| Lệnh | Việc nó làm |
| --- | --- |
| `npm run dev` | chạy Vite ở cổng 5173 |
| `npm run build` | typecheck và build production cho frontend |
| `npm run lint` | chạy oxlint |
| `npm test` | chạy 58 test Hardhat |
| `npm run coverage` | chạy test kèm báo cáo coverage |
| `npm run contracts:typecheck` | kiểm tra TypeScript của phần contract |
| `npm run contracts:compile` | compile contract bằng Hardhat |
| `npm run contracts:export-abis` | compile rồi sinh lại `frontend/src/contracts/abis.ts` |
| `npm run deploy:local` | deploy lên Hardhat node ở `127.0.0.1:8545` |
| `npm run verify:local` | đối chiếu deployment local với manifest |
| `npm run deploy:testnet` | deploy lên Sepolia |
| `npm run verify:testnet` | xác thực deployment Sepolia |
| `npm run test:sepolia` | gửi giao dịch thật lên Sepolia |
| `npm run configure:frontend -- testnet` | ghi `frontend/.env.local` từ manifest |

Muốn chạy toàn bộ ở máy không có Sepolia, dùng ba terminal. Terminal 1 giữ node bằng `npm --prefix contracts run node`. Terminal 2 deploy và cấu hình:

```powershell
npm --prefix contracts run deploy:local
npm --prefix contracts run verify:local
npm --prefix contracts run configure:frontend -- localhost
```

Terminal 3 chạy `npm run dev`. Nhớ thêm mạng `http://127.0.0.1:8545` với chain ID `31337` vào MetaMask và import một tài khoản test do Hardhat in ra. Địa chỉ local mất khi node tắt, nên đừng dùng nó trong video demo.

