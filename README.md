# AutoShift Manager - Hệ Thống Sắp Xếp Ca Làm Việc Tự Động (Version 2.0)

Hệ thống sắp xếp lịch ca làm việc thông minh chuyên dụng cho Quán Cà phê, Trà sữa và F&B, giải quyết triệt để các bài toán phân bổ nhân sự, ghép cặp vai trò, và chọn lọc khung giờ rảnh tối ưu.

---

## 🌟 Các Nâng Cấp Quan Trọng (Version 2.0)

1. **Hỗ trợ đăng ký 2 khung giờ rảnh trong 1 ngày (vd: `12-15h / b+`):**
   - Nhân viên có thể linh hoạt đăng ký 2 phương án ca rảnh trong cùng ngày (cách nhau bởi dấu gạch chéo `/`).
   - Thuật toán tự động đánh giá và **chọn 1 trong 2 khung giờ rảnh sao cho tối ưu nhất** cho toàn bộ lịch quán (ví dụ ngày Thứ 5: Ánh chọn `12:00~15:00` để hỗ trợ ca A, Đạt chọn `B+ (18:00~22:00)` để hỗ trợ ca B).

2. **Ràng buộc vai trò nghiêm ngặt:**
   - **2 Pha chế có thể đứng cùng nhau** (khi thiếu phục vụ hoặc cần hỗ trợ).
   - **Phục vụ KHÔNG BAO GIỜ đứng một mình** hoặc 2 phục vụ đứng với nhau mà không có Pha chế. Ở mọi khung giờ mở cửa có Phục vụ thì bắt buộc phải có ít nhất 1 Pha chế phụ trách quầy bar.
   - Giải quyết triệt để lỗi nhân viên Phục vụ (Mhuong) bị xếp đứng ca tối Thứ 5 một mình.

3. **Hạn chế ca làm quá 7 giờ:**
   - Chuẩn hóa các ca dài như A1 (8:00 ~ 18:00, 10h) hoặc B2 (12:00 ~ 22:00, 10h) về tối đa **7 giờ tiêu chuẩn** (Ca A: 8h-15h, Ca B: 15h-22h), tránh tình trạng nhân viên bị quá tải.

4. **Đảm bảo số ca tuần:**
   - Mỗi nhân viên tích cực được xếp từ **2 đến 6 ca/tuần**, nghỉ ít nhất 1 ngày.

---

## 📋 Bộ Dữ Liệu Mẫu

```text
[Pha chế]
Vy: 8-11h30, b+, 8-9h, 15-18h, 16-22h, off, b+
Ánh: B, off, off, 12-15h / b+, 6-9h, b+, a+
Mai: b1, b1, b1, 9-12h, off, off, off
Đạt: off, off, 9-15h, 12-15h / b+, off, a+, b2
Phú: off, a1, b, a+, a1, b1, b1

[Phục vụ]
Hương: o, o, o, a, a+, b+, off
Huy: o, b+, b+, o, b1, o, a
Phương: b+, 8-11h30, 8-11h30, o, o, o, a+
Thư: o, o, o, o, o, o, o
Mhuong: o, o, o, B, b+, b1, o
Hảo: a, b1, o, o, o, a+, off
```

---

## 🚀 Cách Sử Dụng

### 1. Giao diện Web:
Mở trực tiếp tệp [index.html](file:///d:/Code/Project%20xàm%20lol/Xếp%20ca%20làm/index.html) hoặc chạy lệnh:
```powershell
python server.py
```
- Nạp nhanh dữ liệu mẫu với nút **"Nạp dữ liệu mẫu"**.
- Chỉnh sửa trực tiếp tên, ca đăng ký, hỗ trợ nhập `12-15h / b+`.
- Nhấn **"SẮP XẾP CA TỰ ĐỘNG"** để nhận kết quả phân công và cảnh báo.
- Xuất file Excel (.xlsx) hoặc In bảng ca.

### 2. Dòng lệnh Python (CLI):
```powershell
python scheduler.py
```
- Chọn `1` để chạy với bộ dữ liệu chuẩn, nhấn `Enter` để áp dụng mặc định 2 người/ca cho tất cả các ngày.
