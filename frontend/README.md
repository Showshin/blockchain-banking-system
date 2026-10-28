# TÍCH frontend

React 19, Vite 8, TypeScript 7 và Tailwind CSS 4.

```powershell
npm install
npm run dev
npm run build
npm run lint
```

## Hai chế độ dữ liệu

- **Ví nội bộ**: state mô phỏng trong `localStorage`, dùng để xem đủ bốn flow khi chưa có chain. Không có giao dịch thật.
- **MetaMask**: chỉ bật khi `frontend/.env.local` có đủ ba địa chỉ contract và chain ID. Adapter nằm ở `src/contracts/adapter.ts`, ABI sinh từ Hardhat artifact ở `src/contracts/abis.ts`.

Sao chép `.env.example` thành `.env.local`, hoặc để script deployment ở thư mục contracts ghi file này:

```powershell
npm --prefix contracts run configure:frontend -- localhost
```

Restart Vite sau khi tạo hoặc sửa `.env.local`. Không đưa private key vào biến `VITE_*`.

State và luồng thao tác nằm trong `src/state/BankProvider.tsx`; mọi chuỗi VI/EN nằm trong `src/i18n/messages.ts`. Đọc `../docs/DESIGN.md` trước khi thêm màn hình mới và dùng lại component/token hiện có.
