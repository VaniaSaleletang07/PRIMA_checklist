<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RetentionService;
use Carbon\Carbon;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OperationalFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, string $username): User
    {
        return User::create(['username' => $username, 'full_name' => ucfirst($username), 'email' => "$username@example.test", 'password' => 'Secret123!', 'role' => $role, 'status' => 'active']);
    }

    private function token(User $user, int $minutes = 20): string
    {
        return $user->createToken('test', ['*'], now()->addMinutes($minutes))->plainTextToken;
    }

    public function test_session_expiration_is_extended_after_authenticated_activity(): void
    {
        $user = $this->user('user', 'active_user');
        DB::table('system_settings')->insert(['setting_key' => 'session_timeout_minutes', 'setting_value' => '90', 'updated_at' => now()]);
        $token = $this->token($user);
        $tokenId = (int) str($token)->before('|')->toString();

        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();

        $expiresAt = DB::table('personal_access_tokens')->where('id', $tokenId)->value('expires_at');
        $this->assertTrue(Carbon::parse($expiresAt)->greaterThan(now()->addMinutes(89)));
    }

    public function test_retention_removes_only_expired_audits_and_backups(): void
    {
        Storage::fake('local');
        DB::table('system_settings')->insert([
            ['setting_key' => 'audit_retention_days', 'setting_value' => '90', 'updated_at' => now()],
            ['setting_key' => 'backup_retention_days', 'setting_value' => '7', 'updated_at' => now()],
        ]);
        DB::table('audit_log')->insert([
            ['action' => 'OLD', 'created_at' => now()->subDays(91)],
            ['action' => 'CURRENT', 'created_at' => now()],
        ]);
        Storage::disk('local')->put('backups/old.dump', 'old');
        Storage::disk('local')->put('backups/old.dump.sha256', 'hash');
        Storage::disk('local')->put('backups/current.dump', 'current');
        touch(Storage::disk('local')->path('backups/old.dump'), now()->subDays(8)->timestamp);

        $result = app(RetentionService::class)->apply();

        $this->assertSame(1, $result['audit_deleted']);
        $this->assertSame(1, $result['backups_deleted']);
        $this->assertDatabaseMissing('audit_log', ['action' => 'OLD']);
        $this->assertDatabaseHas('audit_log', ['action' => 'CURRENT']);
        Storage::disk('local')->assertMissing('backups/old.dump');
        Storage::disk('local')->assertMissing('backups/old.dump.sha256');
        Storage::disk('local')->assertExists('backups/current.dump');
    }

    public function test_scheduler_uses_smtp_and_records_notification(): void
    {
        Mail::fake();
        $user = $this->user('admin', 'mail_admin');
        DB::table('system_settings')->insert([
            ['setting_key' => 'smtp_host', 'setting_value' => 'smtp.example.test', 'updated_at' => now()],
            ['setting_key' => 'smtp_port', 'setting_value' => '587', 'updated_at' => now()],
            ['setting_key' => 'smtp_encryption', 'setting_value' => 'tls', 'updated_at' => now()],
            ['setting_key' => 'smtp_username', 'setting_value' => 'mailer@example.test', 'updated_at' => now()],
            ['setting_key' => 'smtp_password', 'setting_value' => encrypt('secret'), 'updated_at' => now()],
            ['setting_key' => 'notif_days_threshold', 'setting_value' => '30', 'updated_at' => now()],
        ]);
        DB::table('kendaraan')->insert(['jenis' => 'SPBU', 'nomor_polisi' => 'DB 1000 AA', 'merk_mobil' => 'Hino', 'nama_transport' => 'Transportir', 'email_kontraktor' => 'owner@example.test', 'status' => 'AKTIF', 'created_by' => $user->id, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('formulir_checklist')->insert(['jenis_kendaraan' => 'SPBU', 'nomor_polisi' => 'DB 1000 AA', 'nama_transport' => 'Transportir', 'tanggal_pemeriksaan' => today(), 'ekim_valid_until' => today()->addDays(5), 'status_approval' => 'approved', 'created_by' => $user->id, 'created_at' => now(), 'updated_at' => now()]);

        $this->artisan('prima:notifications')->assertSuccessful();

        $this->assertSame('smtp', config('mail.default'));
        $this->assertDatabaseHas('kim_notifications', ['nomor_polisi' => 'DB 1000 AA', 'email_to' => 'owner@example.test', 'status' => 'sent']);
    }

    public function test_export_returns_a_real_xlsx_archive(): void
    {
        if (! class_exists(\ZipArchive::class)) {
            $this->markTestSkipped('Ekstensi ZIP tidak tersedia.');
        }
        $admin = $this->user('admin', 'export_admin');
        DB::table('formulir_checklist')->insert(['jenis_kendaraan' => 'SPBU', 'nomor_polisi' => 'DB 2000 BB', 'tanggal_pemeriksaan' => today(), 'ekim_valid_until' => today()->addYear(), 'status_approval' => 'approved', 'created_by' => $admin->id, 'created_at' => now(), 'updated_at' => now()]);

        $response = $this->withToken($this->token($admin))->get('/api/v1/export/checklists?jenis=SPBU');

        $response->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertStringContainsString('.xlsx', (string) $response->headers->get('content-disposition'));
        $zip = new \ZipArchive;
        $this->assertTrue($zip->open($response->baseResponse->getFile()->getPathname()));
        $this->assertNotFalse($zip->locateName('[Content_Types].xml'));
        $this->assertNotFalse($zip->locateName('xl/worksheets/sheet1.xml'));
        $zip->close();
    }

    public function test_document_upload_is_limited_to_assigned_pengurus(): void
    {
        Storage::fake('private');
        $owner = $this->user('pengurus', 'owner');
        $other = $this->user('pengurus', 'other');
        DB::table('kendaraan')->insert(['jenis' => 'SPBU', 'nomor_polisi' => 'DB 3000 CC', 'merk_mobil' => 'Hino', 'status' => 'AKTIF', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pengurus_kendaraan')->insert(['user_id' => $owner->id, 'nomor_polisi' => 'DB 3000 CC', 'created_at' => now(), 'updated_at' => now()]);
        $payload = ['jenis_dokumen' => 'STNK', 'nomor_polisi' => 'DB 3000 CC', 'tanggal_berlaku' => today()->addYear()->toDateString(), 'file' => UploadedFile::fake()->create('stnk.pdf', 10, 'application/pdf')];

        $this->withToken($this->token($other))->post('/api/v1/documents', $payload, ['Accept' => 'application/json'])->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->withToken($this->token($owner))->post('/api/v1/documents', $payload, ['Accept' => 'application/json'])->assertOk();
        $this->assertDatabaseHas('dokumen_kendaraan', ['nomor_polisi' => 'DB 3000 CC', 'uploaded_by' => $owner->id, 'status' => 'PENDING']);
    }

    public function test_seeder_never_overwrites_an_existing_admin_password(): void
    {
        $admin = $this->user('admin', 'admin');
        $originalHash = $admin->password;

        $this->seed(DatabaseSeeder::class);

        $this->assertSame($originalHash, $admin->fresh()->password);
    }

    public function test_admin_can_delete_user_without_deleting_business_history(): void
    {
        $admin = $this->user('admin', 'delete_admin');
        $target = $this->user('pengurus', 'deleted_pengurus');
        $targetToken = $this->token($target);
        DB::table('kendaraan')->insert(['jenis' => 'SPBU', 'nomor_polisi' => 'DB 4000 DD', 'merk_mobil' => 'Hino', 'status' => 'AKTIF', 'created_by' => $target->id, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pengurus_kendaraan')->insert(['user_id' => $target->id, 'nomor_polisi' => 'DB 4000 DD', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('formulir_checklist')->insert(['jenis_kendaraan' => 'SPBU', 'nomor_polisi' => 'DB 4000 DD', 'tanggal_pemeriksaan' => today(), 'status_approval' => 'draft', 'created_by' => $target->id, 'created_at' => now(), 'updated_at' => now()]);

        $this->withToken($this->token($admin))->deleteJson("/api/v1/users/{$target->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Pengguna berhasil dihapus.');

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => (int) str($targetToken)->before('|')->toString()]);
        $this->assertDatabaseMissing('pengurus_kendaraan', ['user_id' => $target->id]);
        $this->assertDatabaseHas('kendaraan', ['nomor_polisi' => 'DB 4000 DD', 'created_by' => null]);
        $this->assertDatabaseHas('formulir_checklist', ['nomor_polisi' => 'DB 4000 DD', 'created_by' => null]);
        $this->assertDatabaseHas('audit_log', ['action' => 'USER_DELETE', 'user_name' => $admin->username]);
    }

    public function test_admin_cannot_delete_current_or_primary_admin_account(): void
    {
        $admin = $this->user('admin', 'security_admin');
        $primary = $this->user('admin', 'admin');
        $token = $this->token($admin);

        $this->withToken($token)->deleteJson("/api/v1/users/{$admin->id}")->assertStatus(409);
        $this->withToken($token)->deleteJson("/api/v1/users/{$primary->id}")->assertStatus(409);

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
        $this->assertDatabaseHas('users', ['id' => $primary->id]);
    }
}
