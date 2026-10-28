# Repo và skill tham khảo

Mục tiêu của file này là chỉ rõ nguồn đã có trên mạng để dự án không tự phát minh lại quy trình. Chỉ chép nguyên tắc cần thiết vào skill của dự án; không cài cả bộ skill vào repo để tránh các hướng dẫn chồng chéo.

## Nguồn chính

| Nguồn | Dùng để |
|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | Cấu trúc chuẩn của một `SKILL.md`; tham khảo skill `frontend-design` khi cần hướng thiết kế giao diện. |
| [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) | Checklist review giao diện web: typography, form, trạng thái tương tác, accessibility, motion. |
| [JustineBijuPaul/frontend-ai-skills](https://github.com/JustineBijuPaul/frontend-ai-skills) | Bộ 70 skill frontend (UI/UX, React, accessibility, animation, performance, design-to-code) để tra cứu khi một việc cụ thể chưa có trong skill của dự án. |
| [hueyexe/frontend-agent-skills](https://github.com/hueyexe/frontend-agent-skills) | Tham khảo cách viết skill UX/UI ngắn, có tiêu chí kiểm tra. |
| [liuchiawei/agent-skills](https://github.com/liuchiawei/agent-skills) | Bộ sưu tập skill tổng hợp để đối chiếu trước khi tự viết mới. |

## Skill đang dùng trong dự án

- [`.agents/skills/fintech-product-ui/SKILL.md`](../.agents/skills/fintech-product-ui/SKILL.md): skill riêng cho hai màn hình của TÍCH, token, component, song ngữ và trạng thái bắt buộc.
- `design-taste-frontend` và `high-end-visual-design` (cài trên máy): dùng ở giai đoạn chọn hướng thị giác. `design-taste-frontend` hướng tới landing page, không phù hợp làm skill duy nhất cho product UI có nhiều trạng thái, nên dự án có thêm skill riêng.

## Cách áp dụng

1. Đọc `AGENTS.md` và `docs/WORKFLOW.md` trước khi mở skill tham khảo.
2. Chỉ lấy phần áp dụng được cho TÍCH; bỏ qua hướng dẫn dành cho landing page hoặc framework khác.
3. Nếu một nguyên tắc mới thực sự cần dùng, thêm vào skill của dự án kèm lý do, thay vì cài thêm một bộ skill song song.
4. Giữ một nguồn duy nhất cho palette, font, icon và component; skill tham khảo không được ghi đè `docs/DESIGN.md`.
