<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_registrations', function (Blueprint $t) {
            $t->id();
            $t->string('username', 50)->unique();
            $t->string('email', 100)->unique();
            $t->string('password');
            $t->string('full_name', 100);
            $t->string('phone', 20)->nullable();
            $t->text('reason')->nullable();
            $t->string('requested_role', 30)->default('user');
            $t->string('status', 20)->default('pending')->index();
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reviewed_at')->nullable();
            $t->text('rejection_reason')->nullable();
            $t->timestamps();
        });
        Schema::create('kendaraan', function (Blueprint $t) {
            $t->id();
            $t->string('jenis', 20)->default('SPBU')->index();
            $t->string('nomor_polisi', 20)->unique();
            $t->string('merk_mobil', 100);
            $t->unsignedSmallInteger('tahun_kendaraan')->nullable();
            $t->string('nama_transport', 100)->nullable();
            $t->string('email_kontraktor', 100)->nullable();
            $t->string('produk_kapasitas', 100)->nullable();
            $t->date('tanggal_pemeriksaan_terakhir')->nullable();
            $t->date('ekim_valid_until')->nullable();
            $t->string('status', 20)->default('AKTIF')->index();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('pengurus_kendaraan', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->string('nomor_polisi', 20);
            $t->string('nama_transport', 100)->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'nomor_polisi']);
        });
        Schema::create('formulir_checklist', function (Blueprint $t) {
            $t->id();
            $t->string('jenis_kendaraan', 20)->default('SPBU')->index();
            $t->string('nomor_urut', 50)->nullable();
            $t->string('merk_mobil', 100)->nullable();
            $t->string('nama_transport', 100)->nullable();
            $t->string('nomor_polisi', 20)->nullable()->index();
            $t->date('tanggal_terakhir')->nullable();
            $t->string('produk_kapasitas', 100)->nullable();
            $t->date('tanggal_pemeriksaan')->nullable()->index();
            $t->date('ekim_valid_until')->nullable()->index();
            $t->string('status_gate', 50)->nullable();
            $t->string('status_upload', 50)->nullable();
            $t->text('catatan')->nullable();
            $t->string('nama_pemeriksa', 100)->nullable();
            $t->date('tanggal_pemeriksa')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('dokumen_hash', 64)->nullable();
            $t->string('status_approval', 30)->default('draft')->index();
            $t->foreignId('ttd_hsse_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('ttd_hsse_nama', 100)->nullable();
            $t->text('ttd_hsse_signature')->nullable();
            $t->string('ttd_hsse_hash', 128)->nullable();
            $t->longText('ttd_hsse_gambar')->nullable();
            $t->timestamp('ttd_hsse_timestamp')->nullable();
            $t->foreignId('ttd_manajer_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('ttd_manajer_nama', 100)->nullable();
            $t->text('ttd_manajer_signature')->nullable();
            $t->string('ttd_manajer_hash', 128)->nullable();
            $t->longText('ttd_manajer_gambar')->nullable();
            $t->timestamp('ttd_manajer_timestamp')->nullable();
            $t->string('qr_token', 64)->nullable()->unique();
            $t->uuid('verification_uuid')->nullable()->unique();
            $t->string('verification_hash_sha512', 128)->nullable();
            $t->text('verification_signature')->nullable();
            $t->string('verification_url', 512)->nullable();
            $t->string('verification_qrcode_path')->nullable();
            $t->timestamp('verification_created_at')->nullable();
            $t->timestamps();
        });
        Schema::create('checklist_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('formulir_id')->constrained('formulir_checklist')->cascadeOnDelete();
            $t->unsignedSmallInteger('item_number')->index();
            $t->string('item_name');
            $t->boolean('is_baik')->default(false);
            $t->boolean('is_tidak')->default(false);
            $t->text('keterangan')->nullable();
            $t->date('tanggal_expire')->nullable();
        });
        Schema::create('dokumen_kendaraan', function (Blueprint $t) {
            $t->id();
            $t->string('nomor_polisi', 20)->index();
            $t->string('nama_transport', 100)->nullable();
            $t->string('jenis_dokumen', 30);
            $t->string('nama_file_asli')->nullable();
            $t->string('file_path', 500)->nullable();
            $t->date('tanggal_berlaku')->nullable();
            $t->text('keterangan')->nullable();
            $t->string('status', 20)->default('PENDING')->index();
            $t->text('catatan_admin')->nullable();
            $t->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reviewed_at')->nullable();
            $t->timestamps();
        });
        Schema::create('audit_log', function (Blueprint $t) {
            $t->id();
            $t->foreignId('formulir_id')->nullable()->constrained('formulir_checklist')->nullOnDelete();
            $t->string('action', 50)->index();
            $t->string('user_name', 100)->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->text('description')->nullable();
            $t->timestamp('created_at')->useCurrent()->index();
        });
        Schema::create('digital_signature_log', function (Blueprint $t) {
            $t->id();
            $t->foreignId('formulir_id')->constrained('formulir_checklist')->cascadeOnDelete();
            $t->string('action', 30)->index();
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('user_name', 100)->nullable();
            $t->string('role_signer', 50)->nullable();
            $t->string('dokumen_hash', 128)->nullable();
            $t->string('signature_snippet', 50)->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->text('notes')->nullable();
            $t->timestamp('created_at')->useCurrent()->index();
        });
        Schema::create('system_settings', function (Blueprint $t) {
            $t->string('setting_key', 100)->primary();
            $t->text('setting_value')->nullable();
            $t->timestamp('updated_at')->useCurrent();
        });
        Schema::create('kim_notifications', function (Blueprint $t) {
            $t->id();
            $t->string('nomor_polisi', 20)->index();
            $t->string('nama_transport', 100)->nullable();
            $t->string('email_to');
            $t->date('ekim_valid_until')->nullable();
            $t->integer('hari_tersisa')->nullable();
            $t->string('status', 20)->default('sent');
            $t->text('error_message')->nullable();
            $t->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('sent_at')->useCurrent()->index();
        });
        Schema::create('dokumen_expire_notifications', function (Blueprint $t) {
            $t->id();
            $t->string('nomor_polisi', 20)->index();
            $t->string('item_name', 100);
            $t->string('nama_transport', 100)->nullable();
            $t->string('email_to');
            $t->date('tanggal_expire')->nullable();
            $t->integer('hari_tersisa')->nullable();
            $t->string('status', 20)->default('sent');
            $t->text('error_message')->nullable();
            $t->timestamp('sent_at')->useCurrent()->index();
        });
        Schema::create('ekim_notifikasi', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('formulir_id')->nullable()->constrained('formulir_checklist')->cascadeOnDelete();
            $t->string('nomor_polisi', 20);
            $t->string('status', 20);
            $t->text('pesan');
            $t->boolean('is_read')->default(false);
            $t->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        foreach (['ekim_notifikasi', 'dokumen_expire_notifications', 'kim_notifications', 'system_settings', 'digital_signature_log', 'audit_log', 'dokumen_kendaraan', 'checklist_items', 'formulir_checklist', 'pengurus_kendaraan', 'kendaraan', 'user_registrations'] as $name) {
            Schema::dropIfExists($name);
        }
    }
};
