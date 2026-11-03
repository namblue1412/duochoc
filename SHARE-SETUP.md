# Kích hoạt liên kết ngắn

Web hiện đã kết nối dự án Supabase `duochoc`. Cấu hình trình duyệt chỉ chứa Project URL và publishable key công khai; không chứa mật khẩu quản trị hoặc secret key.

## Đang hoạt động không cần cấu hình

Đề có sẵn trong kho dùng link như `https://namblue1412.github.io/duochoc/?bank=dd01`.
Người nhận mở link rồi bấm bắt đầu làm bài. Link cũ dạng `#quiz=...` vẫn mở được.

## Chia sẻ đề tự nạp, gồm cả ảnh Base64

Cần một dự án Supabase do chủ web quản lý. GitHub Pages không lưu file tải lên.

1. Tạo dự án tại https://supabase.com/dashboard.
2. Mở **SQL Editor**, chạy toàn bộ file `supabase/short-links.sql`.
3. Trong **Connect** hoặc **Settings → API Keys**, lấy **Project URL** và **publishable key** (`sb_publishable_...`).
4. Điền hai giá trị này vào `share-config.js`. Đây là khóa công khai dành cho trình duyệt. Không dùng secret key hoặc service_role key.
5. Đưa `share-config.js` đã cấu hình lên GitHub Pages cùng mã nguồn.
6. Nạp `de-mau-co-anh.json`, mở **Chia sẻ và đổi đề → Tạo liên kết ngắn**.
7. Mở link bằng cửa sổ riêng tư hoặc điện thoại khác. Xác nhận đúng tiêu đề, ảnh và có thể bắt đầu bài.

## Cách hoạt động

- Chỉ tạo bản sao đề khi người dùng bấm chia sẻ. Không tải điểm hoặc bài làm lên.
- Đề tự nạp tối đa 4 MB ở phía web; máy chủ giới hạn 5 MB để có chỗ cho JSON được định dạng lại.
- Link đề tự nạp hết hạn sau 30 ngày. Link đề có sẵn theo kho đề, không có thời hạn này.
- Bất kỳ ai có link đều đọc được cả đề và đáp án mẫu, tương tự file JSON được gửi trực tiếp. Đây là công cụ ôn tập, không phải hệ thống bảo mật đề thi.
- Ảnh Base64 được giữ nguyên trong JSON. Không phụ thuộc nơi lưu ảnh khác.
- Không lưu đề hoặc link trong localStorage. Tải lại trang không tự khôi phục bài làm.
- Bảng `quiz_shares` bật RLS, không cấp quyền đọc danh sách, sửa hoặc xóa cho khách. Web chỉ gọi hai hàm tạo mã và đọc đúng mã chưa hết hạn.
- Upload đang mở cho khách, không yêu cầu tài khoản. Giới hạn kích thước không phải giới hạn tần suất; khi mở cho nhiều người, cần kiểm soát lượng upload bằng xác thực hoặc dịch vụ kiểm tra yêu cầu phía máy chủ. Theo dõi dung lượng trong Supabase.
- Hết hạn sẽ chặn đọc nhưng không tự xóa dữ liệu. Có thể dọn định kỳ bằng câu lệnh sau trong SQL Editor hoặc công việc lên lịch của dự án:

```sql
delete from public.quiz_shares where expires_at <= now();
```

## Kiểm tra

Chạy `node --test tests/share.test.cjs` để kiểm tra tạo link, tải đề, lỗi mạng, mã lỗi, giới hạn dung lượng và cấu hình thiếu. Các kiểm tra này giả lập dịch vụ; vẫn phải thực hiện bước 7 với dự án Supabase thật sau cấu hình.

Tài liệu chính thức:
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
