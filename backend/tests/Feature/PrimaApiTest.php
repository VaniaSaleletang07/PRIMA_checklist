<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PrimaApiTest extends TestCase
{
    use RefreshDatabase;

    private function login(string $role = 'admin', string $username = 'tester'): array
    {
        User::create(['username' => $username, 'full_name' => ucfirst($username), 'email' => "$username@example.test", 'password' => 'Secret123!', 'role' => $role, 'status' => 'active']);
        $response = $this->postJson('/api/v1/auth/login', ['username' => $username, 'password' => 'Secret123!'])->assertOk()->assertJsonPath('success', true);

        return [$response->json('data.user'), $response->json('data.token')];
    }

    public function test_authentication_registration_and_role_protection(): void
    {
        $this->postJson('/api/v1/auth/register', ['username' => 'baru_1', 'email' => 'baru@example.test', 'password' => 'Strong123!', 'full_name' => 'Pengguna Baru', 'phone' => '08123', 'reason' => 'Operasional', 'requested_role' => 'user'])->assertOk();
        $this->assertDatabaseHas('user_registrations', ['username' => 'baru_1', 'status' => 'pending']);
        [, $token] = $this->login('user');
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.role', 'user');
        $this->withToken($token)->getJson('/api/v1/users')->assertForbidden();
    }

    public function test_login_requires_server_verified_captcha_when_enabled(): void
    {
        config()->set('services.turnstile.enabled', true);
        config()->set('services.turnstile.site_key', 'test-site-key');
        config()->set('services.turnstile.secret_key', 'test-secret-key');
        User::create(['username' => 'captcha_user', 'full_name' => 'Captcha User', 'email' => 'captcha@example.test', 'password' => 'Secret123!', 'role' => 'user', 'status' => 'active']);

        $this->getJson('/api/v1/auth/captcha-config')
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.site_key', 'test-site-key');

        $this->postJson('/api/v1/auth/login', ['username' => 'captcha_user', 'password' => 'Secret123!'])
            ->assertStatus(422);

        Http::fake([
            'challenges.cloudflare.com/*' => Http::response(['success' => true, 'action' => 'login', 'hostname' => 'localhost']),
        ]);

        $this->postJson('/api/v1/auth/login', ['username' => 'captcha_user', 'password' => 'Secret123!', 'captcha_token' => 'valid-test-token'])
            ->assertOk()
            ->assertJsonPath('data.user.username', 'captcha_user');

        Http::assertSent(fn ($request) => $request['secret'] === 'test-secret-key' && $request['response'] === 'valid-test-token');
    }

    public function test_login_fails_closed_when_captcha_provider_rejects_token(): void
    {
        config()->set('services.turnstile.enabled', true);
        config()->set('services.turnstile.secret_key', 'test-secret-key');
        User::create(['username' => 'blocked_bot', 'full_name' => 'Blocked Bot', 'email' => 'bot@example.test', 'password' => 'Secret123!', 'role' => 'user', 'status' => 'active']);
        Http::fake([
            'challenges.cloudflare.com/*' => Http::response(['success' => false, 'error-codes' => ['invalid-input-response']]),
        ]);

        $this->postJson('/api/v1/auth/login', ['username' => 'blocked_bot', 'password' => 'Secret123!', 'captcha_token' => 'invalid-token'])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_checklist_can_be_saved_signed_and_verified(): void
    {
        [$admin,$adminToken] = $this->login('admin', 'admin_test');
        [$manager,$managerToken] = $this->login('manager_hsse', 'manager_test');
        $vehicleId = DB::table('kendaraan')->insertGetId(['jenis' => 'SPBU', 'nomor_polisi' => 'DB 1234 AB', 'merk_mobil' => 'Hino', 'tahun_kendaraan' => 2025, 'status' => 'AKTIF', 'created_by' => $admin['id'], 'created_at' => now(), 'updated_at' => now()]);
        $payload = ['selectedVehicleId' => $vehicleId, 'jenisKendaraan' => 'SPBU', 'nomorUrut' => '001', 'tanggalPemeriksaan' => today()->toDateString(), 'ekimValidUntil' => today()->addYear()->toDateString(), 'statusGate' => 'OK', 'statusUpload' => 'OK', 'namaPemeriksaBagian' => 'Admin_test', 'tanggalPemeriksaBagian' => today()->toDateString(), 'checklist' => [['nama' => 'Safety switch', 'baik' => true, 'tidak' => false, 'keterangan' => 'Baik', 'tanggal_expire' => '']]];
        $id = $this->withToken($adminToken)->postJson('/api/v1/checklists', $payload)->assertOk()->json('data.id');
        $signature = ['formulir_id' => $id, 'role' => 'hsse', 'canvas_image' => 'data:image/png;base64,iVBORw0KGgo=', 'signer_name' => 'Admin_test'];
        $this->withToken($adminToken)->postJson('/api/v1/checklists/signature', $signature)->assertOk()->assertJsonPath('data.new_status', 'signed_hsse');
        $this->app['auth']->forgetGuards();
        $this->withToken($managerToken)->postJson('/api/v1/checklists/signature', ['formulir_id' => $id, 'role' => 'manajer', 'canvas_image' => 'data:image/png;base64,iVBORw0KGgo=', 'signer_name' => 'Manager_test'])->assertOk()->assertJsonPath('data.new_status', 'approved');
        $uuid = DB::table('formulir_checklist')->where('id', $id)->value('verification_uuid');
        $this->getJson("/api/v1/verify/$uuid")->assertOk()->assertJsonPath('data.validation.authentic', true);
    }
}
