# Design system — TÍCH

## Design read

Đây là product UI cho người gửi tiền trong một sản phẩm tiền gửi on-chain, không phải landing page marketing. Ngôn ngữ thị giác là private banking hiện đại: nền trung tính, tương phản mạnh, typography rõ và texture kín đáo. Người dùng chọn giao diện Sáng hoặc Tối. Hai chế độ dùng cùng typography, hình khối, thứ bậc và vị trí thành phần.

Ba dials của dự án:

- DESIGN_VARIANCE: 5 — bất đối xứng vừa phải, ưu tiên khả năng đọc.
- MOTION_INTENSITY: 3 — chuyển động ngắn, có mục đích.
- VISUAL_DENSITY: 5 — nhiều dữ liệu nhưng vẫn thoáng.

## Token

Token nằm trong frontend/src/index.css dưới @theme.

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| --color-paper | #f5f6f3 | #0e100f | nền chính |
| --color-paper-deep | #e9ebe7 | #171a18 | nền phụ, progress track |
| --color-surface | #ffffff | #141715 | card, input |
| --color-ink | #141615 | #f1f4f0 | chữ chính |
| --color-muted | #646965 | #979d98 | chữ phụ, metadata |
| --color-line | #d9ddd8 | #2b302c | hairline border |
| --color-accent | #2b302c | #d9dfda | focus, seal, nhấn phi màu |
| --color-inverse | #171a18 | #f1f4f0 | primary button, nav active |
| --color-on-inverse | #f7f8f5 | #111412 | chữ trên bề mặt inverse |
| --color-contrast | #151917 | #202421 | plan nổi bật, callout số tiền |
| --color-on-contrast | #f5f7f4 | #f1f4f0 | chữ trên bề mặt contrast |

Bảng màu chính là trung tính. Xanh, amber và đỏ chỉ xuất hiện trong trạng thái semantic như active, matured, warning hoặc error. Không thêm purple, cyan neon hay gradient cầu vồng.

Theme Tối được bật bằng `html[data-theme="dark"]` và đổi token cùng `color-scheme`. Chỉ có hai lựa chọn `light` và `dark`, không có System hay fallback theo `prefers-color-scheme`. Lựa chọn được lưu ở `tich-theme-v1`; language ở `tich-lang-v1`.

## Typography

- Sans: Geist Variable, self-host qua @fontsource-variable/geist.
- Mono: Geist Mono Variable, dùng cho số chứng chỉ, địa chỉ, nhãn kỹ thuật.
- Body: 12–14px, line-height 1.5–1.7.
- Eyebrow: 9px, uppercase, tracking 0.18–0.2em.
- Page title: clamp(2rem, 4vw, 3.4rem), weight 500, tracking âm mạnh.
- Số tiền lớn: 2.8–5.4rem, tabular nums, tracking -0.08em.
- Không dùng Inter, Roboto, Arial hoặc serif mặc định.

## Shape, border, shadow

- Card/panel: radius 20px.
- Hero: radius 24px.
- Input/button: radius 10px; button nhỏ 9px; input số tiền 14px.
- Badge: pill.
- Border: 1px hairline --color-line.
- Shadow: rất nhẹ, tint theo nền; không dùng shadow đen đậm.
- Mọi card lớn dùng nền surface hơi trong; certificate và plan card nổi bật dùng texture bằng CSS, không dùng ảnh stock.

Quy tắc shape đã chốt: card 20px, modal/drawer 24px, control 10px, badge pill. Không trộn thêm radius khác nếu không có lý do.

## Layout

- Desktop từ 1024px: rail trái rộng 264px, brand ở đầu rail, hai mục điều hướng xếp thành hàng ngang, Cài đặt và ví ở cuối rail. Popover Cài đặt mở lên trên nút trigger. Nội dung nằm trong cột phải, max-width 1180px.
- Dưới 1024px: topbar sticky gồm brand, nút Cài đặt dạng icon và ví; hai link điều hướng nằm thành hàng riêng dưới brand. Popover Cài đặt mở xuống dưới trigger, rộng tối đa 288px và không vượt viewport.
- Main max-width 1180px, padding 16/24/32px theo breakpoint.
- Breakpoints dùng mặc định Tailwind: 640, 768, 1024, 1280, 1536.
- Desktop: plan card 2 cột; certificate card 2 cột ở xl; summary strip 3 ô.
- Dưới 640px: page header stack; card full width.
- Không dùng h-screen; dùng min-h-dvh.

## Component map

| Class/component | Vai trò |
|---|---|
| .panel | bề mặt thông tin mặc định |
| .certificate | chứng chỉ NFT, texture guilloche, seal |
| .plan-card | gói tiết kiệm, APR lớn, meta, CTA |
| .btn, .btn-primary, .btn-secondary, .btn-paper | hành động |
| .input, .amount-input | nhập số tiền |
| .wallet-option | chọn MetaMask hoặc ví nội bộ |
| SettingsMenu | popover Cài đặt: chuyển VI/EN và theme Sáng/Tối; lưu lựa chọn trong localStorage |

Component React tương ứng nằm trong frontend/src/components. Không tạo card mới nếu panel, certificate hoặc plan-card đã đúng vai trò.

## Page blueprint

### Plans

Grid 2 cột, card nổi bật dùng token contrast thay vì đảo màu cục bộ. Cuối trang có một dòng nhắc APR và penalty được khóa khi mở sổ. Không thêm dashboard, filter hay khối giải thích ngoài yêu cầu 7.3.

### Deposits

Summary strip 3 ô; danh sách certificate đang active 2 cột, mới nhất trước. Không có filter trạng thái hay mục lịch sử vì yêu cầu 7.3 chỉ cần xem sổ và thao tác trên sổ. Action phụ thuộc trạng thái: active có rút trước hạn; matured có tất toán/tái tục.

## Interaction states

- Loading: nút có spinner + copy cụ thể; không dùng spinner toàn trang.
- Empty: EmptyState với lý do và CTA.
- Error: inline trong form/drawer; toast chỉ cho lỗi tức thời.
- Success: drawer mở sổ có receipt; toast cho action ngắn.
- Disabled: giải thích lý do gần control, không chỉ giảm opacity.
- Wallet: phân biệt chưa kết nối, MetaMask và ví nội bộ. MetaMask hiển thị trạng thái đọc chain, lỗi sai network và lỗi bị từ chối; ví nội bộ luôn được ghi rõ là dữ liệu mô phỏng.
- Settings: một trigger duy nhất ở rail desktop hoặc topbar mobile. Desktop mở popover lên trên footer rail; mobile mở xuống dưới topbar. Popover đóng khi bấm ra ngoài hoặc Escape, và Escape trả focus về trigger.
- Language: chọn VI/EN bên trong Cài đặt; nhãn trigger và nội dung đổi tức thời rồi fade/rise khoảng 220ms, giữ nguyên dữ liệu và vị trí trang.
- Theme: Sáng/Tối đổi token màu toàn cục trong 220ms; lựa chọn được giữ sau reload. Không làm mất trạng thái trang, popover hay dữ liệu đang nhập.
- Navigation: pill của link active trượt giữa Saving plans và My deposits; nội dung mới vào ngay, không có khoảng trắng chờ giữa hai trang.
- Chuyển VI/EN không được làm đổi vị trí nav, nút hành động, chiều cao đoạn mô tả hoặc tiến trình cuộn. Dùng vùng rộng/chiều cao dự trữ ổn định thay vì ép chữ bằng màu hoặc ẩn nội dung.
- Motion chỉ dùng opacity và transform cho nội dung, ngắn hơn 250ms, tắt khi `prefers-reduced-motion` bật.

## Content rules

- UI có hai ngôn ngữ Việt/Anh; mọi chuỗi hiển thị nằm trong `frontend/src/i18n/messages.ts`.
- Bản tiếng Việt tự nhiên, cụ thể; bản tiếng Anh dùng cùng thuật ngữ: deposit, principal, interest, maturity, renew, withdraw.
- Tránh seamless, elevate, next-gen trong cả hai ngôn ngữ.
- Dùng sổ, chứng chỉ, gốc, lãi, kho lãi, tất toán, tái tục; bản Anh dùng deposit certificate, principal, interest, vault, withdraw, renew.
- Số USDC: en-US grouping, 2 chữ số thập phân; ngày theo locale đang chọn (vi-VN hoặc en-US).
- Không dùng emoji trong UI.
- Không hiển thị APR mà thiếu kỳ hạn hoặc ngữ cảnh.

## Accessibility

- Focus ring 2px accent, offset 2px.
- Modal/drawer khóa scroll, giữ Tab/Shift+Tab trong dialog, đóng bằng Escape hoặc backdrop và trả focus về control đã mở.
- Dialog lồng nhau như form mở sổ → kết nối ví giữ đúng thứ tự focus; đóng dialog trên trả focus về dialog bên dưới.
- prefers-reduced-motion tắt animation.
- Button tối thiểu 34–42px; input 42–64px.
- Không dùng màu làm tín hiệu duy nhất; badge luôn có chữ.
- Lỗi form dùng `role="alert"`; input lỗi có `aria-invalid` và được nối với thông báo bằng `aria-describedby`.

## Điều cấm

- Gradient tím/xanh AI, glassmorphism toàn bộ, neon crypto.
- Ba feature card bằng nhau, hero giữa trang kiểu landing page.
- Lucide/Feather/Heroicons trộn với Phosphor.
- Số liệu giả được trình bày như dữ liệu on-chain đã xác minh.
- Sửa token cục bộ trong một page thay vì sửa @theme.
