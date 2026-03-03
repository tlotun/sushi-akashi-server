<<<<<<< HEAD
# 🍣 Sushi Order System

Hệ thống đặt món cho nhà hàng Sushi — Khách quét QR → đặt món → in tự động ra máy in nhiệt QP-840W qua WiFi.

---

## 📁 Cấu trúc dự án

```
sushi-order/
├── server.js          ← Server chính (Node.js + Express)
├── package.json
├── data/
│   └── menu.json      ← Dữ liệu menu (tự sửa hoặc qua Admin)
└── public/
    ├── order.html     ← Trang đặt món cho khách hàng
    └── admin.html     ← Trang quản lý dành cho nhân viên
```

---

## 🚀 Cài đặt & Chạy

### Bước 1: Cài Node.js
Tải và cài: https://nodejs.org (chọn bản LTS)

### Bước 2: Cài dependencies
```bash
cd sushi-order
npm install
```

### Bước 3: Cấu hình máy in
Mở file `server.js`, tìm phần CẤU HÌNH và sửa:

```js
const PRINTER_IP   = '192.168.1.100';  // ← IP của máy in QP-840W
const PRINTER_PORT = 9100;              // Không cần đổi
const RESTAURANT_NAME = 'SUSHI RESTAURANT'; // Tên hiển thị trên phiếu
const TOTAL_TABLES = 10;               // Số bàn của quán
```

**Cách tìm IP máy in QP-840W:**
- In test page từ máy in → sẽ có IP in ra
- Hoặc vào router admin → xem danh sách thiết bị kết nối

### Bước 4: Chạy server
```bash
npm start
```

---

## 📱 Sử dụng

| Tính năng | URL |
|-----------|-----|
| Đặt món (khách) | `http://[IP-MÁY]:3000/order?table=1` |
| Trang Admin | `http://[IP-MÁY]:3000/admin` |

**Lấy IP máy tính:**
- Windows: `ipconfig` trong CMD → tìm IPv4 (ví dụ: 192.168.1.50)
- macOS: `ifconfig | grep inet`

---

## 📲 Tạo QR cho từng bàn

1. Vào **Admin** → tab **Mã QR bàn**
2. Nhập IP máy tính vào ô (ví dụ: `192.168.1.50`)
3. Nhấn **Tạo QR** → in ra hoặc chụp màn hình
4. Dán QR lên mặt bàn

---

## 🖨️ Máy in QP-840W

- Kết nối máy in vào **cùng mạng WiFi với máy tính chạy server**
- Máy in dùng giao thức **ESC/POS qua TCP port 9100** (chuẩn)
- Khổ giấy 80mm — hệ thống đã cấu hình sẵn 42 ký tự/dòng

---

## ⚙️ Quản lý Menu

Vào **Admin** → tab **Quản lý menu**:
- ✅ Bật/tắt món (hết hàng tạm thời)
- ✏️ Sửa tên, giá
- ➕ Thêm món mới
- 🗑️ Xoá món

---

## 📋 Quản lý Đơn hàng (Admin)

- Xem tất cả đơn theo thời gian thực
- Đánh dấu **Đã xong** khi bếp hoàn thành
- Thống kê doanh thu, số đơn
- Tự động refresh mỗi 30 giây

---

## 🔧 Chạy tự động khi khởi động máy (Windows)

Tạo file `start.bat`:
```bat
@echo off
cd C:\sushi-order
node server.js
```
Sau đó thêm vào Task Scheduler để chạy khi Windows khởi động.

---

## ❓ Lỗi thường gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|------------|-----------|
| Không kết nối được máy in | IP sai hoặc khác mạng | Kiểm tra IP, cùng WiFi |
| Khách không vào được trang | Server chưa chạy hoặc IP sai | Kiểm tra `npm start` đã chạy |
| Menu không load | Port 3000 bị chặn | Mở firewall port 3000 |
=======
# sushi-akashi-server
Sushi Akashi
>>>>>>> ad18715bdc22aec9156bda946f87cb56b93247fd
