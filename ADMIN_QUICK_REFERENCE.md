# Quick Reference - Admin Tasks

**PRIMA (Pertamina Checklist Mobil Tangki) - Pertamina Patra Niaga**

## 🎯 Dashboard Admin - Menu Utama

### 1. Review Pendaftaran ⭐ PENTING

**URL:** `approve-registrations.php`

**Fungsi:** Approve atau reject pendaftaran user baru

**Tabs:**

- **Pending** - User yang menunggu approval (badge merah jika ada)
- **Approved** - User yang sudah diapprove
- **Rejected** - User yang ditolak

**Actions:**

```
[APPROVE] → User langsung bisa login
[REJECT]  → Masukkan alasan penolakan
```

**Info yang ditampilkan:**

- Username, Email, Telepon
- Departemen, Jabatan
- Alasan Pendaftaran
- Tanggal Daftar

---

### 2. Kelola User

**URL:** `manage-users.php`

**Fungsi:** Manage user yang sudah terdaftar

**Fitur:**

- Activate/Deactivate user
- Reset password
- Edit detail user
- View login history

---

### 3. Data Checklist

**URL:** `list.php`

**Fungsi:** Lihat semua data checklist (admin sees all)

**Fitur:**

- Filter by date, jenis kendaraan, status
- Search by nomor polisi, nama transport
- Export to Excel
- Edit/Delete any record

---

### 4. Audit Logs

**URL:** `audit-logs.php`

**Fungsi:** Track semua aktivitas di sistem

**Log yang tercatat:**

- Login/Logout events
- User approval/rejection
- Data create/update/delete
- Failed login attempts
- Account locks

---

### 5. Input Checklist

**URL:** `home.php`

**Fungsi:** Create checklist baru

**Route:**

- SPBU → `index.html` (will convert to index-spbu.php)
- Industri → `index-industri.php`

---

### 6. Pengaturan Sistem

**URL:** `system-settings.php`

**Fungsi:** Konfigurasi sistem

**Settings:**

- Session timeout duration
- Login attempt limits
- Account lock duration
- Backup database
- View system stats

---

## 📊 Dashboard Statistics

### Pending Registrations (Yellow Card)

- Jumlah user menunggu approval
- Badge di menu "Review Pendaftaran"

### Active Users (Green Card)

- User dengan status 'active'
- Bisa login dan akses sistem

### Total Users

- Semua user (exclude admin)
- Active + Inactive + Pending

### Total Checklists

- Semua data formulir di database

---

## 🔐 User Status Explained

### `active`

- ✅ User bisa login
- ✅ Akses penuh ke sistem
- ✅ Bisa create/edit checklist

### `pending`

- ⏳ Menunggu approval admin
- ❌ Tidak bisa login
- 📝 Data di `user_registrations` table

### `inactive`

- 🔒 Akun dinonaktifkan admin
- ❌ Tidak bisa login
- 💾 Data tetap di database

---

## ⚡ Quick Actions

### Approve User Cepat

```
1. Dashboard → Review Pendaftaran
2. Tab Pending → Klik APPROVE
3. Confirm → Done!
```

### Reject User dengan Alasan

```
1. Dashboard → Review Pendaftaran
2. Tab Pending → Klik REJECT
3. Isi alasan penolakan
4. Submit → User notified
```

### Reset User Login Attempts

```sql
-- Via phpMyAdmin atau MySQL Console
UPDATE users
SET login_attempts = 0, locked_until = NULL
WHERE username = 'username_here';
```

### Unlock Locked Account

```sql
UPDATE users
SET locked_until = NULL, login_attempts = 0
WHERE username = 'username_here';
```

### Force Activate User

```sql
-- Approve manual jika sistem bermasalah
UPDATE users
SET status = 'active', approved_by = 1, approved_at = NOW()
WHERE username = 'username_here';
```

---

## 🚨 Common Admin Tasks

### Task: User lupa password

**Solution:**

```sql
-- Generate new password hash untuk 'newpassword123'
-- Gunakan: https://bcrypt-generator.com/
-- Atau jalankan PHP:
<?php echo password_hash('newpassword123', PASSWORD_DEFAULT); ?>

-- Update database:
UPDATE users
SET password = '$2y$10$HASH_HERE'
WHERE username = 'username_here';
```

### Task: Check user last login

**Query:**

```sql
SELECT username, full_name, last_login,
       TIMESTAMPDIFF(DAY, last_login, NOW()) as days_ago
FROM users
WHERE role = 'user'
ORDER BY last_login DESC;
```

### Task: View pending registrations

**Query:**

```sql
SELECT username, full_name, email, department,
       reason, created_at
FROM user_registrations
WHERE status = 'pending'
ORDER BY created_at ASC;
```

### Task: Check active sessions

**Query:**

```sql
SELECT s.session_id, u.username, u.full_name,
       s.ip_address, s.last_activity
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.expires_at > NOW()
ORDER BY s.last_activity DESC;
```

### Task: Monthly registration stats

**Query:**

```sql
SELECT
    DATE_FORMAT(created_at, '%Y-%m') as month,
    COUNT(*) as total,
    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending
FROM user_registrations
GROUP BY month
ORDER BY month DESC;
```

---

## 📧 Notification Templates

### Approval Message (Manual)

```
Subject: Akun E-KIM Anda Telah Diaktifkan

Halo [Nama User],

Pendaftaran akun Anda untuk PRIMA
Pertamina Patra Niaga telah disetujui.

Credentials:
Username: [username]
Password: [yang didaftarkan]

Login: http://localhost/ChecklistUpdateE-KIM/login.php

Terima kasih,
Admin E-KIM
```

### Rejection Message (Manual)

```
Subject: Pendaftaran Akun E-KIM

Halo [Nama User],

Mohon maaf, pendaftaran akun Anda tidak dapat disetujui.

Alasan: [alasan dari form]

Jika ada pertanyaan, silakan hubungi administrator.

Terima kasih,
Admin E-KIM
```

---

## 🔧 Maintenance Commands

### Cleanup expired sessions

```sql
-- Manual cleanup (auto via stored procedure)
DELETE FROM user_sessions
WHERE expires_at < NOW();

-- Or use stored procedure:
CALL sp_cleanup_expired_sessions();
```

### View audit trail

```sql
SELECT * FROM audit_log
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY created_at DESC;
```

### Database backup

```bash
# Via command line
mysqldump -u root checklist_ekim > backup_$(date +%Y%m%d).sql

# Via XAMPP
# phpMyAdmin → Export → Go
```

---

## 📱 Mobile Responsive

Dashboard sudah responsive untuk:

- Desktop (1400px+)
- Tablet (768px - 1399px)
- Mobile (< 768px)

**Best viewed on:** Desktop Chrome/Firefox

---

## ⌨️ Keyboard Shortcuts

None yet - Feature request untuk next update!

---

## 🎨 UI Color Codes

**Corporate Colors:**

- Pertamina Red: `#c8102e`
- Gold Accent: `#ffd700`
- Success Green: `#28a745`
- Warning Yellow: `#ffc107`
- Danger Red: `#dc3545`

**Status Colors:**

- Pending: Yellow `#fff3cd`
- Approved: Green `#d4edda`
- Rejected: Red `#f8d7da`

---

## 📞 Emergency Contacts

**Database Issues:**

- Check `logs/error.log`
- Check MySQL error log

**System Down:**

1. Restart XAMPP
2. Check database connection
3. Clear browser cache
4. Check PHP version (7.4+)

---

**Quick Reference v1.0** | Admin Toolkit
