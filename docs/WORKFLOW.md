# Quy trình end-to-end cho dự án

Mục tiêu của file này là biến yêu cầu thành một chuỗi việc có thể kiểm tra, để AI không nhảy thẳng vào code, không tự bịa API/contract, và không bàn giao một màn hình chỉ đẹp ở trạng thái happy path.

## Vòng lặp 6 bước

### 1. Đọc bối cảnh

- Đọc AGENTS.md, docs/SPEC.md, docs/DESIGN.md và cây file hiện tại.
- Xác định phase: frontend mock, contract, integration hay submission.
- Ghi rõ dữ kiện còn thiếu (MSSV, ABI, address, yêu cầu UI). Không tự điền.

Exit: có một câu mô tả đúng việc đang làm và giới hạn của nó.

### 2. Chốt spec nhỏ

- Viết 3–7 acceptance criteria quan sát được.
- Nêu state cần có: loading, empty, error, success và trạng thái ví.
- Nêu dữ liệu đầu vào/ra và nơi lưu state.
- Nếu là contract: nêu invariant, event, revert condition và test case.

Exit: người khác đọc criteria có thể nói đạt hoặc chưa đạt mà không cần hỏi.

### 3. Chốt design/architecture

- UI: đọc design read và token; chọn component có sẵn; xác định mobile behavior.
- Contract: vẽ ranh giới SavingCore / VaultManager; xác định ai giữ tiền, ai trả lãi.
- Không thêm dependency nếu không cần.

Exit: có sơ đồ hoặc danh sách component/contract rõ ràng.

### 4. Làm vertical slice

- Làm một luồng xuyên suốt trước: UI → state → action → kết quả.
- Với UI, dựng desktop trước, sau đó mobile; không để mobile thành bản thu nhỏ của desktop.
- Với contract, viết một happy path + một revert + một event test trước khi mở rộng.
- Dùng dữ liệu mẫu có nhãn rõ; không giả lập on-chain đã chạy.

Exit: luồng chính bấm được từ đầu đến cuối trong browser/test.

### 5. Kiểm tra

Frontend:

    cd frontend
    npm run build
    npm run lint

Sau đó kiểm tra tối thiểu:

- Plans và Deposits ở 1440px và 390px, cả tiếng Việt và tiếng Anh.
- Bật/tắt VI–EN tại chỗ: nav, nút hành động, summary card và certificate action không được đổi tọa độ hoặc chiều cao.
- Chuyển Saving plans ↔ My deposits: active pill trượt, nội dung mới xuất hiện ngay và không có khung trắng chờ.
- Mở sổ: dưới min, trên max, thiếu số dư, ví chưa kết nối.
- Tất toán: đúng hạn, rút sớm, đã tất toán.
- Tái tục: đúng hạn, sai kỳ hạn, vault thiếu lãi.
- Nếu `frontend/.env.local` đã có deployment: thử sai network, từ chối trong MetaMask, approve USDC, chờ receipt và đọc lại balance/status; mock mode không được ghi như giao dịch on-chain.

Contract (phase 2):

- Unit test cho từng flow, event và revert.
- Coverage > 90%.
- Test time travel cho maturity và grace.
- Test double-withdraw, reentrancy, transfer NFT nếu chọn design đó.
- Chạy `verify:local` sau deploy để đối chiếu manifest với RPC, bytecode, role và gói.
- Không gọi một deployment là "testnet" nếu RPC vẫn là Hardhat local; ghi rõ public testnet chưa chạy.

Exit: có output thật, không chỉ đã sửa.

### 6. Bàn giao

- Cập nhật README/docs nếu hành vi thay đổi.
- Ghi rõ file đã sửa, lệnh đã chạy, kết quả và phần chưa xác minh.
- Không commit/push nếu chưa được yêu cầu.
- Nếu có ảnh hoặc video, chỉ dùng dữ liệu thật của lần chạy đó.

## Prompt mẫu

### Frontend feature

    Context: TÍCH, phase frontend mock. Đọc AGENTS.md, docs/DESIGN.md, docs/SPEC.md.
    Task: [màn hình/luồng cụ thể].
    Scope: chỉ 4 luồng 7.3 (xem gói, mở sổ, xem sổ, tất toán/tái tục); không thêm dashboard, vault admin hay bot.
    Paths: chỉ sửa [paths]. Không đổi palette/font/component system.
    Acceptance: [3–7 criteria quan sát được].
    States: loading, empty, error, success và ví chưa kết nối.
    Languages: VI và EN phải đủ, không còn chuỗi chưa dịch.
    Mobile: 390px; desktop: 1440px.
    Verify: npm run build, npm run lint, kiểm tra browser các flow [list].
    Output: file đã sửa + kết quả thật + phần chưa xác minh.

### Contract feature

    Context: bài Online Banking System, phase Hardhat. Đọc docs/SPEC.md và AGENTS.md.
    Task: implement [contract/function].
    Invariants: gốc ở SavingCore; lãi ở VaultManager; APR/penalty snapshot; pause chặn withdraw/renew.
    Acceptance: [flow], [event], [revert], [test].
    Personal variant: A=[...], B=[...].
    Verify: hardhat test + coverage; không tuyên bố deploy nếu chưa deploy.
    Output: contract, test, kết quả coverage, giả định còn mở.

### Bug fix

    Context: [page/contract]. Symptom: [quan sát được].
    Reproduce: [steps].
    Constraint: fix nhỏ nhất, không đổi behavior ngoài scope.
    Verify: [test/browser step] trước và sau.
    Output: root cause + fix + bằng chứng.

### Review

    Review diff theo 4 trục: correctness, edge cases, UI states, verification evidence.
    Chỉ báo lỗi có thể tái hiện hoặc rủi ro thật. Không khen trước, không bịa test.
    Trả về: [P0/P1/P2] file:line — vấn đề — cách kiểm tra.

## Anti-slop gate

Trước khi báo xong, tự hỏi:

- Màn hình này có phải chỉ là card + gradient + ba cột không?
- Có số liệu nào đang được hiển thị như thật nhưng thực ra là mock không?
- Có state lỗi nào chưa được thiết kế?
- Có chữ seamless, elevate, next-gen không?
- Có dependency mới nào chưa được kiểm tra không?
- Đã bấm thử luồng trên mobile chưa?
- Nếu user hỏi dòng code nào quyết định điều này, mình có chỉ đúng được không?

## Stop rules

- Thiếu MSSV/A/B: dừng phần contract/test, không bịa số.
- Thiếu ABI/address: giữ mock adapter, không gọi contract giả.
- Thiếu yêu cầu về một quyết định kinh tế (ví dụ transfer NFT): chọn mặc định an toàn, ghi vào Design Answers và nêu trade-off.
- Không xóa dữ liệu người dùng hoặc reset state thật khi chưa được phép.
