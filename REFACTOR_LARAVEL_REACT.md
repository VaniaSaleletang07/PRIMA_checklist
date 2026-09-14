# PRIMA — React, Laravel, PostgreSQL

## Arsitektur final

- `frontend/`: React SPA (Vite), seluruh tampilan dan routing pengguna.
- `backend/`: Laravel 12 REST API, autentikasi Sanctum, RBAC, validasi, scheduler, private file storage, audit, backup, serta tanda tangan/QR.
- PostgreSQL 16+: satu-satunya database runtime baru.
- File PHP native di root hanya arsip/sumber migrasi dan **tidak dipanggil lagi oleh React**.

## Menjalankan dengan Docker

1. Salin nilai environment produksi ke file `.env` root atau secret manager. Wajib ganti `APP_KEY`, `POSTGRES_PASSWORD`, `PRIMA_SIGNATURE_SECRET`, dan password admin.
2. Untuk produksi, salin `.env.production.example` menjadi `.env`, isi seluruh secret, kemudian jalankan `docker compose -f compose.yaml -f compose.production.yaml up -d --build`.
3. Buka `http://localhost:8080`.

Service `backend` menjalankan migration dan seeder, `frontend` menyajikan React sekaligus meneruskan `/api` ke Laravel, sedangkan `scheduler` menjalankan Laravel Scheduler.

## Development tanpa Docker

Aktifkan ekstensi `pdo_pgsql` PHP, isi `backend/.env`, lalu jalankan:

```powershell
.\START-PRIMA-LOCAL.ps1
```

Script tersebut menyalakan PostgreSQL lokal, Laravel API, dan Vite dengan konfigurasi temporary directory Windows yang benar. Alternatifnya, jalankan setiap service secara manual:

```powershell
cd backend
php artisan migrate --seed
php artisan serve
```

Pada terminal lain:

```powershell
cd frontend
npm install
npm run dev
```

Vite meneruskan `/api` ke Laravel pada `127.0.0.1:8000`.

## Scheduler dan backup

- Scheduler notifikasi berjalan setiap hari pukul 06.00. Uji kandidat tanpa mengirim email dengan `php artisan prima:notifications --dry-run`.
- Retensi audit dan backup diterapkan otomatis setiap hari pukul 02.00. Tombol **Terapkan semua retensi** juga tersedia bagi administrator.
- Tombol backup admin menggunakan format custom PostgreSQL (`pg_dump`). Jika eksekusi proses eksternal dibatasi oleh hosting, Laravel otomatis membuat backup portabel `prima-portable-backup-v1` terkompresi dengan checksum SHA-256.
- File backup dan dokumen berada di private storage dan tidak dapat diakses langsung dari web.
- Data sesi, token akses, cache, dan antrean tidak disalin ke backup agar sesi lama tidak hidup kembali setelah pemulihan.

Restore hanya boleh dilakukan tim IT pada database tujuan yang sudah diverifikasi. Perintah mewajibkan `--force` dan menolak backup tanpa checksum yang valid:

```powershell
cd backend
php artisan prima:database-restore nama-backup.dump --database=nama_database_tujuan --force
```

Perintah yang sama mendukung backup portabel berakhiran `.json.gz`. Restore native dan portabel telah diuji pada database PostgreSQL sementara yang terpisah.

## Status penyelesaian migrasi

- Frontend runtime: React/Vite, tanpa pemanggilan endpoint PHP native.
- Tampilan frontend: responsif untuk desktop, tablet, dan mobile (minimum 320px), termasuk drawer navigasi, formulir, statistik, tabel data berbentuk kartu, serta kontrol ramah sentuh.
- Backend runtime: Laravel REST API dan Sanctum.
- Database runtime: PostgreSQL; data bisnis dan dokumen legacy telah dipindahkan.
- Ekspor data: XLSX asli dengan filter aktif.
- Durasi sesi: sliding expiration berdasarkan aktivitas terakhir.
- Kelola pengguna: administrator dapat menghapus akun selain akun sendiri dan admin utama; token/sesi dicabut, sedangkan histori bisnis dan audit tetap dipertahankan.
- Email: scheduler memilih SMTP yang tersimpan di pengaturan sistem; mode `--dry-run` tidak mengirim email.
- Template checklist: tersimpan mandiri di `backend/resources/checklists`, bukan membaca file PHP/HTML root legacy.

Verifikasi terakhir pada 11 September 2026:

- 11 automated tests lulus dengan 48 assertion pada PHP CLI lokal; 1 pengujian XLSX dilewati otomatis ketika ekstensi ZIP CLI tidak tersedia.
- Import ulang pada database sementara menghasilkan jumlah data yang sama dan 0 relasi yatim.
- Restore native PostgreSQL dan restore portabel berhasil pada database sementara terpisah.
- XLSX diperiksa sebagai arsip Office Open XML yang valid.
- Smoke test admin, user, pengurus, HSSE, dan manager berhasil; endpoint admin mengembalikan HTTP 403 untuk role non-admin.
- Build produksi frontend responsif berhasil dikompilasi dari 1.886 modul tanpa error.
- Lima file dokumen database ditemukan di private storage dan checksum backup cocok.

## Migrasi seluruh data MySQL lama

Backup MySQL terlebih dahulu. Isi `LEGACY_DB_*` dan `DB_*` pada `backend/.env`, jalankan migration PostgreSQL, kemudian:

```powershell
php artisan migrate --seed
php artisan prima:import-legacy --uploads="C:\path\ke\uploads\dokumen"
```

Importer memindahkan users beserta hash password, pendaftaran, kendaraan, assignment pengurus, checklist dan item, dokumen, audit, tanda tangan, settings, serta histori notifikasi. Setelah itu bandingkan jumlah baris dan lakukan UAT seluruh role sebelum cutover.

Jika memakai profile database dump Docker:

```powershell
docker compose --profile migration up -d legacy-mysql postgres backend
docker compose exec -e LEGACY_DB_HOST=legacy-mysql -e LEGACY_DB_DATABASE=legacy backend php artisan prima:import-legacy
```

## Keamanan deployment

- Login seluruh role dilindungi Cloudflare Turnstile. Widget React menghasilkan token sekali pakai dan Laravel memvalidasinya melalui Siteverify sebelum memeriksa kredensial.
- Untuk localhost gunakan test key resmi Cloudflare pada `backend/.env`. Produksi wajib memakai `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, dan `TURNSTILE_ALLOWED_HOSTNAMES` milik domain produksi; test key dilarang digunakan di produksi.
- API memakai bearer token Sanctum yang kedaluwarsa berdasarkan kebijakan sesi.
- Rate limit login dan lockout akun aktif.
- Dokumen disimpan pada `storage/app/private` dan hanya diunduh melalui endpoint berotorisasi.
- Kredensial tidak boleh ditaruh di source code; gunakan environment/secret manager.
- Wajib HTTPS, backup PostgreSQL terenkripsi/off-site, rotasi secret, dependency scanning, dan VAPT sebelum produksi.
- Setelah UAT dan cutover, document root server hanya boleh menunjuk ke image/frontend baru dan `backend/public`; jangan publikasikan root legacy.
