# TÍCH frontend

React 19, Vite 8, TypeScript 7 và Tailwind CSS 4.

```powershell
npm install
npm run dev
npm run build
npm run lint
npm run doctor
```

`npm run doctor` đọc thẳng deployment trên Sepolia bằng đúng đường đọc của adapter và in từng bước PASS/WARN/FAIL. Chạy trước khi demo để biết ngay vì sao trang báo lỗi chain, thay vì chỉ thấy banner chung. Không cần private key. Chỉ định RPC hoặc ví khác:

```powershell
npm run doctor -- --rpc https://sepolia.gateway.tenderly.co
npm run doctor -- --address 0xYourWallet
```

## Dữ liệu

- **Ví injected** (EIP-6963: MetaMask, Rabby, Coinbase Wallet, Brave…) là chế độ giao dịch duy nhất, chỉ bật khi `frontend/.env.local` có đủ ba địa chỉ contract và chain ID. Adapter nằm ở `src/contracts/adapter.ts`, ABI sinh từ Hardhat artifact ở `src/contracts/abis.ts`.
- **Trạng thái đầu**: `src/state/BankProvider.tsx` khởi tạo rỗng. Trước khi kết nối, Plans hiển thị nút kết nối; sau khi kết nối, hiển thị loading indicator đến khi chain trả dữ liệu. Bank state chỉ nằm trong bộ nhớ và không được lưu vào `localStorage`.
- **Rút trước hạn (C3)**: dialog cho nhập số tiền; nếu nhỏ hơn gốc sẽ gọi `earlyWithdrawPartial`, phần còn lại phải `>= minDeposit` của gói và tiếp tục sinh lãi đến đáo hạn. Nhập đúng gốc thì dùng `earlyWithdraw` toàn bộ.
- **Nạp thêm (C4)**: chỉ hiện trên sổ `active` trước đáo hạn. Dialog tính lãi tăng thêm từ thời gian còn lại và APR snapshot, cho nhập tới `plan.maxDeposit`, rồi gọi `topUpDeposit`. Kỳ hạn, APR và ngày đáo hạn không đổi.
- **Lãi chờ (C1)**: sổ `principal-withdrawn` vẫn hiện trong danh sách khi `pendingInterest > 0`, với nút **Nhận lãi**. Dialog khóa xác nhận khi `vault.balance < pendingInterest`; sau khi claim xong chứng chỉ biến mất khỏi danh sách.
- **C2**: không có màn hình riêng. Đây là kế toán nội bộ của vault; frontend chỉ đọc số dư vault để khóa claim khi vault chưa đủ tiền trả khoản đã ghi nợ.
- **USDC test**: mọi ví đã kết nối đều thấy ô **Nhận USDC test** trên trang Plans và Deposits, tự nhập số lượng (mặc định 10.000, chặn trên 1.000.000 mỗi lần để tránh gõ nhầm). Ô này gọi `MockUSDC.mint`, hàm mở công khai không giới hạn, nên không cần role và có thể bấm lại nhiều lần. Đây vẫn là giao dịch thật: ví phải có Sepolia ETH trả gas, nếu thiếu thì báo `errors.gasRequired`.
- **Đọc dữ liệu**: danh sách sổ lấy từ `nextDepositId` + `ownerOf`, không dựa vào event log. Event `Withdrawn` chỉ dùng để làm giàu History (lãi thực nhận, rút sớm hay đáo hạn) và được đọc theo cửa sổ 5.000 block, vì mọi RPC đều giới hạn `eth_getLogs` (Infura 10.000 block) hoặc prune log cũ. Trên node đã prune, vài sổ cũ sẽ mất phần lãi thực nhận và rơi về `interestAtMaturity` — trang vẫn tải bình thường.

## Deployment hiện tại

Frontend chỉ hỗ trợ deployment Sepolia hiện tại:

| Contract | Address |
| --- | --- |
| `MockUSDC` | `0x460193B776F34D63413d358203516CA44d78ecfE` |
| `VaultManager` | `0x1c5533537118320021b5795473cb2552d11Bf9B5` |
| `SavingCore` | `0x10E9eDb55C0cD100F67DEc8b558649e66B263c79` |

Chain ID `11155111`, deploy block `12026923`. Bản này gồm đủ C1–C4; adapter bật nút **Nạp thêm**/**Nhận lãi** theo dữ liệu chain.

Sao chép `.env.example` thành `.env.local`, hoặc để script deployment ở thư mục contracts ghi file này:

```powershell
npm run configure:frontend -- testnet
```

Khởi động lại Vite sau khi tạo hoặc sửa `.env.local`. Không đưa private key vào biến `VITE_*`.

State và luồng thao tác nằm trong `src/state/BankProvider.tsx`; mọi chuỗi VI/EN nằm trong `src/i18n/messages.ts`. Khi thêm màn hình mới, dùng lại component/token hiện có.
