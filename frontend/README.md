# TÍCH frontend

React 19, Vite 8, TypeScript 7 và Tailwind CSS 4.

```powershell
npm install
npm run dev
npm run build
npm run lint
```

## Dữ liệu

- **MetaMask** là chế độ giao dịch duy nhất, chỉ bật khi `frontend/.env.local` có đủ ba địa chỉ contract và chain ID. Adapter nằm ở `src/contracts/adapter.ts`, ABI sinh từ Hardhat artifact ở `src/contracts/abis.ts`.
- **Trạng thái đầu**: `src/state/BankProvider.tsx` khởi tạo rỗng. Trước khi kết nối, Plans hiển thị nút kết nối; sau khi kết nối, hiển thị loading indicator đến khi chain trả dữ liệu. Bank state chỉ nằm trong bộ nhớ và không được lưu vào `localStorage`.
- **Rút trước hạn (C3)**: dialog cho nhập số tiền; nếu nhỏ hơn gốc sẽ gọi `earlyWithdrawPartial`, phần còn lại phải `>= minDeposit` của gói và tiếp tục sinh lãi đến đáo hạn. Nhập đúng gốc thì dùng `earlyWithdraw` toàn bộ.
- **Nạp thêm (C4)**: chỉ hiện trên sổ `active` trước đáo hạn. Dialog tính lãi tăng thêm từ thời gian còn lại và APR snapshot, cho nhập tới `plan.maxDeposit`, rồi gọi `topUpDeposit`. Kỳ hạn, APR và ngày đáo hạn không đổi.
- **Lãi chờ (C1)**: sổ `principal-withdrawn` vẫn hiện trong danh sách khi `pendingInterest > 0`, với nút **Nhận lãi**. Dialog khóa xác nhận khi `vault.balance < pendingInterest`; sau khi claim xong chứng chỉ biến mất khỏi danh sách.
- **C2**: không có màn hình riêng. Đây là kế toán nội bộ của vault; frontend chỉ đọc số dư vault để khóa claim khi vault chưa đủ tiền trả khoản đã ghi nợ.

## Deployment hiện tại

Frontend chỉ hỗ trợ deployment Sepolia hiện tại:

| Contract | Address |
| --- | --- |
| `MockUSDC` | `0x1fFa8aF3aF716E245A5501B086d1C01375F192fc` |
| `VaultManager` | `0xA128175f2C1099Ecc3933876a3d0BF931816867C` |
| `SavingCore` | `0xC5Dd267CfefC629E722110F8086c0DDc33a5a302` |

Chain ID `11155111`, deploy block `12018179`. Bản này gồm đủ C1–C4; adapter bật nút **Nạp thêm**/**Nhận lãi** theo dữ liệu chain.

Sao chép `.env.example` thành `.env.local`, hoặc để script deployment ở thư mục contracts ghi file này:

```powershell
npm run configure:frontend -- testnet
```

Khởi động lại Vite sau khi tạo hoặc sửa `.env.local`. Không đưa private key vào biến `VITE_*`.

State và luồng thao tác nằm trong `src/state/BankProvider.tsx`; mọi chuỗi VI/EN nằm trong `src/i18n/messages.ts`. Khi thêm màn hình mới, dùng lại component/token hiện có.
