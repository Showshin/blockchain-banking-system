# TÍCH — Sổ tiết kiệm kỳ hạn on-chain

[![Tiếng Việt](https://img.shields.io/badge/VN-Ti%E1%BA%BFng_Vi%E1%BB%87t-111827?style=flat-square)](README.md) [![English](https://img.shields.io/badge/EN-English-d1d5db?style=flat-square)](README.en.md)

TÍCH là một dự án sổ tiết kiệm có kỳ hạn được triển khai bằng smart contract. Người gửi nạp MockUSDC, nhận chứng chỉ NFT (ERC-721) đại diện cho khoản tiền gửi và hưởng lãi đơn theo APR được cố định tại thời điểm mở sổ. Người gửi có thể nạp thêm gốc, tất toán đúng hạn, rút trước hạn và chịu phạt, nhận phần lãi còn chờ hoặc tái gửi sang kỳ hạn mới.

Giao diện React + TypeScript kết nối ví injected qua EIP-6963 (MetaMask là mặc định; Rabby, Coinbase Wallet, Brave và các ví injected khác cũng dùng được) và đọc/ghi trực tiếp lên ba contract. Sau khi kết nối, số dư, gói tiết kiệm và sổ đều được đọc từ chain; trong thời gian chờ RPC, giao diện hiển thị trạng thái đang tải.

## Trạng thái hiện tại

| Phạm vi | Trạng thái |
| --- | --- |
| Mã nguồn và kiểm thử | Triển khai đủ C1–C4. 74/74 kiểm thử đạt, độ bao phủ 100% dòng và câu lệnh; `contracts:typecheck`, `build` và `lint` đều đạt. |
| Sepolia công khai | Triển khai ngày 2026-10-29 với 5 gói, vault `100.000 USDC` và 12 giao dịch thiết lập. Cả ba contract đã được xác thực trên Etherscan; Sourcify đạt `exact_match` cho `VaultManager`/`SavingCore` và `match` cho `MockUSDC`. |
| Kiểm thử E2E trên Sepolia | Giai đoạn `immediate` hoàn tất ngày 2026-10-29: mở sổ, nạp thêm gốc, rút sớm một phần, kiểm tra pause/role/reserve, rút sớm toàn bộ, chuyển NFT và kiểm tra invariant. Hai giai đoạn `mature` và `auto-renew` đã sẵn sàng nhưng phải chờ thời gian thực của chain. |
| Walkthrough MetaMask | Ngày 2026-10-29, ví `0xE197…f731` mở sổ #8, nạp thêm, rút sớm một phần rồi rút sớm toàn bộ trực tiếp trên giao diện; đổi ngôn ngữ VI↔EN giữ nguyên sau khi tải lại. Chi tiết và hash ở mục walkthrough bên dưới. |
| Chưa hoàn tất | Chạy `mature` từ 2026-10-30 08:21 UTC và `auto-renew` từ 2026-11-02 08:21 UTC; tất toán và tái gửi trên giao diện sau đáo hạn; nhận lãi chờ cần vault thiếu tiền nên chỉ kiểm thử ở bộ unit test; video demo 3–5 phút. |

## Thông số cá nhân

MSSV **22665321** lấy hai chữ số cuối: `A = 1` (chữ số hàng đơn vị) và `B = 2` (chữ số hàng chục).

| Tham số | Công thức | Giá trị | Diễn giải |
| --- | --- | --- | --- |
| Grace period | `(A mod 3) + 2` ngày | 3 ngày (259.200 giây) | Thời gian chờ 3 ngày sau đáo hạn trước khi được auto-renew |
| APR mặc định | `200 + A × 25` bps | 225 bps = 2,25%/năm | 100 bps tương đương 1% |
| Phạt rút sớm | `300 + B × 50` bps | 400 bps = 4,00% | Tính trên phần gốc được rút ra |
| Kỳ hạn mặc định | `B` chẵn → 90 ngày | 90 ngày | Áp dụng cho gói mặc định |

Nguồn duy nhất là [contracts/config/personal.ts](contracts/config/personal.ts). Kiểm thử, script deploy và manifest đều đọc từ đây. Grace period là tham số constructor `immutable` nên không thể sửa sau khi deploy; muốn đổi MSSV phải triển khai bộ contract mới.

## Công nghệ

| Lớp | Công nghệ | Phiên bản |
| --- | --- | --- |
| Runtime | Node.js | 22.22.2 (LTS) |
| Contract | Solidity / Hardhat | 0.8.38 / 3.21.1 |
| Contract | OpenZeppelin Contracts | 5.6.1 |
| Kiểm thử | Mocha / Chai / ethers | 12.0.3 / 6.3.0 / 6.17.0 |
| Frontend | React / Vite | 19.3.1 / 8.3.5 |
| Frontend | TypeScript / Tailwind CSS | 7.0.2 / 4.3.3 |
| Frontend | ethers / React Router | 6.17.0 / 7.18.5 |

`package.json` ở gốc yêu cầu `engines.node >= 22.12`, mức tối thiểu của Vite 8. Bộ kiểm thử và bản build đã chạy trên Node 22.22.2.

## Cài đặt

```powershell
npm install
npm --prefix contracts install
npm --prefix frontend install
```

## Cấu hình frontend

`configure:frontend` chỉ nhận `testnet`, đọc [contracts/deployments/testnet.json](contracts/deployments/testnet.json) rồi ghi `frontend/.env.local`:

```powershell
npm run configure:frontend -- testnet
```

Nội dung được sinh ra cho bản đang sử dụng:

```text
VITE_CHAIN_ID=11155111
VITE_DEPLOY_BLOCK=12018179
VITE_CORE_ADDRESS=0xC5Dd267CfefC629E722110F8086c0DDc33a5a302
VITE_VAULT_ADDRESS=0xA128175f2C1099Ecc3933876a3d0BF931816867C
VITE_USDC_ADDRESS=0x1fFa8aF3aF716E245A5501B086d1C01375F192fc
```

Chỉ địa chỉ công khai và chain ID nằm trong biến `VITE_*`; private key không bao giờ đặt ở đây vì mọi biến có tiền tố `VITE_` đều được đóng gói vào bundle. MetaMask ký giao dịch trong trình duyệt. Nếu thiếu một trong ba địa chỉ, [config.ts](frontend/src/contracts/config.ts) báo lỗi cấu hình thay vì gọi contract.

## Khởi chạy giao diện

```powershell
npm run dev
```

Mở `http://127.0.0.1:5173/`, chọn **Kết nối ví**, chọn MetaMask (hoặc ví injected khác đang bật trong trình duyệt) và chuyển sang **Sepolia** (chain ID `11155111`, danh sách RPC có tại [chainlist.org/chain/11155111](https://chainlist.org/chain/11155111)). Khi ví chưa có Sepolia, giao diện tự đề nghị thêm mạng; nếu ví đang ở mạng khác, mở hộp thoại ví và bấm **Chuyển sang Sepolia**.

Thêm token để hiển thị số dư cạnh địa chỉ ví: contract `0x1fFa8aF3aF716E245A5501B086d1C01375F192fc`, symbol `USDC`, decimals `6`. MockUSDC là token dùng cho kiểm thử và hàm `mint` mở công khai, nên ví chưa có tiền vẫn có thể nhận token: gọi `mint` trên Etherscan Write Contract với số lượng theo 6 decimals (1.000 USDC = `1000000000`). Ví cũng cần Sepolia ETH để trả phí gas; danh sách faucet có trong chainlist hoặc tại [sepoliafaucet.com](https://sepoliafaucet.com).

Luồng chính: tại **Gói tiết kiệm**, chọn kỳ hạn và mở sổ (lần đầu cần gọi `approve` cho USDC, sau đó gọi `openDeposit`); tại **Sổ của tôi**, xem NFT và thực hiện tất toán, rút trước hạn toàn bộ hoặc một phần, nạp thêm gốc, nhận lãi chờ hay tái gửi.

## Kiểm thử

```powershell
npm test
npm run coverage
npm run contracts:typecheck
npm run build
npm run lint
```

Kết quả lần chạy gần nhất (2026-10-29):

```text
74 passing
MockUSDC       100.00% lines / 100.00% statements
VaultManager   100.00% lines / 100.00% statements
SavingCore     100.00% lines / 100.00% statements
Total          100.00% lines / 100.00% statements
```

Bộ kiểm thử bao phủ các luồng bắt buộc và những trường hợp dễ phát sinh lỗi: thiếu allowance, snapshot APR sau khi sửa gói, mốc biên đáo hạn/grace, rút hai lần, pause chặn mọi cách rút, chuyển NFT đổi chủ, penalty 0/100% và lãi làm tròn xuống 0.

- **C1:** trả gốc và ghi nợ lãi khi vault thiếu tiền; claim sau khi nạp vault; claim đi theo NFT; pause chặn claim; sổ `PrincipalWithdrawn` không được dùng lại cho việc tất toán.
- **C2:** chỉ `SavingCore` giữ `CORE_ROLE`; admin không thể grant/revoke role sau khi khóa; reserve vượt số dư bị chặn; `withdrawVault` bị giới hạn ở `balance − reservedInterest`; khi vault mất dự trữ, admin không thể rút; release đúng khi rút sớm toàn bộ hoặc một phần.
- **C3:** 11 trường hợp rút sớm một phần.
- **C4:** nạp thêm giữa kỳ, nhiều lần nạp thêm, giảm gốc theo tỷ lệ và tái gửi sổ đã nạp thêm.

### E2E trên Sepolia thật

`contracts/scripts/e2e` gồm ba giai đoạn độc lập, lưu tiến độ trong `contracts/deployments/testnet.e2e.json` (đã ignore) và chỉ sử dụng chain ID `11155111`:

```powershell
npm run test:sepolia            # immediate
npm run test:sepolia:status     # đọc lại trạng thái, kiểm tra mốc thời gian
npm run test:sepolia:mature     # sau đáo hạn
npm run test:sepolia:auto-renew # sau đáo hạn + grace
```

Kết quả giai đoạn `immediate` ngày 2026-10-29: 19 giao dịch thật với tổng gas `77.866.819.359` wei. Script đã kiểm tra:

- Mở D1 gói 30 ngày `100 USDC`, nạp thêm `50 USDC`, rút sớm một phần `40 USDC` và chặn trường hợp phần còn lại thấp hơn mức tối thiểu.
- Pause vault chặn mở sổ, nạp thêm và rút sớm; unpause khôi phục trạng thái bình thường.
- `setCoreOnce` lần thứ hai, `grantRole(CORE_ROLE)` và `reserveInterest` từ deployer đều revert.
- `withdrawVault` vượt phần chưa hứa bị chặn; việc rút và hoàn lại `1 USDC` giữ nguyên số dư vault.
- Rút sớm toàn bộ D1; khoản phạt `2,2 USDC` (2% trên `110 USDC` còn lại) được chuyển đúng fee receiver.
- Mở T1–T6 gói 1 ngày; rút sớm một phần T2; nạp thêm gốc vào T3; chuyển NFT T4 sang tài khoản thứ hai.
- `reservedInterest` luôn bằng tổng lãi của các sổ đang hoạt động cộng với lãi chờ, và số dư vault luôn đủ để bảo đảm các khoản đã hứa.

Sổ T1 (chứng chỉ #2) đã được rút sớm trên chain lúc `2026-10-29 08:40 UTC` (tx [`0x09a8cc...2c94`](https://sepolia.etherscan.io/tx/0x09a8ccc2e70cdd4dd3a5d91a1b0ec6b4dae0c3362f15560f7d9d3abbe44c2c94)), ngoài kịch bản `immediate`; giai đoạn `mature` sẽ bỏ qua T1, tất toán T2–T4, tái gửi T6 sang gói 90 ngày và cho chủ mới của T4 rút. Giai đoạn `auto-renew` sẽ gia hạn T5 sau grace. Hai giai đoạn này không thể chạy sớm hơn thời gian thực của chain; `test:sepolia:status` in rõ mốc thời gian sớm nhất.

### Walkthrough giao diện với MetaMask

Ngày 2026-10-29, ví `0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731` thao tác trực tiếp trên giao diện, mạng Sepolia:

- Mở sổ #8, gói 1 ngày, `20 USDC`, APR `0,50%`: tx [`0xcc27ba...9b78`](https://sepolia.etherscan.io/tx/0xcc27ba3cc38e3c573b629181591e1b46e7cb76cd3d8e1bdfc9de22b1cd799b78).
- Nạp thêm `10 USDC`, gốc mới `30 USDC`: tx [`0xddf627...9378`](https://sepolia.etherscan.io/tx/0xddf627314360b3192a4af405310fd417653a1953b276d41ae147fa27254a9378).
- Rút sớm một phần `10 USDC`, phạt `0,10 USDC`, còn `20 USDC`: tx [`0x3d4e93...e4a`](https://sepolia.etherscan.io/tx/0x3d4e93ed7453722f4247bc5e55e733cb1c221ad4b7b30b0bd2569354fed86e4a).
- Rút sớm toàn bộ `20 USDC`, phạt `0,20 USDC`, thực nhận `19,80 USDC`: tx [`0x37ec17...4a28`](https://sepolia.etherscan.io/tx/0x37ec175dd807d21e0e197085cef897128ce76895cf11af28ceae1908ae6a4a28).
- Đổi ngôn ngữ VI↔EN, giữ nguyên sau khi tải lại; kiểm tra trạng thái rỗng, trạng thái đang tải và lỗi số tiền dưới mức tối thiểu ở cả hai ngôn ngữ.

Tất toán, nhận lãi chờ, tái gửi và auto-renew chưa chạy được trên giao diện: các sổ đang hoạt động đáo hạn `2026-10-30 08:20–09:31 UTC`, còn `claimInterest` chỉ xuất hiện khi vault thiếu tiền, trong khi bản triển khai hiện đang nạp đủ.

## Kiến trúc

| Contract | Lưu giữ | Chức năng chính |
| --- | --- | --- |
| `MockUSDC` | không giữ tiền | ERC-20 6 decimals, `mint` công khai để kiểm thử |
| `VaultManager` | tiền lãi của ngân hàng | nạp/rút vault, fee receiver, pause, reserve/release/pay interest |
| `SavingCore` | gốc của người gửi | gói, NFT chứng chỉ, snapshot, tất toán, claim, nạp thêm, rút sớm, tái gửi |
| `IVaultManager` | — | interface định nghĩa kiểu dữ liệu cho các lời gọi từ core sang vault |

Gốc và lãi được tách riêng để việc tất toán một sổ không phải lấy từ tiền gốc của những người gửi khác. `SavingCore` chỉ trả gốc đúng bằng khoản đã nhận khi mở sổ; mọi khoản lãi đều đi qua `VaultManager`. Với C1, nếu vault thiếu tiền tại thời điểm đáo hạn, gốc vẫn được trả ngay và lãi được ghi nợ trong `pendingInterest`; chủ NFT hiện tại gọi `claimInterest` khi vault có tiền. Tái gửi vẫn mang tính nguyên tử: nếu vault thiếu lãi, toàn bộ giao dịch tái gửi revert.

Mỗi sổ lưu `principal`, `aprBpsAtOpen`, `penaltyBpsAtOpen`, `tenorDays`, `openedAt`, `maturityAt`, `status` và `principalSeconds`; sửa gói về sau chỉ ảnh hưởng sổ mới.

```text
mở sổ:      principalSeconds = principal × tenorDays × 1 ngày
nạp thêm:   principalSeconds += amount × (maturityAt − block.timestamp)
interest    = principalSeconds × aprBpsAtOpen / (365 × 86_400 × 10_000)
penalty     = amount × penaltyBpsAtOpen / 10_000
```

Năm trạng thái: `Active`, `Withdrawn`, `ManualRenewed`, `AutoRenewed`, `PrincipalWithdrawn`. Ba cách kết thúc sổ là tất toán, rút sớm toàn bộ và tái gửi thủ công; cả ba đều kiểm tra `status == Active` và `ownerOf(depositId) == msg.sender`. `topUpDeposit` chỉ áp dụng cho sổ `Active` trước đáo hạn. `claimInterest` chỉ áp dụng cho sổ `PrincipalWithdrawn`.

## Design Answers

Bảy câu dưới đây ứng với mục 8.2 của đề. Mỗi câu trình bày quy tắc, quyết định trong code và đánh đổi.

### 1. Nếu Alice chuyển nhượng NFT cho Bob thì ai có quyền rút?

Bob. Vì chứng chỉ là NFT, quyền rút thuộc về người đang sở hữu NFT. `_requireActiveOwner` kiểm tra `ownerOf(depositId) == msg.sender` trong `withdrawAtMaturity`, `earlyWithdraw`, `earlyWithdrawPartial` và `renewDeposit`; `claimInterest` kiểm tra chủ NFT riêng; `topUpDeposit` dùng chung `_requireActiveOwner`. Auto-renew mint sổ mới cho chủ NFT hiện tại. Nếu Alice gọi sau khi đã chuyển nhượng, giao dịch sẽ revert với lỗi `Core: not certificate owner`.

Đánh đổi: nếu mất ví hoặc chuyển nhầm, quyền rút cũng mất và ngân hàng không thể can thiệp. Ngược lại, người cần tiền gấp có thể bán sổ trên thị trường thứ cấp thay vì chịu mức phạt 4%.

### 2. Điều gì xảy ra nếu vault thiếu tiền tại thời điểm đáo hạn?

Gốc vẫn được trả ngay, còn lãi được ghi nợ và nhận sau (C1). `withdrawAtMaturity` bọc lời gọi `vault.payInterest` trong `try/catch`; nếu vault revert, sổ chuyển sang `PrincipalWithdrawn`, lãi được ghi vào `pendingInterest[depositId]`, phát sự kiện `InterestDeferred` và gốc vẫn được trả đủ. Chủ NFT hiện tại gọi `claimInterest` khi vault được nạp tiền. Hàm xóa khoản nợ trước khi gọi vault; nếu vault vẫn thiếu tiền, toàn bộ giao dịch revert và người dùng có thể thử lại. Claim cũng bị chặn khi hệ thống pause.

Đánh đổi: lãi chờ không tự động chuyển vào ví nên người dùng phải quay lại claim; frontend hiển thị trạng thái `CHỜ LÃI`. Tái gửi thủ công và auto-renew vẫn theo cơ chế tất cả hoặc không (all-or-nothing) vì cần lãi để tạo gốc mới.

### 3. Nếu bot tự động gia hạn ngừng hoạt động một tháng thì ai chịu thiệt hại?

Không ai mất tiền. Bot chỉ gọi hàm gia hạn thay người dùng: sổ cũ giữ nguyên trạng thái `Active`, không bị xóa và không mất phần lãi đã được ghi nhận. Người dùng vẫn có thể tự rút bằng `withdrawAtMaturity` hoặc tái gửi bằng `renewDeposit` bất cứ lúc nào sau đáo hạn. Vì `autoRenewDeposit` cho phép bất kỳ địa chỉ nào gọi sau mốc đáo hạn cộng grace, ví của người dùng hoặc bên thứ ba đều có thể thay bot.

Tác động duy nhất là khoản tiền tiếp tục nằm trong sổ thêm một tháng thay vì được gia hạn. Nếu phát triển tiếp, có thể bổ sung nút gia hạn ngay tại mốc grace và một bot dự phòng.

### 4. Phần dư khi chia lãi được xử lý như thế nào?

Đối với lãi, phần dư nằm lại trong vault; đối với phạt, phần dư được trả lại cùng gốc cho người rút. Cả hai dùng `Math.mulDiv` trong `_interestFor` và `_penaltyFor`: nhân trước chia sau và luôn làm tròn xuống, nên số phải trả chỉ nhỏ đi chứ không bao giờ âm. Khoản lãi 2,777... USDC được trả 2,77 USDC; phần dưới một đơn vị 6 decimals ở lại vault.

Trường hợp lãi làm tròn về 0 cũng không gây mắc kẹt: `withdrawAtMaturity` có `if (interest > 0)` nên bỏ qua vault và trả đủ gốc. Kiểm thử mở sổ 1 đơn vị với APR 1 bps, kỳ hạn 1 ngày và vẫn rút gốc bình thường. Không có sổ kế toán riêng nên phần dư không thể bị rút hai lần.

### 5. Giao dịch tại đúng thời điểm đáo hạn được tính là rút sớm hay đúng hạn?

Được tính là rút đúng hạn. Trước `maturityAt` là rút sớm; từ mốc đó trở đi là đúng hạn, không tồn tại khoảng chuyển tiếp. `withdrawAtMaturity` và `renewDeposit` dùng `>=`; `earlyWithdraw` và `earlyWithdrawPartial` dùng `<`. Việc dùng `>=` bảo đảm người tất toán đúng thời điểm đáo hạn không bị tính phạt sai.

Auto-renew yêu cầu `block.timestamp >= maturityAt + gracePeriod`, nên đúng mốc hết grace là có thể gia hạn. Người dùng vẫn tái gửi thủ công được ở giây cuối của grace nếu bot chưa chạy, vì `renewDeposit` chỉ yêu cầu `>= maturityAt` và không phụ thuộc grace.

### 6. Điều gì xảy ra nếu admin tắt gói trong khi vẫn còn sổ đang hoạt động?

Sổ đang hoạt động không bị ảnh hưởng. Khi mở sổ, contract đã lưu snapshot APR, kỳ hạn và mức phạt vào chính sổ đó, nên việc sửa hay tắt gói về sau chỉ ảnh hưởng đến các sổ mở mới. `setPlanEnabled` chỉ thay đổi cờ `enabled`. Người có sổ cũ vẫn tất toán, rút sớm toàn bộ hoặc một phần theo mức cũ, hoặc tái gửi sang gói khác đang mở.

Hai ngoại lệ: tái gửi thủ công vào gói đã tắt bị chặn vì `renewDeposit` yêu cầu `newPlan.enabled`; auto-renew vẫn dùng gói gốc vì đó là cam kết với người gửi cũ. Nạp thêm vẫn được phép trên gói đã tắt: `topUpDeposit` không mở sổ mới và mọi điều khoản đã snapshot trong sổ, nên việc tắt gói chỉ chặn vốn mới.

### 7. Một kịch bản tấn công thực tế và cách phòng chống

Kịch bản: rút tiền hai lần, bao gồm trường hợp gọi lồng trong khi giao dịch đầu tiên chưa hoàn tất (reentrancy). Bốn lớp phòng chống:

1. Tám hàm có tác động đến tiền (`openDeposit`, `withdrawAtMaturity`, `claimInterest`, `topUpDeposit`, `earlyWithdraw`, `earlyWithdrawPartial`, `renewDeposit`, `autoRenewDeposit`) đều được gắn `nonReentrant`.
2. Trạng thái được cập nhật trước khi chuyển tiền, nên lần rút thứ hai dừng tại `_requireActiveOwner` với lỗi `Core: deposit inactive`. `claimInterest` xóa `pendingInterest` trước khi gọi vault; `earlyWithdrawPartial` giảm `principal` và `principalSeconds` trước khi chuyển tiền.
3. `VaultManager` chỉ chấp nhận lệnh từ `SavingCore`; `asset` và `vault` là `immutable` nên không thể bị thay thế bằng contract giả sau khi deploy.
4. C2 duy trì `reservedInterest`; `withdrawVault` chỉ cho rút phần chưa hứa và `payInterest` từ chối khoản chưa reserve. `setCoreOnce` khóa `CORE_ROLE` và `reserveInterest` bắt buộc khoản reserve phải có tiền thật.

Hạn chế còn lại: reservation chỉ là sổ kế toán trong cùng vault, không phải escrow riêng; admin vẫn là vai trò tin cậy đối với gói, pause, fee receiver và phần chưa hứa. Để giảm mức độ tin cậy cần dùng multisig/timelock.

## Creative Challenge C1 — Trả gốc ngay, ghi nợ lãi

**Vấn đề.** Đề bài yêu cầu `withdrawAtMaturity` revert nếu vault thiếu lãi, khiến tiền gốc của người gửi bị khóa bởi khoản nợ lãi của ngân hàng, dù gốc vẫn nằm đủ trong `SavingCore`.

**Cách làm.** `withdrawAtMaturity` bọc `vault.payInterest` trong `try/catch`. Nếu vault trả được, sổ thành `Withdrawn`. Nếu không, sổ thành `PrincipalWithdrawn`, lãi vào `pendingInterest` và phát sự kiện `InterestDeferred`; gốc vẫn chuyển ngay. `claimInterest` cho chủ NFT hiện tại nhận đúng khoản đã ghi nợ, xóa nợ trước khi gọi vault và bị chặn khi pause. Khoản chờ vẫn nằm trong `reservedInterest` nên C2 không cho admin rút.

**Đánh đổi.** Người dùng phải quay lại claim; sổ đã trả gốc không dùng để tái gửi hay rút tiếp; renew/auto-renew vẫn revert khi vault thiếu lãi.

**Kiểm thử.** Năm trường hợp: trả gốc và ghi nợ, claim sau khi nạp vault, claim đi theo NFT, pause chặn claim, sổ `PrincipalWithdrawn` không được dùng lại cho việc tất toán. Trên Sepolia, vault đang được nạp đủ nên không thể tạo thiếu hụt mà không phá C2; C1 chỉ được kiểm thử trong bộ kiểm thử đơn vị.

## Creative Challenge C2 — Khóa phần lãi đã hứa

**Vấn đề.** Nếu admin rút tự do, admin có thể rút đúng khoản lãi đang nợ các sổ hoạt động. Người gửi vẫn thấy lãi dự kiến trên giao diện nhưng đến đáo hạn mới biết vault trống.

**Cách làm.**

- `VaultManager` lưu `reservedInterest`, cộng dồn mọi khoản lãi đã hứa.
- `SavingCore` gọi `reserveInterest` khi mở sổ và khi nạp thêm; gọi `releaseInterest` khi rút sớm toàn bộ hoặc giảm gốc một phần; `payInterest` trừ reservation khi trả lãi.
- `withdrawVault` chỉ cho admin rút `balance − reservedInterest`; nếu `balance < reservedInterest` thì revert `Vault: undercollateralized`.
- `setCoreOnce(address)` cấp `CORE_ROLE` cho `SavingCore` đúng một lần, rồi đặt admin của `CORE_ROLE` thành chính `CORE_ROLE`. Sau đó `DEFAULT_ADMIN_ROLE` không grant/revoke `CORE_ROLE` được nữa.
- `reserveInterest` từ chối nếu `reservedInterest + amount > vault balance`, nên invariant `balance >= reservedInterest` được giữ ngay từ lúc reserve.

**Đánh đổi.**

- Vault phải được nạp đủ trước khi mở sổ hoặc nạp thêm; nếu không, giao dịch revert thay vì ghi một khoản lãi không có tiền.
- Đây vẫn là sổ kế toán, không phải escrow riêng. Nếu token bị mất hoặc bị tấn công khỏi vault, điều kiện bất biến bị vi phạm; khi đó `withdrawVault` bị chặn và C1 vẫn bảo vệ gốc.
- Admin vẫn là vai trò tin cậy đối với gói, pause, fee receiver và phần chưa hứa.

**Kiểm thử.** Các trường hợp trong `VaultManager.ts` kiểm tra khóa role, thiết lập một lần, reserve vượt số dư, giới hạn rút của admin, vault mất dự trữ và release khi rút sớm. Các trường hợp mở sổ, nạp thêm và tất toán trong `SavingCore.ts` cũng kiểm tra `reservedInterest` tăng/giảm tương ứng.

**Trạng thái Sepolia.** Bản `0xC5Dd267C…a302` đã có đầy đủ C2: `setCoreOnce`, `CORE_ROLE` bị khóa, dự trữ bảo đảm và giới hạn rút. Giai đoạn `immediate` đã kiểm tra trên chain thật.

## Creative Challenge C3 — Rút sớm một phần

**Vấn đề.** `earlyWithdraw` chỉ hỗ trợ rút toàn bộ: dù chỉ cần một phần nhỏ, người gửi vẫn phải đóng cả sổ và chịu phạt 4% trên toàn bộ gốc.

**Cách làm.** `earlyWithdrawPartial` chỉ chạy trước `maturityAt`, khi sổ `Active` và ví gọi là chủ NFT hiện tại. Phạt tính trên đúng phần rút; phần còn lại `principal - amount` phải `>= minDeposit` của gói, nếu không revert `Core: remaining below minimum`. APR, penalty, tenor và `maturityAt` giữ nguyên; NFT giữ nguyên, chỉ giảm `principal`. Phần đã rút không sinh lãi; lãi đáo hạn tính trên phần còn lại. Sự kiện: `PartialEarlyWithdrawn(depositId, owner, amount, penalty, remainingPrincipal)`.

Ví dụ: sổ 1.000 USDC thuộc gói có mức tối thiểu 500 USDC; rút sớm 200 USDC thì phạt 8 USDC, nhận 192 USDC, phần còn lại 800 USDC tiếp tục đến ngày đáo hạn cũ. Với sổ 500 USDC, rút 200 USDC sẽ để lại 300 USDC, thấp hơn mức tối thiểu 500 USDC nên giao dịch revert; muốn rút phải dùng `earlyWithdraw` toàn bộ.

**Đánh đổi.** Không tách khoản gửi thành nhiều phần riêng: một NFT và một `depositId`, lịch sử đọc từ sự kiện. Không thể rút số tiền khiến phần còn lại thấp hơn mức tối thiểu. Lãi tương lai giảm theo phần gốc còn lại.

**Kiểm thử.** 11 trường hợp: penalty trên phần rút, giữ snapshot, mức tối thiểu còn lại, owner/NFT, pause, penalty 0/100%, lãi đáo hạn trên phần còn lại và rút toàn bộ sau khi rút một phần. Frontend đã tích hợp: mặc định rút toàn bộ, nhập số nhỏ hơn thì gọi `earlyWithdrawPartial`.

## Creative Challenge C4 — Nạp thêm vào sổ đang chạy

**Vấn đề.** Sổ đã mở không hỗ trợ gửi thêm: muốn gửi thêm phải mở sổ mới, mất ngày đáo hạn cũ và phải áp dụng APR mới.

**Cách làm.** `Deposit` thêm `principalSeconds`. Lúc mở sổ, giá trị bằng `principal × tenorDays × 1 ngày`; lãi tính bằng `principalSeconds × aprBpsAtOpen / (365 ngày × 10.000)`. `topUpDeposit` chỉ chạy khi sổ `Active`, trước đáo hạn, đúng chủ NFT và hệ thống không pause. Contract nhận thêm gốc, cộng `amount × (maturityAt − block.timestamp)` vào `principalSeconds`, rồi reserve đúng phần lãi tăng thêm. Kỳ hạn, APR, penalty và `maturityAt` giữ nguyên; không mint NFT mới và không đổi `depositId`. `principalSeconds` giảm theo tỷ lệ khi rút sớm một phần, nên phần đã rút không tiếp tục sinh lãi.

Ví dụ: sổ 1.000 USDC kỳ hạn 90 ngày, nạp thêm 500 USDC sau 30 ngày. Khoản 500 USDC mới chỉ sinh lãi cho 60 ngày còn lại. Giới hạn `maxDeposit` của gói gốc vẫn áp dụng trên tổng gốc sau khi nạp thêm.

**Đánh đổi.** Không tách thành các phần riêng: lịch sử nạp thêm được đọc từ sự kiện `DepositToppedUp` và mọi khoản gốc dùng chung một snapshot APR. Không thể nạp thêm sau đáo hạn. Nếu rút sớm sau đó, mức phạt được tính trên toàn bộ gốc còn lại theo snapshot ban đầu.

**Ranh giới.** `maxDeposit` được kiểm tra khi mở sổ và khi nạp thêm, nhưng không kiểm tra lại ở `renewDeposit` và `autoRenewDeposit`. Gốc mới bằng gốc cũ cộng lãi nên luôn cao hơn mức tối thiểu, nhưng có thể vượt `maxDeposit` một chút. Bản này chấp nhận ranh giới đó vì chặn tái gửi sẽ khóa sổ đã đáo hạn; `maxDeposit` được hiểu là giới hạn cho vốn mới.

**Kiểm thử.** Bốn trường hợp: nạp thêm giữa kỳ với lãi theo principal-seconds và reserve tăng đúng, chặn sai chủ/giá trị 0/vượt mức tối đa/pause/sau đáo hạn, giảm theo tỷ lệ sau khi rút sớm một phần, và tái gửi sổ đã nạp thêm.

## Triển khai lên Sepolia

Mạng `testnet` được cố định ở chain ID `11155111`; repo không có script deploy local, fork hoặc bản deploy song song. Mạng in-process của Hardhat (`31337`) chỉ dùng cho kiểm thử đơn vị. Deploy cần `TESTNET_RPC_URL` và `DEPLOYER_PRIVATE_KEY`; xác thực mã nguồn cần thêm `ETHERSCAN_API_KEY`. Có thể đặt trong `contracts/.env` (đã ignore) hoặc truyền riêng cho phiên PowerShell:

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:FEE_RECEIVER_ADDRESS='0x...'                     # tùy chọn, mặc định là deployer
$env:EXPLORER_BASE_URL='https://sepolia.etherscan.io'  # tùy chọn, chỉ ghi vào manifest
$env:ETHERSCAN_API_KEY='...'                           # chỉ cần khi xác thực mã nguồn

npm run deploy:testnet:dry   # ước lượng gas, không gửi giao dịch
npm run deploy:testnet
npm run verify:testnet
npm run configure:frontend -- testnet
```

`deploy:testnet:dry` chỉ đọc RPC và in chi phí trong trường hợp xấu nhất. `verify:testnet` đối chiếu manifest với chain thật: chain ID, địa chỉ sinh ra từ receipt, nonce liên tục, phạm vi block, gas, bytecode tồn tại, liên kết token–vault–core, `vault.core()`, admin của `CORE_ROLE` đã bị khóa, fee receiver, grace period, đúng 5 gói, khoản nạp vào vault và `reservedInterest <= vault balance`. Sau khi e2e đã mở sổ, thêm `ALLOW_POST_E2E=1` để bỏ qua các kiểm tra snapshot của lần deploy mới.

Xác thực mã nguồn được chạy trong `contracts/`:

```powershell
npx hardhat verify --network testnet <MockUSDC>
npx hardhat verify --network testnet <VaultManager> <MockUSDC> <admin> <feeReceiver>
npx hardhat verify --network testnet <SavingCore> <MockUSDC> <VaultManager> 259200
```

### Triển khai đang sử dụng

| Contract | Địa chỉ trên Sepolia |
| --- | --- |
| `MockUSDC` | [`0x1fFa8aF3aF716E245A5501B086d1C01375F192fc`](https://sepolia.etherscan.io/address/0x1fFa8aF3aF716E245A5501B086d1C01375F192fc#code) |
| `VaultManager` | [`0xA128175f2C1099Ecc3933876a3d0BF931816867C`](https://sepolia.etherscan.io/address/0xA128175f2C1099Ecc3933876a3d0BF931816867C#code) |
| `SavingCore` | [`0xC5Dd267CfefC629E722110F8086c0DDc33a5a302`](https://sepolia.etherscan.io/address/0xC5Dd267CfefC629E722110F8086c0DDc33a5a302#code) |

Deployer kiêm fee receiver: [`0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731`](https://sepolia.etherscan.io/address/0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731). Contract được deploy ở block `12018179`; 12 giao dịch thiết lập kết thúc ở block `12018193`, tổng gas thực tế `478.354.062.456` wei (khoảng `0,000478` ETH). Manifest đầy đủ ở [contracts/deployments/testnet.json](contracts/deployments/testnet.json).

Năm gói trên chain:

| Plan | Kỳ hạn | APR | Tối thiểu | Tối đa | Phạt sớm |
| --- | --- | --- | --- | --- | --- |
| 1 | 30 ngày | 1,75% | 100 USDC | 25.000 USDC | 2,00% |
| 2 | 90 ngày | 2,25% | 500 USDC | 100.000 USDC | 4,00% |
| 3 | 180 ngày | 3,00% | 1.000 USDC | 250.000 USDC | 4,50% |
| 4 | 365 ngày | 4,00% | 2.500 USDC | 500.000 USDC | 5,00% |
| 5 | 1 ngày | 0,50% | 10 USDC | 10.000 USDC | 1,00% |

Giao dịch deploy và thiết lập:

- Deploy `MockUSDC`: [`0x68b959...c460a`](https://sepolia.etherscan.io/tx/0x68b9592d4e3c1345a6f58e715e0aa8288ce0bcf62e37f1b08c6d41f6599c460a)
- Deploy `VaultManager`: [`0x23176a...4fd8a`](https://sepolia.etherscan.io/tx/0x23176ab6658b4f56e9d227f7bfbf1359bd12cc5d39a78841f45ab0dd25a4fd8a)
- Deploy `SavingCore`: [`0xb4612e...788c4`](https://sepolia.etherscan.io/tx/0xb4612e692a10e88372ef32e7a99d5f0cfe4a22986348dfbd8fb49eb81df788c4)
- `setCoreOnce`: [`0xdf3f3c...14960`](https://sepolia.etherscan.io/tx/0xdf3f3cc8eb73ecfbf090be083525a1c9f40cbc3fdbff703f9e288b76fbf14960)
- Mint `150.000 USDC`: [`0x2a7918...ad6e9a`](https://sepolia.etherscan.io/tx/0x2a7918d114886209ccefb3797d1fa7d44aad3494ab331e9c420d41ab95ad6e9a)
- Approve và nạp `100.000 USDC` vào vault: [`0xd0c4da...d1ed85`](https://sepolia.etherscan.io/tx/0xd0c4da02801cfebfe73a1e73f166ce34a80478a9aba9811fb8ae49ebc9d1ed85), [`0x7b68f0...23d9e3`](https://sepolia.etherscan.io/tx/0x7b68f0170b9305cfc8f23cb3f2baa5011933e750f043b446fcd7dc127d23d9e3)
- Tạo gói 1–5: [`0x80c93e...5d376e`](https://sepolia.etherscan.io/tx/0x80c93e1474682cb9ea8fb28fc6e2507fc2a7fa4b321aa14d03673c7d055d376e), [`0x3460ff...641ccb`](https://sepolia.etherscan.io/tx/0x3460ff168d659c915f414383fb1b270958096e733cab31b7dd02068b6c641ccb), [`0x8c0c1b...57ae17b`](https://sepolia.etherscan.io/tx/0x8c0c1b2e6203de09b5b380bf02b3d9d1a86124ba41ce45f765de7f12957ae17b), [`0xa3a860...0157b4d`](https://sepolia.etherscan.io/tx/0xa3a860edd11f6d48ddb2c4a34d7e211837512b28d670d154bd3e48db60157b4d), [`0x5f8ac4...783ebed`](https://sepolia.etherscan.io/tx/0x5f8ac459ad943c22fc94824b1f0bfcca38b64fe49bbafc3d97361ac25783ebed)

Giao dịch e2e giai đoạn `immediate`:

- Approve `SavingCore`: [`0x314359...af65bc`](https://sepolia.etherscan.io/tx/0x3143595c632325cc12515169808d2ce730e14d92ded1c667205b34e775af65bc)
- Mở D1 `100 USDC`: [`0x2f74c3...333ba7`](https://sepolia.etherscan.io/tx/0x2f74c3a2662b766288c7e5628bd627cfe6b8224a120ce3bf9616aef85d333ba7)
- Nạp thêm D1 `50 USDC`: [`0xb4b67e...1aaae`](https://sepolia.etherscan.io/tx/0xb4b67e8ac2f063b41c97205e8247464e04eba23a4842c598511b29f0bde1aaae)
- Rút sớm một phần D1 `40 USDC`: [`0x6cecb9...6912bc`](https://sepolia.etherscan.io/tx/0x6cecb9a831e4ab9a2f7a11a14326ed615ffc84a3c8bc2776e13d2a09866912bc)
- Tạm dừng vault: [`0xac358e...bc6a32`](https://sepolia.etherscan.io/tx/0xac358e3b12504863886f732a41d58c29c6dda9a66455c415be62beb9c8bc6a32); bỏ tạm dừng: [`0x074d8e...7b1c26`](https://sepolia.etherscan.io/tx/0x074d8e5a2729acb27f35a335b37a5f737e0c4d123ac9df5a12d5cd2ae13b1c26)
- Rút phần chưa hứa `1 USDC`: [`0x7d17d3...d0591108`](https://sepolia.etherscan.io/tx/0x7d17d3a9267afba0966d0192795eada4b45b0b823a5008fd0a6a3486d0591108); hoàn lại: [`0xbe2860...aad946`](https://sepolia.etherscan.io/tx/0xbe286008dcda7d05786367dc5d5b381005e52bc330976e4774a6e70cb9aad946)
- Rút sớm toàn bộ D1: [`0xc8bc17...1e65da`](https://sepolia.etherscan.io/tx/0xc8bc17e3be13b59e1557abd2e4ddc72afaafe1b353e12a5307a5c5ce531e65da)
- Mở T1–T6 gói 1 ngày: [`0x9d3e32...5f7005`](https://sepolia.etherscan.io/tx/0x9d3e329a9a10b46fb2bafc03ce30450807f34f206adf4278e2ecd886af5f7005), [`0x8a3d8d...d59db1`](https://sepolia.etherscan.io/tx/0x8a3d8db465a7942ece5ef524f6f78123577694677776d2ee4e094bf4d8e59db1), [`0x10ed06...c97f77`](https://sepolia.etherscan.io/tx/0x10ed06b618b8e813874430c45b9d8b022f860a9a6a7d029a58e83b1492c97f77), [`0x951a99...cb9b13`](https://sepolia.etherscan.io/tx/0x951a996bc874ea3d823dbe140a60871b73f847306adcca40fe1b015479cb9b13), [`0x722565...c78f6`](https://sepolia.etherscan.io/tx/0x722565199005995df3b6c660c9465c5d3d84b2ac4b981a67269b19abd25c78f6), [`0x102995...f734f060`](https://sepolia.etherscan.io/tx/0x1029953dbe5ced9445e248f1f431c18b99c5ce0a567772e2fa9aefe2f734f060)
- Rút sớm một phần T2: [`0x7c0ecc...5ed631`](https://sepolia.etherscan.io/tx/0x7c0ecc583abe897a171eee0e0aa742525299a252060098d54213d9669f5ed631)
- Nạp thêm T3: [`0x8b3473...ed15ac`](https://sepolia.etherscan.io/tx/0x8b34730c5c37623dbdf04e148004e3bb515f4d8989520f5edde2951feaed15ac)
- Nạp ETH cho tài khoản thứ hai: [`0x3a0beb...9d9526`](https://sepolia.etherscan.io/tx/0x3a0bebf6d7bc56ed2c212f0a5a0b8a9c52b544ff2d2bd9b6d2acedf9b79d9526)
- Chuyển NFT T4: [`0x7ca591...aaacab`](https://sepolia.etherscan.io/tx/0x7ca591211eb0c5e4e4f6340927d9a7e2b461b2bad6a538efba9ec5b35faaacab)

## Lệnh thường dùng

| Lệnh | Chức năng |
| --- | --- |
| `npm run dev` | chạy Vite tại cổng 5173 |
| `npm run build` | kiểm tra kiểu và build bản production cho frontend |
| `npm run lint` | chạy oxlint |
| `npm test` | chạy 74 kiểm thử Hardhat |
| `npm run coverage` | chạy test kèm báo cáo coverage |
| `npm run contracts:typecheck` | kiểm tra TypeScript phần contract |
| `npm run contracts:compile` | compile contract bằng Hardhat |
| `npm run contracts:export-abis` | compile rồi sinh lại `frontend/src/contracts/abis.ts` |
| `npm run deploy:testnet:dry` | ước lượng gas deploy trên Sepolia, không gửi giao dịch |
| `npm run deploy:testnet` | deploy lên Sepolia |
| `npm run verify:testnet` | xác thực deployment Sepolia |
| `npm run configure:frontend -- testnet` | ghi `frontend/.env.local` từ manifest |
| `npm run test:sepolia` | chạy giai đoạn `immediate` trên Sepolia thật |
| `npm run test:sepolia:status` | đọc trạng thái và mốc thời gian của các giai đoạn |
| `npm run test:sepolia:mature` | chạy giai đoạn tất toán/tái gửi sau đáo hạn |
| `npm run test:sepolia:auto-renew` | chạy giai đoạn auto-renew sau grace |

Toàn bộ deploy, xác thực và e2e đều được cố định ở chain ID `11155111`; repo không có script deploy local, fork hoặc deploy song song. Mạng in-process `31337` chỉ phục vụ kiểm thử đơn vị.
