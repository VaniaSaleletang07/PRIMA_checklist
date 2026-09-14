# Status migrasi frontend PRIMA

Seluruh navigasi utama pengguna kini menggunakan React. PHP dipertahankan sebagai backend/API dan untuk menghasilkan file download.

| Fitur | Implementasi React/API |
|---|---|
| Login, logout, Sanctum token dan RBAC | `App.jsx`, Laravel `/api/v1/auth/*` |
| Registrasi dan approval akun | `RegisterPage`, `RegistrationsPage` |
| Dashboard | `Dashboard` |
| Checklist SPBU/Industri | `ChecklistEditor`; template dibaca dari definisi legacy agar semua item tetap sama |
| Database, filter, paginasi, edit, hapus, cetak | `Checklists`, `ChecklistEditor` |
| Submit, reject, reset, TTD HSSE/Manager | `Approvals` dan endpoint workflow Laravel |
| Verifikasi publik | `VerifyPage`, route `/verify/{uuid}` diarahkan ke React |
| Export Excel XLSX | Tombol React, response terautentikasi dari Laravel, serta filter data aktif |
| CRUD dan assignment kendaraan | `VehiclesPage` |
| Kendaraan milik pengurus | `MyVehiclesPage` |
| Upload dan review dokumen | `DocumentsPage` |
| User, role, status, reset password | `UsersPage` |
| Audit dan peringatan kendaraan | `AuditsPage`, `AlertsPage` |
| SMTP, histori notifikasi dan cron | `NotificationsPage` |
| Validasi tanda tangan HMAC + QR | `ChecklistEditor`, Laravel signature API |
| Informasi sistem/PostgreSQL | `SettingsPage` |
| Backup, checksum, restore, dan retensi | `SettingsPage`, command `prima:database-backup`, `prima:database-restore`, dan `prima:retention` |

Frontend React tidak lagi memanggil endpoint PHP native. File lama dipertahankan sementara hanya sebagai arsip dan sumber proses import; document root produksi tidak boleh diarahkan ke folder legacy.
