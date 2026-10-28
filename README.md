# TÍCH — Sổ tiết kiệm kỳ hạn on-chain

Đồ án môn Lập trình Blockchain: một hệ thống gửi tiết kiệm có kỳ hạn chạy hoàn toàn bằng smart contract. Người dùng khóa MockUSDC vào contract, nhận một chứng chỉ NFT (ERC-721) làm bằng chứng cho khoản gửi, hưởng lãi đơn theo lãi suất đã chốt lúc mở sổ, rồi tất toán đúng hạn, rút trước hạn chịu phạt, hoặc tái tục sang kỳ hạn mới.

Phần giao diện là React + TypeScript, kết nối MetaMask và đọc/ghi trực tiếp lên ba contract đã deploy trên Sepolia. Sau khi kết nối, số dư, danh sách gói và danh sách sổ đều đọc từ chain; frontend chỉ giữ một bộ gói mặc định để vẽ khung trang trong lúc chờ RPC trả về.

## Thông số cá nhân hóa theo MSSV

Đề yêu cầu mỗi sinh viên dùng một bộ tham số riêng. Với MSSV **22665321**, hai chữ số cuối là `21`, nên:

- `A = 1` — chữ số cuối cùng
- `B = 2` — chữ số áp út

| Tham số | Công thức | Giá trị đang dùng |
| --- | --- | --- |
| Grace period | `(A mod 3) + 2` ngày | 3 ngày (259.200 giây) |
| APR mặc định | `200 + A × 25` bps | 225 bps = 2,25%/năm |
| Phạt rút sớm | `300 + B × 50` bps | 400 bps = 4,00% |
| Kỳ hạn mặc định | `B` chẵn → 90 ngày | 90 ngày |

Toàn bộ giá trị này nằm trong [contracts/config/personal.ts](contracts/config/personal.ts). File đó vừa là nguồn sự thật cho test, vừa là đầu vào của script deploy, nên không có chỗ nào khác hard-code lại.

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

Frontend đọc địa chỉ từ `frontend/.env.local`. File này nằm trong `.gitignore` và phải được tạo lại trên mỗi máy:

```text
VITE_CHAIN_ID=11155111
VITE_DEPLOY_BLOCK=12010637
VITE_CORE_ADDRESS=0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf
VITE_VAULT_ADDRESS=0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5
VITE_USDC_ADDRESS=0x4A5ee598558e49c78a545417B38251566482785c
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
3. Thêm token để nhìn thấy số dư: contract `0x4A5ee598558e49c78a545417B38251566482785c`, symbol `USDC`, decimals `6`.
4. Vào **Gói tiết kiệm**, chọn kỳ hạn, bấm mở sổ. Lần đầu tiên, ví sẽ hỏi hai giao dịch: `approve` cấp hạn mức USDC cho contract, sau đó `openDeposit`. Những lần sau hạn mức vẫn còn nên chỉ còn một giao dịch mở sổ.
5. Vào **Sổ của tôi** để xem chứng chỉ NFT, tất toán, rút trước hạn hoặc tái tục.

MockUSDC là token test và hàm `mint` mở công khai, nên ví chưa có tiền vẫn lấy được: vào trang [Write Contract](https://sepolia.etherscan.io/address/0x4A5ee598558e49c78a545417B38251566482785c#writeContract), gọi `mint` với địa chỉ ví và số lượng theo đơn vị 6 decimals (1.000 USDC = `1000000000`). Ví cũng cần một ít Sepolia ETH để trả gas; faucet có trong chainlist hoặc ở [sepoliafaucet.com](https://sepoliafaucet.com).

## Kiểm thử

```powershell
npm test
npm run coverage
npm run contracts:typecheck
```

Kết quả lần chạy gần nhất (2026-10-28):

```text
35 passing
MockUSDC       100.00% lines / 100.00% statements
VaultManager   100.00% lines / 100.00% statements
SavingCore     100.00% lines / 100.00% statements
Total          100.00% lines / 100.00% statements
```

Bộ test phủ các luồng bắt buộc, các nhánh lỗi và mấy chỗ dễ sai: thiếu allowance, snapshot APR sau khi admin sửa gói, biên đáo hạn và biên grace, rút hai lần, vault thiếu lãi khi cả rút lẫn tái tục, pause chặn mọi lối ra, chuyển NFT đổi chủ, gói có penalty bằng 0 và trường hợp lãi làm tròn xuống 0. Chi tiết cách chia nhóm test nằm trong [contracts/README.md](contracts/README.md).

## Đổi bộ tham số theo MSSV khác

MSSV không phải 22665321 thì phải sửa trước khi nộp, vì giảng viên sẽ đối chiếu con số trên video với MSSV thật.

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

Frontend không hard-code các tham số này: nó đọc `plans(planId)` và `gracePeriod()` từ chain. Chỉ có [frontend/src/data/seed.ts](frontend/src/data/seed.ts) giữ một bản sao cho lần render đầu tiên trước khi RPC trả về, nên nếu đổi variant thì cập nhật luôn file đó để giao diện không nháy số cũ trong tích tắc.

## Deploy lên Sepolia

Network `testnet` trong [hardhat.config.ts](contracts/hardhat.config.ts) bị khóa vào chain ID `11155111`. Hai biến môi trường bắt buộc, truyền riêng cho phiên PowerShell đang làm việc:

```powershell
$env:TESTNET_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:FEE_RECEIVER_ADDRESS='0x...'                     # tùy chọn, mặc định là deployer
$env:EXPLORER_BASE_URL='https://sepolia.etherscan.io'  # tùy chọn, chỉ ghi vào manifest

npm --prefix contracts run deploy:testnet
npm --prefix contracts run verify:testnet
npm run test:sepolia
npm run test:sepolia:fork
```

`verify:testnet` đọc RPC thật rồi đối chiếu chain ID, bytecode từng contract, liên kết token–vault–core, role, grace period, fee receiver, bốn gói và số dư vault. `test:sepolia` gửi giao dịch thật để mở sổ và rút trước hạn. `test:sepolia:fork` dựng một bản fork của state Sepolia tại block đã deploy rồi tua thời gian, nhờ vậy kiểm tra được tất toán, tái tục và auto-renew mà không phải chờ 90 ngày — hash in ra ở chế độ này chỉ tồn tại trên fork local.

Deploy một lần là đủ cho cả đồ án. Chạy lại `deploy:testnet` sẽ tạo bộ địa chỉ mới và tốn thêm Sepolia ETH.

### Deployment đang dùng

| Contract | Địa chỉ trên Sepolia |
| --- | --- |
| `MockUSDC` | [`0x4A5ee598558e49c78a545417B38251566482785c`](https://sepolia.etherscan.io/address/0x4A5ee598558e49c78a545417B38251566482785c#code) |
| `VaultManager` | [`0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5`](https://sepolia.etherscan.io/address/0x63C7e3c9c3F70b1692f13ad21252ba3a02e3bEe5#code) |
| `SavingCore` | [`0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf`](https://sepolia.etherscan.io/address/0xD2297a633D35f2F6E78f4eAD8BF214E241704ECf#code) |

Deployer kiêm fee receiver: [`0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731`](https://sepolia.etherscan.io/address/0xE19750FC95F44bE27E4ec44F2779d2C38ba6F731). Contract được deploy ở block `12010637`, phần setup (cấp role, mint, approve, nạp vault, tạo bốn gói) kết thúc ở block `12010648`. Source của cả ba contract đã được verify trên Etherscan, nên tab **Contract** hiển thị code Solidity và gọi được hàm đọc/ghi trực tiếp.

Giao dịch thật để đối chiếu:

- Mở sổ #1: [`0x20d46a...360021`](https://sepolia.etherscan.io/tx/0x20d46a1328c1a324661757cf8d1a09db05fd4e21599792fc79de07f757360021)
- Rút sớm sổ #1: [`0xc6b611...05df36`](https://sepolia.etherscan.io/tx/0xc6b611b31e964f34858fad56f1c136190ba4ddcb4bf0ce9bdb85881f4805df36)
- Mở sổ #2 (giữ active): [`0x827643...536fe8`](https://sepolia.etherscan.io/tx/0x8276434d4bf8f12d3c0a92bd6679778414ebdc601b39eedd724ced12bf536fe8)
- Mở sổ #3 và rút sớm: [`0xcfb224...012dbc`](https://sepolia.etherscan.io/tx/0xcfb224aa1e68d38fb9bd8a3631a17d53b4ea834c883147215ec8d5711c012dbc), [`0xaebb39...dd5aa`](https://sepolia.etherscan.io/tx/0xaebb39079f2f3c49f2a14886e7e878fb83f1595241b1c2608081f871925dd5aa)
- Mở sổ #4 và rút sớm: [`0x35d2df...facc2c`](https://sepolia.etherscan.io/tx/0x35d2dff23b49ed157a3fd5827164e763bd48365ce5fe5833126525feb4facc2c), [`0x539bcc...126298`](https://sepolia.etherscan.io/tx/0x539bcc406bd2b502ea0bb0c0f198fdad7851738013c1120e92d142f4cc126298)
- Mở sổ #5 ký trực tiếp bằng MetaMask: [`0xf54eb8...7c2854`](https://sepolia.etherscan.io/tx/0xf54eb8033242c0b0943bd386bcac017a8436a0ef660bd771bccba3f11d7c2854)

Mở transaction của sổ #5 rồi vào tab **Logs**, sự kiện `DepositOpened` cho thấy đủ `depositId = 5`, `planId = 2`, `principal = 500000000` và `aprBpsAtOpen = 225`. Đó cũng là cách kiểm tra nhanh rằng lãi suất được contract chốt tại thời điểm mở sổ chứ không phải do frontend gửi lên.

## Kiến trúc

Ba contract, mỗi cái giữ một loại tiền khác nhau:

| Contract | Giữ gì | Việc chính |
| --- | --- | --- |
| `MockUSDC` | không giữ tiền | ERC-20 6 decimals, `mint` công khai để test |
| `VaultManager` | tiền lãi của ngân hàng | nạp/rút vault, fee receiver, pause, trả lãi cho `SavingCore` |
| `SavingCore` | gốc của người gửi | gói, NFT chứng chỉ, snapshot, tất toán, rút sớm, tái tục |
| `IVaultManager` | — | interface định kiểu cho ba lời gọi từ core sang vault |

Việc tách gốc và lãi không chỉ để cho giống ngân hàng thật. Nếu gộp chung, một sổ đáo hạn sẽ được trả bằng tiền của người gửi sau, tức là mô hình Ponzi thu nhỏ. Ở đây `SavingCore` chỉ trả gốc bằng đúng khoản đã nhận khi mở sổ, còn lãi luôn đi qua `VaultManager`. Vault cạn tiền thì `payInterest` revert và cả giao dịch quay lại trạng thái cũ.

Mỗi lần mở sổ, contract lưu một struct `Deposit` gồm `principal`, `aprBpsAtOpen`, `penaltyBpsAtOpen`, `tenorDays`, `openedAt`, `maturityAt` và `status`. Lãi và phạt luôn tính từ bản snapshot này, nên admin sửa gói về sau chỉ ảnh hưởng người mở sổ mới.

Công thức lãi đơn, dùng `Math.mulDiv` để nhân trước chia sau:

```text
interest = principal × aprBpsAtOpen × tenorDays / (365 × 10_000)
penalty  = principal × penaltyBpsAtOpen / 10_000
```

Bốn trạng thái của một sổ là `Active`, `Withdrawn`, `ManualRenewed` và `AutoRenewed`. Ba hàm do người dùng chủ động gọi là tất toán, rút sớm và tái tục thủ công đều kiểm tra cả `status == Active` lẫn `ownerOf(depositId) == msg.sender`. Riêng `autoRenewDeposit` cố tình không chặn người gọi, nhưng vẫn chỉ nhận sổ `Active` và mint chứng chỉ mới cho chủ sở hữu hiện tại của NFT.

## Design Answers

Phần này trả lời bảy câu hỏi trong đề, dựa trên đúng code đang chạy chứ không phải thiết kế trên giấy.

### 1. Chứng chỉ chuyển nhượng: Alice bán NFT cho Bob thì ai rút được?

Bob, vì quyền rút gắn với chủ sở hữu NFT hiện tại chứ không gắn với người mở sổ ban đầu. Mỗi lần chủ sổ gọi tất toán, rút sớm hoặc tái tục, [`_requireActiveOwner`](contracts/contracts/SavingCore.sol#L293) kiểm tra `ownerOf(depositId) == msg.sender`; Alice sau khi chuyển NFT không còn thỏa điều kiện đó nên gọi vào sẽ nhận lỗi `Core: not certificate owner`. Nhánh auto-renew cũng mint chứng chỉ mới cho `ownerOf(depositId)` tại thời điểm gia hạn, nên quyền lợi đi theo NFT chứ không quay về người gửi cũ.

Cách làm này cho phép hình thành thị trường thứ cấp: người cần tiền gấp có thể bán sổ đang có lãi suất tốt thay vì chịu phạt 4% rồi mất toàn bộ lãi. Đổi lại, NFT trở thành tài sản "ai cầm là của người đó". Mất ví, lỡ `approve`, hay chuyển nhầm địa chỉ đều đồng nghĩa mất luôn quyền rút tiền, và ngân hàng không có cách nào can thiệp. Vì vậy giao diện chỉ liệt kê những chứng chỉ mà ví đang kết nối thực sự sở hữu, không lưu lại người gửi ban đầu, và mỗi thẻ sổ có liên kết sang Etherscan để đối chiếu chủ sở hữu thật trên chain.

### 2. Vault hết tiền khi đáo hạn thì chuyện gì xảy ra?

Giao dịch revert, người dùng chưa lấy được gì, và sổ vẫn ở trạng thái `Active`. Trong [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L153), contract tính lãi, đổi status sang `Withdrawn`, rồi mới gọi `VaultManager.payInterest`. Nếu vault không đủ tiền, `payInterest` revert với `Vault: insufficient interest` và toàn bộ transaction bị rollback, kể cả thay đổi status vừa rồi. Test `reverts without changing status when the vault cannot pay interest` chứng minh đúng hành vi này: gốc vẫn nằm trong `SavingCore` và người dùng có thể thử lại sau khi vault được nạp.

Điểm yếu của quy tắc này là ngân hàng có thể khóa tiền của chính người gửi bằng cách đơn giản là không nạp vault. Tôi vẫn giữ revert vì đề quy định vậy và vì nó làm lộ rõ tình trạng mất khả năng thanh toán thay vì che đi. Hướng tốt hơn là trả gốc ngay, ghi phần lãi chưa trả thành một khoản claim để người dùng rút sau khi vault có tiền — đúng ý tưởng của creative challenge C1. Tôi không chọn C1 vì nó đổi kiến trúc thanh toán và cần thêm state cùng test riêng.

### 3. Bot auto-renew chết một tháng thì ai mất gì?

Không ai mất tiền. Sổ chỉ nằm yên ở trạng thái `Active` sau khi hết grace, không bị xóa và không mất lãi đã chốt. Người dùng vẫn tự gọi được `withdrawAtMaturity` hoặc `renewDeposit` bất cứ lúc nào, vì hai hàm này chỉ yêu cầu `block.timestamp >= maturityAt` mà không có cận trên. Bản thân [`autoRenewDeposit`](contracts/contracts/SavingCore.sol#L219) cũng không giới hạn người gọi, nên ví của người dùng, một keeper khác hay chính script của ngân hàng đều kích hoạt được.

Cái mất là cơ hội: kỳ hạn mới bắt đầu muộn hơn dự kiến, nên khoản tiền nằm không một thời gian thay vì tiếp tục sinh lãi. Nếu làm tiếp, tôi sẽ thêm nút "gia hạn ngay" ngay trên thẻ sổ khi chạm mốc grace, kèm một keeper độc lập chạy song song. Điều quan trọng là giữ hàm auto-renew ở dạng permissionless, để một bot chết không kéo theo cả hệ thống.

### 4. Phần lẻ khi chia lãi đi đâu?

Đi vào vault đối với lãi, và nằm lại trong `SavingCore` đối với tiền phạt. Cả hai phép tính dùng `Math.mulDiv` trong [`_interestFor`](contracts/contracts/SavingCore.sol#L298) và [`_penaltyFor`](contracts/contracts/SavingCore.sol#L307), tức là nhân hết rồi mới chia và luôn làm tròn xuống. Ví dụ lãi thực tế là 2,777... USDC thì contract trả 2,77 và phần lẻ dưới một đơn vị 6 decimals không được chuyển đi đâu cả, nó vẫn nằm trong vault. Với tiền phạt cũng vậy: `penalty` tính ra bao nhiêu thì chuyển đúng bấy nhiêu cho fee receiver, phần chênh lệch không đáng kể ở lại cùng gốc.

Làm tròn xuống không thể gây revert hay âm số, vì nó chỉ làm số phải trả nhỏ đi. Trường hợp xấu nhất là lãi tròn về 0. Test với gốc 1 đơn vị, APR 1 bps và kỳ hạn 1 ngày cho ra đúng 0 lãi; khi đó `if (interest > 0)` bỏ qua lời gọi `payInterest` và người dùng vẫn rút được gốc bình thường. Không có sổ kế toán riêng cho phần lẻ, nên cũng không có chuyện phần lẻ bị rút hai lần.

### 5. Đúng giây đáo hạn thì là rút sớm hay rút đúng hạn?

Là rút đúng hạn. [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L153) và [`renewDeposit`](contracts/contracts/SavingCore.sol#L190) dùng `block.timestamp >= maturityAt`, còn [`earlyWithdraw`](contracts/contracts/SavingCore.sol#L170) dùng `block.timestamp < maturityAt`. Hai điều kiện loại trừ nhau hoàn toàn, không có giây nào lọt vào cả hai nhánh. Tôi chọn dấu `>=` cho mốc đáo hạn vì bảo vệ người gửi: ai canh đúng giây đáo hạn để rút thì không bị trừ 4% oan.

Với auto-renew, điều kiện là `block.timestamp >= maturityAt + gracePeriod`, nên giây cuối cùng của grace đã tính là đủ. Người dùng vẫn có thể tái tục thủ công tại đúng giây đó nếu giao dịch auto-renew chưa được thực thi, vì `renewDeposit` chỉ quan tâm mốc đáo hạn chứ không quan tâm grace. Chỉ khi một giao dịch auto-renew đã chạy thì sổ mới đổi trạng thái và cửa tái tục thủ công mới đóng.

### 6. Admin tắt gói trong khi vẫn còn sổ đang chạy thì sao?

Những sổ đó không bị ảnh hưởng gì. `setPlanEnabled` chỉ đổi cờ `plans[planId].enabled`, còn dữ liệu của từng sổ là bản snapshot riêng nên vẫn giữ nguyên APR, penalty và tenor. Người dùng tiếp tục tất toán đúng hạn, rút sớm với mức phạt cũ, hoặc tái tục sang một gói khác đang mở.

Chỗ tôi chủ động chặn là tái tục *vào* gói đã tắt: `renewDeposit` kiểm tra `newPlan.enabled` nên không ai đẩy được vốn mới vào một sản phẩm đã đóng. Ngược lại, [`autoRenewDeposit`](contracts/contracts/SavingCore.sol#L219) vẫn cho phép gia hạn theo gói gốc dù gói đó đã bị tắt. Lý do: auto-renew là nghĩa vụ đã cam kết với sổ đang mở, không phải một khách hàng mới mở sổ. Nếu chặn luôn nhánh này, việc đóng một sản phẩm sẽ tước mất quyền gia hạn đã hứa với người gửi cũ.

### 7. Một cuộc tấn công thực tế và cơ chế chặn

Kịch bản tôi chọn là rút hai lần, hoặc dùng reentrancy để cố rút lần thứ hai trong lúc giao dịch đầu chưa kết thúc. Cả [`withdrawAtMaturity`](contracts/contracts/SavingCore.sol#L153) lẫn [`earlyWithdraw`](contracts/contracts/SavingCore.sol#L170) đều gắn `nonReentrant`, nên lời gọi lồng vào chính hàm đó bị chặn ngay ở modifier. Ngoài ra contract đổi `status` sang `Withdrawn` *trước* khi gọi token, theo đúng thứ tự checks–effects–interactions; giao dịch thứ hai sau đó sẽ dừng ở `Core: deposit inactive` trong `_requireActiveOwner`.

Hai lớp nữa nằm ở phía vault. `payInterest` chỉ nhận lời gọi từ địa chỉ có `CORE_ROLE`, và `asset` cùng `vault` đều là `immutable` được gán trong constructor, nên không ai thay được token giả hay vault giả sau khi deploy. Một điểm yếu còn lại là admin có thể rút vault bất cứ lúc nào, khiến các sổ đang hưởng lãi bỗng dưng không tất toán được — đúng vấn đề mà creative challenge C2 nhắm tới. Tôi chưa làm C2, nên biện pháp hiện tại là giữ vai trò admin ở ví deployer và không rút vault trong lúc demo.

## Những phần chưa làm

- Video demo 3–5 phút theo yêu cầu mục 11 của đề.
- Creative challenge C1–C5. Cả năm đều đổi kiến trúc hoặc thêm state, và mỗi cái cần test cùng ghi chú riêng; tôi ưu tiên làm chắc bốn luồng bắt buộc trước.
- Solvency guard cho vault (C2). Hiện admin vẫn rút được toàn bộ tiền lãi, kể cả phần đã hứa cho các sổ đang chạy.
- Ví khác ngoài MetaMask. Adapter chỉ dùng EIP-1193 nên ví khác có thể chạy được, nhưng tôi mới kiểm thử với MetaMask.

## Lệnh thường dùng

| Lệnh | Việc nó làm |
| --- | --- |
| `npm run dev` | chạy Vite ở cổng 5173 |
| `npm run build` | typecheck và build production cho frontend |
| `npm run lint` | chạy oxlint |
| `npm test` | chạy 35 test Hardhat |
| `npm run coverage` | chạy test kèm báo cáo coverage |
| `npm run contracts:typecheck` | kiểm tra TypeScript của phần contract |
| `npm run deploy:local` | deploy lên Hardhat node ở `127.0.0.1:8545` |
| `npm run verify:local` | đối chiếu deployment local với manifest |
| `npm run deploy:testnet` | deploy lên Sepolia |
| `npm run verify:testnet` | xác thực deployment Sepolia |
| `npm run test:sepolia` | gửi giao dịch thật lên Sepolia |
| `npm run test:sepolia:fork` | tua thời gian trên fork của Sepolia |
| `npm run configure:frontend -- testnet` | ghi `frontend/.env.local` từ manifest |

Muốn chạy toàn bộ ở máy không có Sepolia, dùng ba terminal. Terminal 1 giữ node bằng `npm --prefix contracts run node`. Terminal 2 deploy và cấu hình:

```powershell
npm --prefix contracts run deploy:local
npm --prefix contracts run verify:local
npm --prefix contracts run configure:frontend -- localhost
```

Terminal 3 chạy `npm run dev`. Nhớ thêm mạng `http://127.0.0.1:8545` với chain ID `31337` vào MetaMask và import một tài khoản test do Hardhat in ra. Địa chỉ local mất khi node tắt, nên đừng dùng nó trong video demo.

