# TÍCH — Sổ tiết kiệm kỳ hạn on-chain

Đồ án môn Lập trình Blockchain: hệ thống gửi tiết kiệm có kỳ hạn chạy bằng smart contract. Người dùng khóa MockUSDC, nhận chứng chỉ NFT (ERC-721), hưởng lãi đơn theo APR đã chốt lúc mở sổ, có thể nạp thêm gốc, rồi tất toán đúng hạn, rút trước hạn chịu phạt, nhận lãi chờ hoặc tái gửi sang kỳ hạn mới.

Giao diện React + TypeScript kết nối MetaMask và đọc/ghi trực tiếp lên ba contract. Sau khi kết nối, số dư, gói và sổ đều đọc từ chain; trong lúc chờ RPC, giao diện hiển thị loading state và không dùng dữ liệu mẫu.

## Trạng thái hiện tại

| Phạm vi | Trạng thái |
| --- | --- |
| Source + test | Đủ C1–C4. 74 test pass, coverage 100% line/statement, `contracts:typecheck`, `build` và `lint` pass. |
| Sepolia công khai | Deploy ngày 2026-10-29, 5 gói, vault `100.000 USDC`, 12 giao dịch setup. Cả ba contract verified trên Etherscan; Sourcify đạt `exact_match` cho `VaultManager`/`SavingCore` và `match` cho `MockUSDC`. |
| E2E Sepolia thật | Phase `immediate` hoàn tất ngày 2026-10-29: mở sổ, nạp thêm, rút sớm một phần, pause/role/reserve probe, rút sớm toàn bộ, chuyển NFT và kiểm tra invariant. Phase `mature` và `auto-renew` đã sẵn sàng nhưng phải chờ thời gian chain thật. |
| Còn mở | Chạy `mature` từ 2026-10-30 08:21 UTC, `auto-renew` từ 2026-11-02 08:21 UTC; walkthrough MetaMask thật và video demo 3–5 phút. |

## Thông số cá nhân

MSSV **22665321** lấy hai chữ số cuối: `A = 1` (chữ số cuối) và `B = 2` (chữ số áp út).

| Tham số | Công thức | Giá trị | Diễn giải |
| --- | --- | --- | --- |
| Grace period | `(A mod 3) + 2` ngày | 3 ngày (259.200 giây) | Chờ 3 ngày sau đáo hạn rồi mới auto-renew |
| APR mặc định | `200 + A × 25` bps | 225 bps = 2,25%/năm | 100 bps = 1% |
| Phạt rút sớm | `300 + B × 50` bps | 400 bps = 4,00% | Trừ trên phần gốc rút ra |
| Kỳ hạn mặc định | `B` chẵn → 90 ngày | 90 ngày | Gói mặc định |

Nguồn duy nhất là [contracts/config/personal.ts](contracts/config/personal.ts). Test, script deploy và manifest đều đọc từ đây. Grace period là tham số constructor `immutable`, nên đổi MSSV phải deploy bộ contract mới.

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

`package.json` ở gốc yêu cầu `engines.node >= 24.22.1`. Hardhat 3 báo lỗi ngay nếu Node cũ hơn.

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

Nội dung sinh ra cho bản đang dùng:

```text
VITE_CHAIN_ID=11155111
VITE_DEPLOY_BLOCK=12018179
VITE_CORE_ADDRESS=0xC5Dd267CfefC629E722110F8086c0DDc33a5a302
VITE_VAULT_ADDRESS=0xA128175f2C1099Ecc3933876a3d0BF931816867C
VITE_USDC_ADDRESS=0x1fFa8aF3aF716E245A5501B086d1C01375F192fc
```

Chỉ địa chỉ công khai và chain ID nằm trong biến `VITE_*`; private key không bao giờ đặt ở đây vì mọi thứ tiền tố `VITE_` đều bị đóng gói vào bundle. MetaMask ký giao dịch trong trình duyệt. Nếu thiếu một trong ba địa chỉ, [config.ts](frontend/src/contracts/config.ts) báo lỗi cấu hình thay vì gọi contract.

## Chạy giao diện

```powershell
npm run dev
```

Mở `http://127.0.0.1:5173/`, bấm **Kết nối ví**, chọn MetaMask và chuyển sang **Sepolia** (chain ID `11155111`, RPC có ở [chainlist.org/chain/11155111](https://chainlist.org/chain/11155111)).

Thêm token để thấy số bên cạnh ví: contract `0x1fFa8aF3aF716E245A5501B086d1C01375F192fc`, symbol `USDC`, decimals `6`. MockUSDC là token test và `mint` mở công khai, nên ví chưa có tiền vẫn lấy được: gọi `mint` trên Etherscan Write Contract với số lượng theo 6 decimals (1.000 USDC = `1000000000`). Ví cũng cần Sepolia ETH để trả gas; faucet có trong chainlist hoặc [sepoliafaucet.com](https://sepoliafaucet.com).

Luồng chính: vào **Gói tiết kiệm**, chọn kỳ hạn và mở sổ (lần đầu cần `approve` USDC, sau đó `openDeposit`); vào **Sổ của tôi** để xem NFT, tất toán, rút trước hạn toàn bộ/một phần, nạp thêm, nhận lãi chờ hoặc tái gửi.

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

Bộ test phủ các luồng bắt buộc và các nhánh dễ sai: thiếu allowance, snapshot APR sau khi sửa gói, biên đáo hạn/grace, rút hai lần, pause chặn mọi lối ra, chuyển NFT đổi chủ, penalty 0/100%, lãi làm tròn xuống 0.

- **C1:** trả gốc và ghi nợ lãi khi vault thiếu tiền; claim sau khi nạp vault; claim đi theo NFT; pause chặn claim; sổ `PrincipalWithdrawn` không dùng lại cho lối ra đáo hạn.
- **C2:** chỉ `SavingCore` giữ `CORE_ROLE`; admin không grant/revoke được role sau khi khóa; reserve vượt số dư bị chặn; `withdrawVault` cap ở `balance − reservedInterest`; vault mất backing thì admin không rút được; release đúng khi rút sớm toàn bộ/một phần.
- **C3:** 11 case rút sớm một phần.
- **C4:** top-up giữa kỳ, nhiều lần top-up, giảm gốc pro-rata và tái gửi sổ đã top-up.

### E2E trên Sepolia thật

`contracts/scripts/e2e` chạy theo ba phase độc lập, lưu tiến độ trong `contracts/deployments/testnet.e2e.json` (đã ignore) và chỉ dùng chain ID `11155111`:

```powershell
npm run test:sepolia            # immediate
npm run test:sepolia:status     # đọc lại state, kiểm tra mốc thời gian
npm run test:sepolia:mature     # sau đáo hạn
npm run test:sepolia:auto-renew # sau đáo hạn + grace
```

Kết quả phase `immediate` ngày 2026-10-29: 19 giao dịch thật, gas `77.866.819.359` wei. Script đã kiểm tra:

- Mở D1 gói 30 ngày `100 USDC`, nạp thêm `50 USDC`, rút sớm một phần `40 USDC` và chặn phần còn lại dưới min.
- Pause vault chặn mở sổ, nạp thêm và rút sớm; unpause trả lại trạng thái bình thường.
- `setCoreOnce` lần hai, `grantRole(CORE_ROLE)` và `reserveInterest` từ deployer đều revert.
- `withdrawVault` vượt phần chưa hứa bị chặn; rút/hoàn `1 USDC` giữ nguyên số dư vault.
- Rút sớm toàn bộ D1, penalty `2,2 USDC` (2% trên `110 USDC` còn lại) đi đúng fee receiver.
- Mở T1–T6 gói 1 ngày, rút sớm một phần T2, nạp thêm T3, chuyển NFT T4 sang tài khoản thứ hai.
- `reservedInterest` luôn bằng tổng lãi của sổ active cộng lãi chờ, và vault balance luôn đủ backing.

T1#2 đã bị rút sớm trên chain lúc `2026-10-29 08:40 UTC` (tx [`0x09a8cc...2c94`](https://sepolia.etherscan.io/tx/0x09a8ccc2e70cdd4dd3a5d91a1b0ec6b4dae0c3362f15560f7d9d3abbe44c2c94)), ngoài kịch bản `immediate`; phase `mature` sẽ bỏ qua T1 và tất toán T2–T4, tái gửi T6 sang gói 90 ngày, cho chủ mới của T4 rút. Phase `auto-renew` sẽ gia hạn T5 sau grace. Hai phase này không thể chạy sớm hơn thời gian chain thật; `test:sepolia:status` in rõ mốc sớm nhất.

## Kiến trúc

| Contract | Giữ gì | Việc chính |
| --- | --- | --- |
| `MockUSDC` | không giữ tiền | ERC-20 6 decimals, `mint` công khai để test |
| `VaultManager` | tiền lãi của ngân hàng | nạp/rút vault, fee receiver, pause, reserve/release/pay interest |
| `SavingCore` | gốc của người gửi | gói, NFT chứng chỉ, snapshot, tất toán, claim, top-up, rút sớm, tái gửi |
| `IVaultManager` | — | interface định kiểu cho lời gọi từ core sang vault |

Tách gốc và lãi để một sổ đáo hạn không bị trả bằng tiền gốc của người gửi sau. `SavingCore` chỉ trả gốc bằng đúng khoản đã nhận khi mở sổ; mọi khoản lãi đi qua `VaultManager`. Với C1, nếu vault thiếu tiền lúc đáo hạn, gốc vẫn được trả ngay và lãi được ghi nợ trong `pendingInterest`; chủ NFT hiện tại gọi `claimInterest` khi vault có tiền. Tái gửi vẫn nguyên tử: vault thiếu lãi thì cả lần tái gửi revert.

Mỗi sổ lưu `principal`, `aprBpsAtOpen`, `penaltyBpsAtOpen`, `tenorDays`, `openedAt`, `maturityAt`, `status` và `principalSeconds`; sửa gói về sau chỉ ảnh hưởng sổ mới.

```text
mở sổ:      principalSeconds = principal × tenorDays × 1 ngày
top-up:     principalSeconds += amount × (maturityAt − block.timestamp)
interest    = principalSeconds × aprBpsAtOpen / (365 × 86_400 × 10_000)
penalty     = amount × penaltyBpsAtOpen / 10_000
```

Năm trạng thái: `Active`, `Withdrawn`, `ManualRenewed`, `AutoRenewed`, `PrincipalWithdrawn`. Ba lối ra kết thúc sổ là tất toán, rút sớm toàn bộ và tái gửi thủ công; cả ba kiểm tra `status == Active` và `ownerOf(depositId) == msg.sender`. `topUpDeposit` chỉ nhận sổ `Active` trước đáo hạn. `claimInterest` chỉ nhận sổ `PrincipalWithdrawn`.

## Design Answers

Bảy câu dưới đây ứng với mục 8.2 của đề. Mỗi câu nêu quy tắc, code quyết định và trade-off.

### 1. Alice bán NFT cho Bob thì ai được rút?

Bob. Chứng chỉ là NFT nên quyền rút đi theo người đang giữ NFT. `_requireActiveOwner` kiểm tra `ownerOf(depositId) == msg.sender` ở `withdrawAtMaturity`, `earlyWithdraw`, `earlyWithdrawPartial` và `renewDeposit`; `claimInterest` kiểm tra chủ NFT riêng; `topUpDeposit` dùng chung `_requireActiveOwner`. Auto-renew mint sổ mới cho chủ NFT hiện tại. Alice gọi sau khi bán sẽ nhận `Core: not certificate owner`.

Đổi lại, mất ví hoặc chuyển nhầm là mất quyền rút; ngân hàng không can thiệp được. Bù lại, người cần tiền gấp có thể bán sổ trên thị trường thứ cấp thay vì chịu phạt 4%.

### 2. Vault hết tiền lúc đáo hạn thì sao?

Gốc vẫn được trả ngay, lãi được ghi nợ và nhận sau (C1). `withdrawAtMaturity` bọc `vault.payInterest` trong `try/catch`; nếu vault revert, sổ chuyển sang `PrincipalWithdrawn`, `pendingInterest[depositId] = interest`, phát `InterestDeferred` và vẫn trả đủ gốc. Chủ NFT hiện tại gọi `claimInterest` khi vault được nạp. Hàm xóa khoản nợ trước rồi mới gọi vault, nên vault vẫn thiếu thì cả giao dịch revert và người dùng thử lại được; claim bị chặn khi pause.

Đánh đổi: lãi chờ không tự động chuyển vào ví, người dùng phải quay lại claim; frontend hiển thị trạng thái `CHỜ LÃI`. Tái gửi thủ công và auto-renew vẫn all-or-nothing vì chúng cần lãi để tạo gốc mới.

### 3. Bot tự động gia hạn chết một tháng thì ai mất gì?

Không ai mất tiền. Bot chỉ bấm hộ nút gia hạn: sổ cũ nằm yên ở trạng thái `Active`, không bị xóa và không mất lãi đã chốt. Người dùng vẫn tự rút bằng `withdrawAtMaturity` hoặc tái gửi bằng `renewDeposit` bất cứ lúc nào sau đáo hạn. `autoRenewDeposit` mở cho mọi người gọi sau mốc đáo hạn + grace, nên ví người dùng hay bên thứ ba đều thay bot được.

Cái mất là cơ hội: tiền nằm im thêm một tháng. Nếu làm tiếp, tôi sẽ thêm nút "gia hạn ngay" ở mốc grace và một bot dự phòng.

### 4. Phần lẻ khi chia lãi đi đâu?

Với lãi, phần lẻ nằm lại trong vault; với phạt, phần lẻ được trả lại cùng gốc cho người rút. Cả hai dùng `Math.mulDiv` trong `_interestFor` và `_penaltyFor`: nhân trước chia sau, luôn làm tròn xuống, nên số phải trả chỉ nhỏ đi chứ không bao giờ âm. Lãi 2,777... USDC thì trả 2,77, phần dưới một đơn vị 6 decimals ở lại vault.

Lãi tròn về 0 cũng không kẹt: `withdrawAtMaturity` có `if (interest > 0)` nên bỏ qua vault và trả đủ gốc. Test mở sổ 1 đơn vị, APR 1 bps, kỳ hạn 1 ngày và vẫn rút gốc bình thường. Không có sổ kế toán riêng nên phần lẻ không thể bị rút hai lần.

### 5. Đúng giây đáo hạn là rút sớm hay rút đúng hạn?

Là rút đúng hạn. Trước `maturityAt` là sớm, từ mốc đó trở đi là đúng hạn, không có vùng lưng chừng. `withdrawAtMaturity` và `renewDeposit` dùng `>=`; `earlyWithdraw` và `earlyWithdrawPartial` dùng `<`. Chọn `>=` để người canh đúng giây đáo hạn không bị phạt oan.

Auto-renew cần `block.timestamp >= maturityAt + gracePeriod`, nên đúng mốc hết grace là đã có thể gia hạn. Người dùng vẫn tái gửi tay được ở giây cuối grace nếu bot chưa chạy, vì `renewDeposit` chỉ yêu cầu `>= maturityAt` và không bị giới hạn bởi grace.

### 6. Admin tắt gói trong khi còn sổ đang chạy thì sao?

Sổ đang chạy không bị gì. Lúc mở sổ, contract đã lưu snapshot APR, kỳ hạn và mức phạt vào chính sổ đó, nên sửa hay tắt gói về sau chỉ ảnh hưởng người mở mới. `setPlanEnabled` chỉ đổi cờ `enabled`. Người có sổ cũ vẫn tất toán, rút sớm toàn bộ/một phần theo mức cũ, hoặc tái gửi sang gói khác đang mở.

Hai ngoại lệ: tái gửi tay vào gói đã tắt bị chặn vì `renewDeposit` đòi `newPlan.enabled`; auto-renew vẫn dùng gói gốc vì đó là cam kết với khách cũ.

### 7. Một cuộc tấn công thực tế và cách chặn

Kịch bản: rút hai lần, kể cả gọi lồng trong lúc giao dịch đầu chưa xong (reentrancy). Bốn lớp chặn:

1. Tám hàm động vào tiền (`openDeposit`, `withdrawAtMaturity`, `claimInterest`, `topUpDeposit`, `earlyWithdraw`, `earlyWithdrawPartial`, `renewDeposit`, `autoRenewDeposit`) đều gắn `nonReentrant`.
2. Trạng thái đổi trước khi chuyển tiền, nên lần rút thứ hai dừng ở `_requireActiveOwner` với `Core: deposit inactive`. `claimInterest` xóa `pendingInterest` trước khi gọi vault; `earlyWithdrawPartial` giảm `principal` và `principalSeconds` trước khi chuyển tiền.
3. Két lãi chỉ nhận lệnh từ `SavingCore`; `asset` và `vault` là `immutable` nên không tráo được contract giả sau deploy.
4. C2 giữ `reservedInterest`; `withdrawVault` chỉ cho rút phần chưa hứa và `payInterest` từ chối khoản chưa reserve. `setCoreOnce` khóa `CORE_ROLE` và `reserveInterest` bắt buộc reserve phải có tiền thật.

Điểm yếu còn lại: reservation là sổ kế toán trong cùng vault, không phải escrow riêng; admin vẫn là trusted role cho plan, pause, fee receiver và phần chưa hứa. Muốn giảm tin cậy phải dùng multisig/timelock, hiện chưa làm.

## Creative Challenge C1 — Trả gốc ngay, ghi nợ lãi

**Vấn đề.** Đề gốc bắt `withdrawAtMaturity` revert nếu vault thiếu lãi, khiến tiền gốc của khách bị khóa bởi một khoản ngân hàng nợ, dù gốc vẫn nằm đủ trong `SavingCore`.

**Cách làm.** `withdrawAtMaturity` bọc `vault.payInterest` trong `try/catch`. Nếu vault trả được, sổ thành `Withdrawn`. Nếu không, sổ thành `PrincipalWithdrawn`, lãi vào `pendingInterest` và event `InterestDeferred`; gốc vẫn chuyển ngay. `claimInterest` cho chủ NFT hiện tại nhận đúng khoản đã ghi nợ, xóa nợ trước khi gọi vault và bị chặn khi pause. Khoản chờ vẫn nằm trong `reservedInterest` nên C2 không cho admin rút.

**Đánh đổi.** Người dùng phải quay lại claim; sổ đã trả gốc không dùng để tái gửi hay rút tiếp; renew/auto-renew vẫn revert khi vault thiếu lãi.

**Test.** Năm case: trả gốc và ghi nợ, claim sau khi nạp vault, claim đi theo NFT, pause chặn claim, sổ `PrincipalWithdrawn` không dùng lại cho lối ra đáo hạn. Trên Sepolia, vault đang được fund đủ nên không thể tạo thiếu hụt mà không phá C2; C1 chỉ được kiểm thử ở unit suite.

## Creative Challenge C2 — Khóa phần lãi đã hứa

**Vấn đề.** Nếu admin rút tự do, admin có thể rút đúng khoản lãi đang nợ các sổ active. Người gửi vẫn thấy lãi dự kiến trên UI nhưng đến đáo hạn mới biết vault trống.

**Cách làm.**

- `VaultManager` lưu `reservedInterest`, cộng dồn mọi khoản lãi đã hứa.
- `SavingCore` gọi `reserveInterest` khi mở sổ và khi top-up; gọi `releaseInterest` khi rút sớm toàn bộ hoặc giảm gốc một phần; `payInterest` trừ reservation khi trả lãi.
- `withdrawVault` chỉ cho admin rút `balance − reservedInterest`; nếu `balance < reservedInterest` thì revert `Vault: undercollateralized`.
- `setCoreOnce(address)` cấp `CORE_ROLE` cho `SavingCore` đúng một lần, rồi đặt admin của `CORE_ROLE` thành chính `CORE_ROLE`. Sau đó `DEFAULT_ADMIN_ROLE` không grant/revoke `CORE_ROLE` được nữa.
- `reserveInterest` từ chối nếu `reservedInterest + amount > vault balance`, nên invariant `balance >= reservedInterest` được giữ ngay từ lúc reserve.

**Đánh đổi.**

- Vault phải được nạp đủ trước khi mở sổ/top-up; nếu không, giao dịch revert thay vì ghi một khoản lãi không có tiền.
- Đây vẫn là sổ kế toán, không phải escrow riêng. Nếu token bị mất/hack khỏi vault, invariant vỡ; khi đó `withdrawVault` bị chặn và C1 vẫn bảo vệ gốc.
- Admin vẫn là trusted role cho plan, pause, fee receiver và phần chưa hứa. Chưa có timelock/multisig hay tách `PLAN_MANAGER_ROLE`/`PAUSER_ROLE`.

**Test.** Các case trong `VaultManager.ts` kiểm tra role lock, one-time setup, reserve vượt số dư, cap rút admin, vault mất backing và release khi rút sớm. Các case mở sổ/top-up/tất toán trong `SavingCore.ts` cũng kiểm tra `reservedInterest` tăng/giảm tương ứng.

**Trạng thái Sepolia.** Bản `0xC5Dd267C…a302` đã có đầy đủ C2: `setCoreOnce`, `CORE_ROLE` bị khóa, reserve backing và cap rút. Phase `immediate` đã kiểm tra trên chain thật.

## Creative Challenge C3 — Rút sớm một phần

**Vấn đề.** `earlyWithdraw` là all-or-nothing: cần 10% tiền vẫn phải đóng cả sổ và chịu phạt 4% trên toàn bộ gốc.

**Cách làm.** `earlyWithdrawPartial` chỉ chạy trước `maturityAt`, khi sổ `Active` và ví gọi là chủ NFT hiện tại. Phạt tính trên đúng phần rút; phần còn lại `principal - amount` phải `>= minDeposit` của gói, nếu không revert `Core: remaining below minimum`. APR, penalty, tenor và `maturityAt` giữ nguyên; NFT giữ nguyên, chỉ giảm `principal`. Phần đã rút không sinh lãi; lãi đáo hạn tính trên phần còn lại. Event: `PartialEarlyWithdrawn(depositId, owner, amount, penalty, remainingPrincipal)`.

Ví dụ: sổ 1.000 USDC ở gói min 500, rút sớm 200 → phạt 8 USDC, nhận 192, còn 800 tiếp tục đến đáo hạn cũ. Sổ 500 rút 200 → còn 300 < min 500 nên revert; muốn thoát phải dùng `earlyWithdraw` toàn bộ.

**Đánh đổi.** Một NFT, một `depositId`, không tạo tranche mới; lịch sử đọc từ event. Không thể rút số tiền làm phần còn lại dưới min. Lãi tương lai giảm theo phần gốc còn lại.

**Test.** 11 case: penalty trên phần rút, giữ snapshot, min còn lại, owner/NFT, pause, penalty 0/100%, lãi đáo hạn trên phần còn lại và full withdrawal sau partial. Frontend đã nối: mặc định rút toàn bộ, nhập số nhỏ hơn thì gọi `earlyWithdrawPartial`.

## Creative Challenge C4 — Nạp thêm vào sổ đang chạy

**Vấn đề.** Sổ đã mở là all-or-nothing: muốn gửi thêm phải mở sổ mới, mất ngày đáo hạn cũ và phải chốt APR mới.

**Cách làm.** `Deposit` thêm `principalSeconds`. Lúc mở sổ, giá trị bằng `principal × tenorDays × 1 ngày`; lãi tính bằng `principalSeconds × aprBpsAtOpen / (365 ngày × 10.000)`. `topUpDeposit` chỉ chạy khi sổ `Active`, trước đáo hạn, đúng chủ NFT và hệ thống không pause. Contract nhận thêm gốc, cộng `amount × (maturityAt − block.timestamp)` vào `principalSeconds`, rồi reserve đúng phần lãi tăng thêm. Kỳ hạn, APR, penalty và `maturityAt` giữ nguyên; không mint NFT mới và không đổi `depositId`. `principalSeconds` giảm pro-rata khi rút sớm một phần, nên phần đã rút không tiếp tục sinh lãi.

Ví dụ: sổ 1.000 USDC kỳ 90 ngày, top-up 500 USDC sau 30 ngày. 500 USDC mới chỉ sinh lãi cho 60 ngày còn lại. Giới hạn `maxDeposit` của gói gốc vẫn áp trên tổng gốc sau top-up.

**Đánh đổi.** Không có tranche riêng: lịch sử top-up đọc từ event `DepositToppedUp`, mọi khoản gốc dùng chung một APR snapshot. Không thể top-up sau đáo hạn. Rút sớm sau đó tính penalty trên toàn bộ gốc còn lại theo snapshot ban đầu.

**Test.** Bốn case: top-up giữa kỳ với lãi theo principal-seconds và reserve tăng đúng, chặn sai chủ/zero/vượt max/pause/sau đáo hạn, giảm pro-rata sau rút sớm một phần, và tái gửi sổ đã top-up.

## Deploy lên Sepolia

Network `testnet` bị khóa ở chain ID `11155111`; không có script deploy local, fork hay bản deploy song song trong repo. Mạng in-process của Hardhat (`31337`) chỉ dùng cho unit test. Deploy cần `TESTNET_RPC_URL` và `DEPLOYER_PRIVATE_KEY`; verify source cần thêm `ETHERSCAN_API_KEY`. Có thể đặt trong `contracts/.env` (đã ignore) hoặc truyền riêng cho phiên PowerShell:

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:FEE_RECEIVER_ADDRESS='0x...'                     # tùy chọn, mặc định là deployer
$env:EXPLORER_BASE_URL='https://sepolia.etherscan.io'  # tùy chọn, chỉ ghi vào manifest
$env:ETHERSCAN_API_KEY='...'                           # chỉ cần khi verify source

npm run deploy:testnet:dry   # ước lượng gas, không gửi giao dịch
npm run deploy:testnet
npm run verify:testnet
npm run configure:frontend -- testnet
```

`deploy:testnet:dry` chỉ đọc RPC và in chi phí worst-case. `verify:testnet` đối chiếu manifest với chain thật: chain ID, địa chỉ sinh ra từ receipt, nonce liên tục, block range, gas, bytecode tồn tại, liên kết token–vault–core, `vault.core()`, `CORE_ROLE` admin bị khóa, fee receiver, grace period, đúng 5 gói, funding và `reservedInterest <= vault balance`. Sau khi e2e đã mở sổ, thêm `ALLOW_POST_E2E=1` để bỏ qua các check snapshot mới deploy.

Source verification chạy trong `contracts/`:

```powershell
npx hardhat verify --network testnet <MockUSDC>
npx hardhat verify --network testnet <VaultManager> <MockUSDC> <admin> <feeReceiver>
npx hardhat verify --network testnet <SavingCore> <MockUSDC> <VaultManager> 259200
```

### Deployment đang dùng

| Contract | Địa chỉ trên Sepolia |
| --- | --- |
| `MockUSDC` | [`0x1fFa8aF3aF716E245A5501B086d1C01375F192fc`](https://sepolia.etherscan.io/address/0x1fFa8aF3aF716E245A5501B086d1C01375F192fc#code) |
| `VaultManager` | [`0xA128175f2C1099Ecc3933876a3d0BF931816867C`](https://sepolia.etherscan.io/address/0xA128175f2C1099Ecc3933876a3d0BF931816867C#code) |
| `SavingCore` | [`0xC5Dd267CfefC629E722110F8086c0DDc33a5a302`](https://sepolia.etherscan.io/address/0xC5Dd267CfefC629E722110F8086c0DDc33a5a302#code) |

Deployer kiêm fee receiver: [`0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731`](https://sepolia.etherscan.io/address/0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731). Contract deploy ở block `12018179`; 12 giao dịch setup kết thúc ở block `12018193`, gas thực tế `478.354.062.456` wei (khoảng `0,000478` ETH). Manifest đầy đủ ở [contracts/deployments/testnet.json](contracts/deployments/testnet.json).

Năm gói trên chain:

| Plan | Kỳ hạn | APR | Min | Max | Phạt sớm |
| --- | --- | --- | --- | --- | --- |
| 1 | 30 ngày | 1,75% | 100 USDC | 25.000 USDC | 2,00% |
| 2 | 90 ngày | 2,25% | 500 USDC | 100.000 USDC | 4,00% |
| 3 | 180 ngày | 3,00% | 1.000 USDC | 250.000 USDC | 4,50% |
| 4 | 365 ngày | 4,00% | 2.500 USDC | 500.000 USDC | 5,00% |
| 5 | 1 ngày | 5,00% | 10 USDC | 10.000 USDC | 1,00% |

Giao dịch deploy và setup:

- Deploy `MockUSDC`: [`0x68b959...c460a`](https://sepolia.etherscan.io/tx/0x68b9592d4e3c1345a6f58e715e0aa8288ce0bcf62e37f1b08c6d41f6599c460a)
- Deploy `VaultManager`: [`0x23176a...4fd8a`](https://sepolia.etherscan.io/tx/0x23176ab6658b4f56e9d227f7bfbf1359bd12cc5d39a78841f45ab0dd25a4fd8a)
- Deploy `SavingCore`: [`0xb4612e...788c4`](https://sepolia.etherscan.io/tx/0xb4612e692a10e88372ef32e7a99d5f0cfe4a22986348dfbd8fb49eb81df788c4)
- `setCoreOnce`: [`0xdf3f3c...14960`](https://sepolia.etherscan.io/tx/0xdf3f3cc8eb73ecfbf090be083525a1c9f40cbc3fdbff703f9e288b76fbf14960)
- Mint `150.000 USDC`: [`0x2a7918...ad6e9a`](https://sepolia.etherscan.io/tx/0x2a7918d114886209ccefb3797d1fa7d44aad3494ab331e9c420d41ab95ad6e9a)
- Approve và fund vault `100.000 USDC`: [`0xd0c4da...d1ed85`](https://sepolia.etherscan.io/tx/0xd0c4da02801cfebfe73a1e73f166ce34a80478a9aba9811fb8ae49ebc9d1ed85), [`0x7b68f0...23d9e3`](https://sepolia.etherscan.io/tx/0x7b68f0170b9305cfc8f23cb3f2baa5011933e750f043b446fcd7dc127d23d9e3)
- Tạo gói 1–5: [`0x80c93e...5d376e`](https://sepolia.etherscan.io/tx/0x80c93e1474682cb9ea8fb28fc6e2507fc2a7fa4b321aa14d03673c7d055d376e), [`0x3460ff...641ccb`](https://sepolia.etherscan.io/tx/0x3460ff168d659c915f414383fb1b270958096e733cab31b7dd02068b6c641ccb), [`0x8c0c1b...57ae17b`](https://sepolia.etherscan.io/tx/0x8c0c1b2e6203de09b5b380bf02b3d9d1a86124ba41ce45f765de7f12957ae17b), [`0xa3a860...0157b4d`](https://sepolia.etherscan.io/tx/0xa3a860edd11f6d48ddb2c4a34d7e211837512b28d670d154bd3e48db60157b4d), [`0x5f8ac4...783ebed`](https://sepolia.etherscan.io/tx/0x5f8ac459ad943c22fc94824b1f0bfcca38b64fe49bbafc3d97361ac25783ebed)

Giao dịch e2e phase `immediate`:

- Approve `SavingCore`: [`0x314359...af65bc`](https://sepolia.etherscan.io/tx/0x3143595c632325cc12515169808d2ce730e14d92ded1c667205b34e775af65bc)
- Mở D1 `100 USDC`: [`0x2f74c3...333ba7`](https://sepolia.etherscan.io/tx/0x2f74c3a2662b766288c7e5628bd627cfe6b8224a120ce3bf9616aef85d333ba7)
- Nạp thêm D1 `50 USDC`: [`0xb4b67e...1aaae`](https://sepolia.etherscan.io/tx/0xb4b67e8ac2f063b41c97205e8247464e04eba23a4842c598511b29f0bde1aaae)
- Rút sớm một phần D1 `40 USDC`: [`0x6cecb9...6912bc`](https://sepolia.etherscan.io/tx/0x6cecb9a831e4ab9a2f7a11a14326ed615ffc84a3c8bc2776e13d2a09866912bc)
- Pause vault: [`0xac358e...bc6a32`](https://sepolia.etherscan.io/tx/0xac358e3b12504863886f732a41d58c29c6dda9a66455c415be62beb9c8bc6a32); unpause: [`0x074d8e...7b1c26`](https://sepolia.etherscan.io/tx/0x074d8e5a2729acb27f35a335b37a5f737e0c4d123ac9df5a12d5cd2ae13b1c26)
- Rút phần chưa hứa `1 USDC`: [`0x7d17d3...d0591108`](https://sepolia.etherscan.io/tx/0x7d17d3a9267afba0966d0192795eada4b45b0b823a5008fd0a6a3486d0591108); hoàn lại: [`0xbe2860...aad946`](https://sepolia.etherscan.io/tx/0xbe286008dcda7d05786367dc5d5b381005e52bc330976e4774a6e70cb9aad946)
- Rút sớm toàn bộ D1: [`0xc8bc17...1e65da`](https://sepolia.etherscan.io/tx/0xc8bc17e3be13b59e1557abd2e4ddc72afaafe1b353e12a5307a5c5ce531e65da)
- Mở T1–T6 gói 1 ngày: [`0x9d3e32...5f7005`](https://sepolia.etherscan.io/tx/0x9d3e329a9a10b46fb2bafc03ce30450807f34f206adf4278e2ecd886af5f7005), [`0x8a3d8d...d59db1`](https://sepolia.etherscan.io/tx/0x8a3d8db465a7942ece5ef524f6f78123577694677776d2ee4e094bf4d8e59db1), [`0x10ed06...c97f77`](https://sepolia.etherscan.io/tx/0x10ed06b618b8e813874430c45b9d8b022f860a9a6a7d029a58e83b1492c97f77), [`0x951a99...cb9b13`](https://sepolia.etherscan.io/tx/0x951a996bc874ea3d823dbe140a60871b73f847306adcca40fe1b015479cb9b13), [`0x722565...c78f6`](https://sepolia.etherscan.io/tx/0x722565199005995df3b6c660c9465c5d3d84b2ac4b981a67269b19abd25c78f6), [`0x102995...f734f060`](https://sepolia.etherscan.io/tx/0x1029953dbe5ced9445e248f1f431c18b99c5ce0a567772e2fa9aefe2f734f060)
- Rút sớm một phần T2: [`0x7c0ecc...5ed631`](https://sepolia.etherscan.io/tx/0x7c0ecc583abe897a171eee0e0aa742525299a252060098d54213d9669f5ed631)
- Nạp thêm T3: [`0x8b3473...ed15ac`](https://sepolia.etherscan.io/tx/0x8b34730c5c37623dbdf04e148004e3bb515f4d8989520f5edde2951feaed15ac)
- Fund tài khoản thứ hai: [`0x3a0beb...9d9526`](https://sepolia.etherscan.io/tx/0x3a0bebf6d7bc56ed2c212f0a5a0b8a9c52b544ff2d2bd9b6d2acedf9b79d9526)
- Chuyển NFT T4: [`0x7ca591...aaacab`](https://sepolia.etherscan.io/tx/0x7ca591211eb0c5e4e4f6340927d9a7e2b461b2bad6a538efba9ec5b35faaacab)

## Đổi bộ tham số theo MSSV khác

1. Sửa `STUDENT_ID`, `A`, `B` trong [contracts/config/personal.ts](contracts/config/personal.ts). Bốn hằng số còn lại được tính tự động.
2. Chạy `npm test` để kiểm tra với bộ số mới.
3. Deploy lại: grace period là constructor `immutable`, không sửa được sau deploy. Chạy `deploy:testnet`, `verify:testnet`, rồi `configure:frontend -- testnet`.
4. Khởi động lại Vite để đọc `.env.local` mới. Manifest `contracts/deployments/testnet.json` ghi lại `personalVariant` thực tế đã deploy.

Frontend không hard-code APR/penalty/tenor: nó đọc gói qua `plans(planId)` và đọc snapshot trên từng sổ từ chain.

## Những phần chưa làm

- Chạy `test:sepolia:mature` từ 2026-10-30 08:21 UTC và `test:sepolia:auto-renew` từ 2026-11-02 08:21 UTC.
- Walkthrough MetaMask thật với bản Sepolia và video demo 3–5 phút; browser pass VI/EN ở 1440/390.
- C1 claim trên Sepolia: vault đang funded đủ và C2 chặn admin rút phần đã hứa, nên không thể tạo thiếu hụt an toàn trên deployment này. C1 đã có unit test.
- Creative challenge C5.
- Ví khác ngoài MetaMask. Adapter chỉ dùng EIP-1193 nên ví khác có thể chạy, nhưng mới kiểm thử với MetaMask.
- Tách quyền chi tiết hơn (`PLAN_MANAGER_ROLE`, `VAULT_ADMIN_ROLE`), multisig/timelock cho admin.

## Lệnh thường dùng

| Lệnh | Việc nó làm |
| --- | --- |
| `npm run dev` | chạy Vite ở cổng 5173 |
| `npm run build` | typecheck và build production cho frontend |
| `npm run lint` | chạy oxlint |
| `npm test` | chạy 74 test Hardhat |
| `npm run coverage` | chạy test kèm báo cáo coverage |
| `npm run contracts:typecheck` | kiểm tra TypeScript phần contract |
| `npm run contracts:compile` | compile contract bằng Hardhat |
| `npm run contracts:export-abis` | compile rồi sinh lại `frontend/src/contracts/abis.ts` |
| `npm run deploy:testnet:dry` | ước lượng gas deploy trên Sepolia, không gửi giao dịch |
| `npm run deploy:testnet` | deploy lên Sepolia |
| `npm run verify:testnet` | xác thực deployment Sepolia |
| `npm run configure:frontend -- testnet` | ghi `frontend/.env.local` từ manifest |
| `npm run test:sepolia` | phase `immediate` trên Sepolia thật |
| `npm run test:sepolia:status` | đọc state và mốc thời gian của các phase |
| `npm run test:sepolia:mature` | phase tất toán/tái gửi sau đáo hạn |
| `npm run test:sepolia:auto-renew` | phase auto-renew sau grace |

Toàn bộ deploy, verify và e2e đều khóa ở chain ID `11155111`; repo không có script deploy local, fork hay deploy song song. Mạng in-process `31337` chỉ phục vụ unit test.
