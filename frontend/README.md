# TÍCH frontend

React 19, Vite 8, TypeScript 7 và Tailwind CSS 4.

```powershell
npm install
npm run dev
npm run build
npm run lint
```

## Dữ liệu

- **MetaMask**: chế độ giao dịch duy nhất, chỉ bật khi `frontend/.env.local` có đủ ba địa chỉ contract và chain ID. Adapter nằm ở `src/contracts/adapter.ts`, ABI sinh từ Hardhat artifact ở `src/contracts/abis.ts`.
- **Trạng thái đầu**: `src/state/BankProvider.tsx` khởi tạo rỗng. Trước khi kết nối, Plans hiển thị nút kết nối; sau khi kết nối, hiển thị loading indicator đến khi chain trả dữ liệu. Không có dữ liệu mẫu và không lưu bank state vào `localStorage`.
- **Rút trước hạn**: dialog cho nhập số tiền; nếu nhỏ hơn gốc sẽ gọi `earlyWithdrawPartial`, phần còn lại phải `>= minDeposit` của gói và tiếp tục sinh lãi đến đáo hạn. Nhập đúng gốc thì dùng `earlyWithdraw` toàn bộ.
- **Nạp thêm (C4)**: chỉ hiện trên sổ `active` trước đáo hạn. Dialog tính lãi tăng thêm từ thời gian còn lại và APR snapshot, cho nhập tới `plan.maxDeposit`, rồi gọi `topUpDeposit`. Kỳ hạn, APR và ngày đáo hạn không đổi.
- **Lãi chờ (C1)**: sổ `principal-withdrawn` vẫn hiện trong danh sách khi `pendingInterest > 0`, với nút **Nhận lãi**. Claim bị khóa nếu vault chưa đủ tiền; sau khi claim xong chứng chỉ biến mất khỏi danh sách.
- **C2**: không có màn hình riêng; frontend chỉ đọc số dư vault và hiển thị lỗi claim khi vault chưa đủ tiền trả lãi chờ.
- **Deployment hiện tại**: bản Sepolia `0x215b88d6…bc89` được deploy ngày 2026-10-29 gồm đủ C1–C4; adapter chỉ hỗ trợ bản này và bật nút **Nạp thêm**/**Nhận lãi** theo dữ liệu chain.

Sao chép `.env.example` thành `.env.local`, hoặc để script deployment ở thư mục contracts ghi file này:

```powershell
npm --prefix contracts run configure:frontend -- localhost
```

Restart Vite sau khi tạo hoặc sửa `.env.local`. Không đưa private key vào biến `VITE_*`.

State và luồng thao tác nằm trong `src/state/BankProvider.tsx`; mọi chuỗi VI/EN nằm trong `src/i18n/messages.ts`. Khi thêm màn hình mới, dùng lại component/token hiện có.
