<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TurnstileVerifier;
use Carbon\Carbon;
use DOMDocument;
use DOMXPath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PrimaController extends Controller
{
    private const ROLES = ['admin', 'user', 'pengurus', 'hsse', 'manager_hsse'];

    private const STATES = ['draft', 'pending_hsse', 'signed_hsse', 'approved', 'rejected'];

    private const EXPIRY_ITEMS = ['STNK', 'PAJAK', 'SIMFIT (Industri)', 'Surat Tera Metrologi', 'Surat Keur DLLAAJR'];

    private function ok(string $message = 'OK', mixed $data = null, int $status = 200): JsonResponse
    {
        return response()->json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    private function fail(string $message, int $status = 422, mixed $data = null): JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message, 'data' => $data], $status);
    }

    private function requireRole(Request $r, array $roles): void
    {
        if (! in_array($r->user()->role, $roles, true)) {
            throw new HttpException(403, 'Akses ditolak.');
        }
    }

    private function setting(string $key, mixed $default = null): mixed
    {
        return DB::table('system_settings')->where('setting_key', $key)->value('setting_value') ?? $default;
    }

    private function setSetting(string $key, mixed $value): void
    {
        DB::table('system_settings')->upsert([['setting_key' => $key, 'setting_value' => (string) $value, 'updated_at' => now()]], ['setting_key'], ['setting_value', 'updated_at']);
    }

    private function audit(Request $r, string $action, string $description, ?int $formId = null): void
    {
        DB::table('audit_log')->insert(['formulir_id' => $formId, 'action' => $action, 'user_name' => $r->user()?->username ?? 'System', 'ip_address' => $r->ip(), 'description' => $description, 'created_at' => now()]);
    }

    public function login(Request $r): JsonResponse
    {
        $turnstile = app(TurnstileVerifier::class);
        $v = Validator::make($r->all(), [
            'username' => 'required|string|max:50',
            'password' => 'required|string',
            'captcha_token' => $turnstile->enabled() ? 'required|string|max:2048' : 'nullable|string|max:2048',
        ]);
        if ($v->fails()) {
            $message = $turnstile->enabled()
                ? 'Username, password, dan verifikasi CAPTCHA wajib diisi.'
                : 'Username dan password wajib diisi.';

            return $this->fail($message, 422, $v->errors());
        }
        if (! $turnstile->verify($r->string('captcha_token')->toString(), $r->ip())) {
            return $this->fail('Verifikasi CAPTCHA gagal atau kedaluwarsa. Silakan coba kembali.', 422);
        }
        $u = User::where('username', $r->string('username')->trim())->first();
        if (! $u || ! Hash::check((string) $r->password, $u->password)) {
            if ($u) {
                $u->login_attempts++;
                if ($u->login_attempts >= 5) {
                    $u->locked_until = now()->addMinutes(15);
                } $u->save();
            }

            return $this->fail('Username atau password salah.', 401);
        }
        if ($u->locked_until?->isFuture()) {
            return $this->fail('Akun terkunci sementara.', 423);
        }
        if ($u->status !== 'active') {
            return $this->fail('Akun belum aktif.', 403);
        }
        if ($u->role !== 'admin' && $this->setting('maintenance_mode', '0') === '1') {
            return $this->fail($this->setting('maintenance_message', 'Sistem sedang dalam pemeliharaan.'), 503);
        }
        $u->forceFill(['login_attempts' => 0, 'locked_until' => null, 'last_login' => now()])->save();
        $minutes = max(15, min(480, (int) $this->setting('session_timeout_minutes', 60)));
        $token = $u->createToken('prima-react', ['*'], now()->addMinutes($minutes))->plainTextToken;
        DB::table('audit_log')->insert(['action' => 'LOGIN', 'user_name' => $u->username, 'ip_address' => $r->ip(), 'description' => 'Login berhasil', 'created_at' => now()]);

        return $this->ok('Login berhasil.', ['user' => $this->userData($u), 'token' => $token]);
    }

    public function captchaConfig(): JsonResponse
    {
        $enabled = app(TurnstileVerifier::class)->enabled();
        $siteKey = (string) config('services.turnstile.site_key');

        if ($enabled && $siteKey === '') {
            return $this->fail('Konfigurasi CAPTCHA belum lengkap.', 503);
        }

        return $this->ok('OK', [
            'enabled' => $enabled,
            'provider' => 'cloudflare-turnstile',
            'site_key' => $enabled ? $siteKey : null,
        ]);
    }

    public function register(Request $r): JsonResponse
    {
        $v = Validator::make($r->all(), [
            'username' => ['required', 'regex:/^[A-Za-z0-9_]+$/', 'max:50'], 'email' => 'required|email|max:100', 'password' => 'required|min:8|max:100',
            'full_name' => 'required|max:100', 'phone' => 'required|max:20', 'reason' => 'required|max:1000', 'requested_role' => ['nullable', Rule::in(['user', 'pengurus', 'manager_hsse'])],
        ]);
        if ($v->fails()) {
            return $this->fail($v->errors()->first(), 422, $v->errors());
        }
        $exists = User::where('username', $r->username)->orWhere('email', $r->email)->exists() || DB::table('user_registrations')->where(fn ($q) => $q->where('username', $r->username)->orWhere('email', $r->email))->whereIn('status', ['pending', 'approved'])->exists();
        if ($exists) {
            return $this->fail('Username atau email sudah terdaftar.', 409);
        }
        DB::table('user_registrations')->where('username', $r->username)->orWhere('email', $r->email)->delete();
        DB::table('user_registrations')->insert(['username' => $r->username, 'email' => $r->email, 'password' => Hash::make($r->password), 'full_name' => $r->full_name, 'phone' => $r->phone, 'reason' => $r->reason, 'requested_role' => $r->requested_role ?: 'user', 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);

        return $this->ok('Pendaftaran berhasil dikirim dan menunggu persetujuan administrator.');
    }

    public function logout(Request $r): JsonResponse
    {
        $r->user()->currentAccessToken()?->delete();

        return $this->ok('Logout berhasil.');
    }

    public function me(Request $r): JsonResponse
    {
        return $this->ok('OK', $this->userData($r->user()));
    }

    private function userData(User $u): array
    {
        return ['id' => $u->id, 'username' => $u->username, 'full_name' => $u->full_name, 'email' => $u->email, 'phone' => $u->phone, 'role' => $u->role, 'status' => $u->status];
    }

    public function dashboard(Request $r): JsonResponse
    {
        $u = $r->user();
        $start = now()->startOfMonth();
        $end = now()->endOfMonth();
        $counts = ['checklists' => DB::table('formulir_checklist')->count(), 'spbu' => DB::table('formulir_checklist')->whereRaw('UPPER(jenis_kendaraan)=?', ['SPBU'])->count(), 'industri' => DB::table('formulir_checklist')->whereRaw('UPPER(jenis_kendaraan)=?', ['INDUSTRI'])->count(), 'bulan_ini' => DB::table('formulir_checklist')->whereBetween('tanggal_pemeriksaan', [$start, $end])->count()];
        foreach (self::STATES as $s) {
            $counts[$s] = DB::table('formulir_checklist')->where('status_approval', $s)->count();
        }
        if ($u->role === 'admin') {
            $counts += ['users' => User::where('username', '<>', 'admin')->count(), 'active_users' => User::where('username', '<>', 'admin')->where('status', 'active')->count(), 'pending_registrations' => DB::table('user_registrations')->where('status', 'pending')->count(), 'vehicles' => DB::table('kendaraan')->count(), 'pending_documents' => DB::table('dokumen_kendaraan')->where('status', 'PENDING')->count(), 'vehicle_alerts' => count($this->vehicleAlerts(30))];
        }
        if ($u->role === 'pengurus') {
            $rows = $this->managedVehicles($u->id);
            $counts['ekim_notifications'] = DB::table('ekim_notifikasi')->where('user_id', $u->id)->orderByDesc('created_at')->limit(10)->get();
            DB::table('ekim_notifikasi')->where('user_id', $u->id)->update(['is_read' => true]);
            $counts += ['my_vehicles' => count($rows), 'my_pending_documents' => collect($rows)->sum('pending_dokumen'), 'my_approved_documents' => collect($rows)->sum('disetujui_dokumen'), 'my_rejected_documents' => collect($rows)->sum('ditolak_dokumen')];
        }
        $counts['profile'] = $this->userData($u);

        return $this->ok('OK', $counts);
    }

    public function checklistStats(Request $r): JsonResponse
    {
        $start = now()->startOfMonth();
        $end = now()->endOfMonth();

        return $this->ok('OK', ['total' => DB::table('formulir_checklist')->count(), 'spbu' => DB::table('formulir_checklist')->whereRaw('UPPER(jenis_kendaraan)=?', ['SPBU'])->count(), 'industri' => DB::table('formulir_checklist')->whereRaw('UPPER(jenis_kendaraan)=?', ['INDUSTRI'])->count(), 'bulan_ini' => DB::table('formulir_checklist')->whereBetween('tanggal_pemeriksaan', [$start, $end])->count(), 'kim_kedaluwarsa' => count(array_filter($this->vehicleAlerts(0), fn ($x) => $x['status_alert'] === 'SUDAH_EXPIRED'))]);
    }

    public function vehicles(Request $r): JsonResponse
    {
        $q = DB::table('kendaraan as k')->select('k.*')->selectSub(fn ($s) => $s->from('pengurus_kendaraan as pk')->join('users as u', 'u.id', '=', 'pk.user_id')->whereColumn('pk.nomor_polisi', 'k.nomor_polisi')->latest('pk.created_at')->select('u.username')->limit(1), 'username_transportir')->latest('k.created_at');
        if ($r->user()->role === 'pengurus') {
            $q->whereExists(fn ($s) => $s->from('pengurus_kendaraan as owner')->whereColumn('owner.nomor_polisi', 'k.nomor_polisi')->where('owner.user_id', $r->user()->id));
        }

        return $this->ok('OK', $q->get());
    }

    public function template(Request $r): JsonResponse
    {
        $jenis = strtoupper($r->query('jenis', 'SPBU')) === 'INDUSTRI' ? 'INDUSTRI' : 'SPBU';
        $file = resource_path('checklists/'.strtolower($jenis).'.html');
        $dom = new DOMDocument;
        @$dom->loadHTML(file_get_contents($file), LIBXML_NOERROR | LIBXML_NOWARNING);
        $xp = new DOMXPath($dom);
        $items = [];
        foreach ($xp->query('//table[@id="checklistTable"]//tbody/tr') as $row) {
            $c = $xp->query('./td', $row);
            if ($c->length < 5) {
                continue;
            }$o = preg_match('/^\d+$/', trim($c->item(0)->textContent)) ? 1 : 0;
            $name = trim(preg_replace('/\s+/', ' ', $c->item($o)->textContent));
            if ($name === '' || stripos($name, 'tanda tangan') !== false) {
                continue;
            }$items[] = ['nama' => $name, 'pelaksana' => trim($c->item($o + 1)->textContent ?? ''), 'prioritas' => trim($c->item($o + 2)->textContent ?? ''), 'nomor' => $o ? trim($c->item(0)->textContent) : null, 'rowspan' => $o ? max(1, (int) ($c->item(0)->getAttribute('rowspan') ?: 1)) : 0];
        }

        return $this->ok('OK', $items);
    }

    public function checklists(Request $r): JsonResponse
    {
        $limit = max(1, min(100, (int) $r->query('limit', 50)));
        $q = DB::table('formulir_checklist as f');
        if ($s = trim($r->query('search', ''))) {
            $q->where(fn ($x) => $x->where('f.nomor_polisi', 'ilike', "%$s%")->orWhere('f.nama_transport', 'ilike', "%$s%")->orWhere('f.nomor_urut', 'ilike', "%$s%"));
        }
        if ($d = $r->query('dateFrom')) {
            $q->whereDate('f.tanggal_pemeriksaan', '>=', $d);
        } if ($d = $r->query('dateTo')) {
            $q->whereDate('f.tanggal_pemeriksaan', '<=', $d);
        }
        if (in_array($r->query('jenis'), ['SPBU', 'INDUSTRI'], true)) {
            $q->where('f.jenis_kendaraan', $r->query('jenis'));
        } if (in_array($r->query('status'), self::STATES, true)) {
            $q->where('f.status_approval', $r->query('status'));
        }
        $p = $q->select('f.*')->selectSub(fn ($s) => $s->from('checklist_items')->whereColumn('formulir_id', 'f.id')->selectRaw('COUNT(*)'), 'total_items')->selectSub(fn ($s) => $s->from('checklist_items')->whereColumn('formulir_id', 'f.id')->where('is_baik', true)->selectRaw('COUNT(*)'), 'total_baik')->selectSub(fn ($s) => $s->from('checklist_items')->whereColumn('formulir_id', 'f.id')->where('is_tidak', true)->selectRaw('COUNT(*)'), 'total_tidak')->orderByDesc('f.tanggal_pemeriksaan')->orderByDesc('f.created_at')->paginate($limit);
        $data = collect($p->items())->map(function ($x) {
            $x = (array) $x;
            $x['persentase_baik'] = $x['total_items'] ? round($x['total_baik'] / $x['total_items'] * 100, 2) : 0;
            $x['ekim_is_expired'] = ! empty($x['ekim_valid_until']) && $x['ekim_valid_until'] < today()->toDateString() ? 1 : 0;

            return $x;
        })->values();

        return response()->json(['success' => true, 'message' => 'Data berhasil dimuat', 'data' => $data, 'pagination' => ['page' => $p->currentPage(), 'limit' => $p->perPage(), 'total' => $p->total(), 'totalPages' => $p->lastPage()]]);
    }

    public function checklist(Request $r, int $id): JsonResponse
    {
        $f = DB::table('formulir_checklist')->where('id', $id)->first();
        if (! $f) {
            return $this->fail('Data tidak ditemukan.', 404);
        }
        $d = (array) $f;
        $d['viewer_role'] = $r->user()->role;
        $d['viewer_is_manager'] = $r->user()->role === 'manager_hsse';
        $d['viewer_can_sign_hsse'] = in_array($r->user()->role, ['admin', 'hsse'], true);
        $d['viewer_can_approve'] = $r->user()->role === 'manager_hsse' && $f->status_approval === 'signed_hsse';
        $d['checklist_items'] = DB::table('checklist_items')->where('formulir_id', $id)->orderBy('item_number')->get();

        return $this->ok('Data berhasil dimuat', $d);
    }

    public function saveChecklist(Request $r): JsonResponse
    {
        if ($r->user()->role === 'manager_hsse') {
            return $this->fail('Manager tidak dapat mengubah formulir.', 403);
        }
        $v = Validator::make($r->all(), ['selectedVehicleId' => 'required|integer', 'jenisKendaraan' => ['required', Rule::in(['SPBU', 'INDUSTRI'])], 'tanggalPemeriksaan' => 'required|date', 'ekimValidUntil' => 'required|date|after_or_equal:tanggalPemeriksaan', 'checklist' => 'required|array|min:1']);
        if ($v->fails()) {
            return $this->fail($v->errors()->first(), 422, $v->errors());
        }
        $vehicle = DB::table('kendaraan')->where('id', $r->selectedVehicleId)->where('status', 'AKTIF')->first();
        if (! $vehicle) {
            return $this->fail('Kendaraan tidak ditemukan atau sudah tidak aktif.', 404);
        }
        if (strtoupper($vehicle->jenis) !== strtoupper($r->jenisKendaraan)) {
            return $this->fail('Jenis kendaraan tidak sesuai dengan formulir.', 422);
        }
        if ($r->user()->role === 'pengurus' && ! DB::table('pengurus_kendaraan')->where(['user_id' => $r->user()->id, 'nomor_polisi' => $vehicle->nomor_polisi])->exists()) {
            return $this->fail('Kendaraan ini bukan tanggung jawab akun Anda.', 403);
        }
        foreach ($r->checklist as $item) {
            $name = $item['nama'] ?? '';
            $requires = in_array($name, self::EXPIRY_ITEMS, true) && ! ($name === 'SIMFIT (Industri)' && $vehicle->jenis !== 'INDUSTRI');
            if ($requires && empty($item['tanggal_expire'])) {
                return $this->fail("Tanggal masa berlaku $name wajib diisi.");
            }if ($requires && $item['tanggal_expire'] < $r->tanggalPemeriksaan) {
                return $this->fail("$name sudah kedaluwarsa pada tanggal pemeriksaan.");
            }
        }
        try {
            $id = DB::transaction(function () use ($r, $vehicle) {
                $values = ['jenis_kendaraan' => $vehicle->jenis, 'nomor_urut' => $r->nomorUrut, 'merk_mobil' => trim($vehicle->merk_mobil.' '.($vehicle->tahun_kendaraan ?? '')), 'nama_transport' => $vehicle->nama_transport, 'nomor_polisi' => $vehicle->nomor_polisi, 'tanggal_terakhir' => $vehicle->tanggal_pemeriksaan_terakhir, 'produk_kapasitas' => $vehicle->produk_kapasitas, 'tanggal_pemeriksaan' => $r->tanggalPemeriksaan, 'ekim_valid_until' => $r->ekimValidUntil, 'status_gate' => $r->statusGate, 'status_upload' => $r->statusUpload, 'catatan' => $r->catatan, 'nama_pemeriksa' => $r->namaPemeriksaBagian, 'tanggal_pemeriksa' => $r->tanggalPemeriksaBagian, 'updated_at' => now()];
                if ($r->id) {
                    $old = DB::table('formulir_checklist')->where('id', $r->id)->first();
                    if (! $old) {
                        return 0;
                    }if ($old->status_approval !== 'draft') {
                        throw new HttpException(409, 'Dokumen bukan draft dan tidak dapat diubah.');
                    }DB::table('formulir_checklist')->where('id', $r->id)->update($values);
                    $id = (int) $r->id;
                    DB::table('checklist_items')->where('formulir_id', $id)->delete();
                } else {
                    $values += ['created_by' => $r->user()->id, 'status_approval' => 'draft', 'created_at' => now()];
                    $id = DB::table('formulir_checklist')->insertGetId($values);
                }foreach ($r->checklist as $i => $item) {
                    DB::table('checklist_items')->insert(['formulir_id' => $id, 'item_number' => $i + 1, 'item_name' => $item['nama'] ?? ('Item '.($i + 1)), 'is_baik' => ! empty($item['baik']), 'is_tidak' => ! empty($item['tidak']), 'keterangan' => $item['keterangan'] ?? null, 'tanggal_expire' => in_array($item['nama'] ?? '', self::EXPIRY_ITEMS, true) ? ($item['tanggal_expire'] ?: null) : null]);
                }

                return $id;
            });
            if (! $id) {
                return $this->fail('Data tidak ditemukan.', 404);
            }$this->audit($r, $r->id ? 'UPDATE' : 'CREATE', "Formulir checklist {$vehicle->nomor_polisi}", $id);

            return $this->ok($r->id ? 'Data berhasil diupdate' : 'Data berhasil disimpan', ['id' => $id]);
        } catch (HttpException $e) {
            return $this->fail($e->getMessage(), $e->getStatusCode());
        }
    }

    public function deleteChecklist(Request $r, int $id): JsonResponse
    {
        if ($r->user()->role === 'manager_hsse') {
            return $this->fail('Akses ditolak.', 403);
        }$f = DB::table('formulir_checklist')->where('id', $id)->first();
        if (! $f) {
            return $this->fail('Data tidak ditemukan.', 404);
        }if ($f->status_approval !== 'draft' && $r->user()->role !== 'admin') {
            return $this->fail('Hanya draft yang dapat dihapus.', 409);
        }DB::table('formulir_checklist')->where('id', $id)->delete();
        $this->audit($r, 'DELETE', "Formulir {$f->nomor_polisi} dihapus");

        return $this->ok('Data berhasil dihapus.');
    }

    private function canonical(int $id, string $algo = 'sha256'): ?string
    {
        $f = DB::table('formulir_checklist')->where('id', $id)->first();
        if (! $f) {
            return null;
        }$data = (array) $f;
        foreach (['updated_at', 'dokumen_hash', 'status_approval', 'ttd_hsse_user_id', 'ttd_hsse_nama', 'ttd_hsse_signature', 'ttd_hsse_hash', 'ttd_hsse_gambar', 'ttd_hsse_timestamp', 'ttd_manajer_user_id', 'ttd_manajer_nama', 'ttd_manajer_signature', 'ttd_manajer_hash', 'ttd_manajer_gambar', 'ttd_manajer_timestamp', 'qr_token', 'verification_uuid', 'verification_hash_sha512', 'verification_signature', 'verification_url', 'verification_qrcode_path', 'verification_created_at'] as $key) {
            unset($data[$key]);
        }$data['checklist_items'] = DB::table('checklist_items')->where('formulir_id', $id)->orderBy('item_number')->get()->map(fn ($x) => (array) $x)->all();

        return hash($algo, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function sign(string $hash): string
    {
        return 'hmac-sha256:'.Str::replace(['+', '/', '='], ['-', '_', ''], base64_encode(hash_hmac('sha256', $hash, config('app.signature_secret'), true)));
    }

    public function signature(Request $r): JsonResponse
    {
        $v = Validator::make($r->all(), ['formulir_id' => 'required|integer', 'role' => ['required', Rule::in(['hsse', 'manajer'])], 'canvas_image' => ['required', 'string', 'max:3145728', 'regex:#^data:image/png;base64,#'], 'signer_name' => 'required|string|max:100']);
        if ($v->fails()) {
            return $this->fail($v->errors()->first());
        }
        $u = $r->user();
        if ($r->role === 'hsse' && ! in_array($u->role, ['admin', 'hsse'], true)) {
            return $this->fail('Hanya Tim HSSE atau Admin yang dapat menandatangani.', 403);
        }if ($r->role === 'manajer' && $u->role !== 'manager_hsse') {
            return $this->fail('Hanya Manager yang dapat menandatangani.', 403);
        }
        if (mb_strtolower(trim($r->signer_name)) !== mb_strtolower(trim($u->full_name ?: $u->username))) {
            return $this->fail("Nama penandatangan harus sama dengan akun aktif: {$u->full_name}");
        }
        $f = DB::table('formulir_checklist')->where('id', $r->formulir_id)->first();
        if (! $f) {
            return $this->fail('Formulir tidak ditemukan.', 404);
        }$bad = DB::table('checklist_items')->where('formulir_id', $f->id)->where('is_tidak', true)->pluck('item_name')->all();
        if ($bad) {
            return $this->fail('Tanda tangan ditolak: terdapat item TIDAK BAIK — '.implode('; ', $bad), 422, ['tidak_items' => $bad]);
        }if ($f->ekim_valid_until && $f->ekim_valid_until < today()->toDateString()) {
            return $this->fail('Tanda tangan ditolak: EKIM sudah kedaluwarsa.');
        }
        $name = $u->full_name ?: $u->username;
        $hash = $this->canonical($f->id);
        $sig = $this->sign($hash);
        $uuid = $f->verification_uuid ?: Str::uuid()->toString();
        $url = rtrim(config('app.frontend_url'), '/').'/'.'#/verify/'.$uuid;
        if ($r->role === 'hsse') {
            if (! in_array($f->status_approval, ['draft', 'pending_hsse'], true)) {
                return $this->fail('Status formulir tidak dapat ditandatangani HSSE.', 409);
            }DB::table('formulir_checklist')->where('id', $f->id)->update(['dokumen_hash' => $hash, 'status_approval' => 'signed_hsse', 'ttd_hsse_user_id' => $u->id, 'ttd_hsse_nama' => $name, 'ttd_hsse_timestamp' => now(), 'ttd_hsse_signature' => $sig, 'ttd_hsse_hash' => $hash, 'ttd_hsse_gambar' => $r->canvas_image, 'verification_uuid' => $uuid, 'verification_url' => $url]);
            $action = 'SIGN_HSSE';
            $status = 'signed_hsse';
            $message = "Tanda tangan digital HSSE berhasil disimpan oleh $name.";
        } else {
            if ($f->status_approval !== 'signed_hsse') {
                return $this->fail('Formulir harus ditandatangani HSSE terlebih dahulu.', 409);
            }if (! hash_equals((string) $f->dokumen_hash, (string) $hash) || ! hash_equals((string) $f->ttd_hsse_signature, $this->sign($hash))) {
                return $this->fail('Integritas dokumen gagal. Isi berubah setelah tanda tangan HSSE.', 409);
            }$final = $this->canonical($f->id, 'sha512');
            DB::table('formulir_checklist')->where('id', $f->id)->update(['status_approval' => 'approved', 'ttd_manajer_user_id' => $u->id, 'ttd_manajer_nama' => $name, 'ttd_manajer_timestamp' => now(), 'ttd_manajer_signature' => $sig, 'ttd_manajer_hash' => $hash, 'ttd_manajer_gambar' => $r->canvas_image, 'verification_hash_sha512' => $final, 'verification_signature' => $this->sign($final), 'verification_created_at' => now(), 'verification_uuid' => $uuid, 'verification_url' => $url]);
            $action = 'SIGN_MANAJER';
            $status = 'approved';
            $message = "Tanda tangan Manajer berhasil disimpan oleh $name. Formulir telah DISETUJUI.";
            $this->notifyOwners($f->nomor_polisi, $f->id, 'issued', "EKIM kendaraan {$f->nomor_polisi} telah DITERBITKAN.");
        }
        DB::table('digital_signature_log')->insert(['formulir_id' => $f->id, 'action' => $action, 'user_id' => $u->id, 'user_name' => $name, 'role_signer' => $u->role, 'dokumen_hash' => $hash, 'signature_snippet' => substr($sig, 0, 50), 'ip_address' => $r->ip(), 'created_at' => now()]);
        $this->audit($r, 'UPDATE', $message, $f->id);

        return $this->ok($message, ['nama' => $name, 'waktu' => now()->toDateTimeString(), 'new_status' => $status, 'verification_url' => $url]);
    }

    public function workflow(Request $r): JsonResponse
    {
        $this->requireRole($r, ['admin', 'hsse', 'manager_hsse']);
        $f = DB::table('formulir_checklist')->where('id', $r->integer('formulir_id'))->first();
        if (! $f) {
            return $this->fail('Formulir tidak ditemukan.', 404);
        }$action = $r->input('action');
        if ($action === 'submit') {
            if (! in_array($r->user()->role, ['admin', 'hsse'], true) || $f->status_approval !== 'draft') {
                return $this->fail('Aksi tidak diizinkan.', 403);
            }DB::table('formulir_checklist')->where('id', $f->id)->update(['status_approval' => 'pending_hsse']);
            $state = 'pending_hsse';
        } elseif ($action === 'reject') {
            if (! in_array($f->status_approval, ['pending_hsse', 'signed_hsse'], true)) {
                return $this->fail('Status tidak dapat ditolak.', 409);
            }DB::table('formulir_checklist')->where('id', $f->id)->update(['status_approval' => 'rejected']);
            $state = 'rejected';
            $this->notifyOwners($f->nomor_polisi, $f->id, 'rejected', "EKIM {$f->nomor_polisi} ditolak: ".$r->input('reason', ''));
        } elseif ($action === 'reset_draft' && $r->user()->role === 'admin') {
            if ($f->status_approval === 'approved') {
                return $this->fail('Formulir approved tidak dapat di-reset.', 409);
            }DB::table('formulir_checklist')->where('id', $f->id)->update(['status_approval' => 'draft', 'dokumen_hash' => null, 'ttd_hsse_user_id' => null, 'ttd_hsse_nama' => null, 'ttd_hsse_signature' => null, 'ttd_hsse_timestamp' => null, 'ttd_manajer_user_id' => null, 'ttd_manajer_nama' => null, 'ttd_manajer_signature' => null, 'ttd_manajer_timestamp' => null, 'verification_uuid' => null, 'verification_hash_sha512' => null, 'verification_signature' => null, 'verification_url' => null, 'verification_created_at' => null]);
            $state = 'draft';
        } else {
            return $this->fail('Aksi tidak dikenali atau tidak diizinkan.', 403);
        }$this->audit($r, 'UPDATE', "Status checklist menjadi $state", $f->id);

        return $this->ok('Status checklist berhasil diperbarui.', ['new_status' => $state]);
    }

    public function verify(Request $r, string $value): JsonResponse
    {
        $q = DB::table('formulir_checklist');
        $f = Str::isUuid($value) ? $q->where('verification_uuid', $value)->first() : $q->where('qr_token', $value)->first();
        if (! $f) {
            return $this->fail('Dokumen tidak ditemukan.', 404);
        }$hash = $this->canonical($f->id);
        $unchanged = $f->dokumen_hash && hash_equals($f->dokumen_hash, $hash);
        $hsse = $unchanged && hash_equals((string) $f->ttd_hsse_signature, $this->sign($hash));
        $manager = $unchanged && hash_equals((string) $f->ttd_manajer_signature, $this->sign($hash));
        $finalHash = $this->canonical($f->id, 'sha512');
        $final = $unchanged && ! empty($f->verification_hash_sha512) && hash_equals((string) $f->verification_hash_sha512, (string) $finalHash) && hash_equals((string) $f->verification_signature, $this->sign($finalHash));
        $notExpired = ! $f->ekim_valid_until || $f->ekim_valid_until >= today()->toDateString();
        $auth = $f->status_approval === 'approved' && $hsse && $manager && $final && $notExpired;
        $state = $auth ? 'valid' : (($f->status_approval === 'approved' && $hsse && $manager && $final && ! $notExpired) ? 'expired' : ($f->status_approval === 'rejected' ? 'invalid' : 'pending'));
        $safe = collect((array) $f)->only(['id', 'nomor_polisi', 'nama_transport', 'jenis_kendaraan', 'tanggal_pemeriksaan', 'ekim_valid_until', 'status_approval', 'ttd_hsse_nama', 'ttd_hsse_timestamp', 'ttd_manajer_nama', 'ttd_manajer_timestamp', 'verification_uuid', 'verification_created_at'])->all();
        $safe['validation'] = ['authentic' => $auth, 'document_unchanged' => $unchanged, 'hsse_valid' => $hsse, 'manager_valid' => $manager, 'final_proof_valid' => $final, 'certificate_not_expired' => $notExpired, 'state' => $state, 'algorithm' => 'HMAC-SHA256'];

        return $this->ok($auth ? 'Dokumen asli dan valid.' : ($state === 'expired' ? 'Dokumen asli, tetapi EKIM sudah kedaluwarsa.' : 'Dokumen belum valid.'), $safe);
    }

    private function notifyOwners(string $plate, int $formId, string $status, string $message): void
    {
        foreach (DB::table('pengurus_kendaraan')->where('nomor_polisi', $plate)->pluck('user_id') as $uid) {
            DB::table('ekim_notifikasi')->insert(['user_id' => $uid, 'formulir_id' => $formId, 'nomor_polisi' => $plate, 'status' => $status, 'pesan' => $message, 'is_read' => false, 'created_at' => now()]);
        }
    }

    private function managedVehicles(int $uid): array
    {
        return DB::table('pengurus_kendaraan as pk')->leftJoin('dokumen_kendaraan as dk', fn ($j) => $j->on('dk.nomor_polisi', '=', 'pk.nomor_polisi')->where('dk.uploaded_by', $uid))->where('pk.user_id', $uid)->groupBy('pk.nomor_polisi', 'pk.nama_transport')->select('pk.nomor_polisi', 'pk.nama_transport')->selectRaw('COUNT(dk.id) total_dokumen')->selectRaw("SUM(CASE WHEN dk.status='PENDING' THEN 1 ELSE 0 END) pending_dokumen")->selectRaw("SUM(CASE WHEN dk.status='DISETUJUI' THEN 1 ELSE 0 END) disetujui_dokumen")->selectRaw("SUM(CASE WHEN dk.status='DITOLAK' THEN 1 ELSE 0 END) ditolak_dokumen")->selectRaw('MAX(dk.created_at) last_upload')->get()->map(fn ($x) => (array) $x)->all();
    }

    private function vehicleAlerts(int $days): array
    {
        $limit = today()->addDays($days)->toDateString();
        $rows = DB::table('formulir_checklist as f')->where('status_approval', 'approved')->whereNotNull('ekim_valid_until')->where('ekim_valid_until', '<=', $limit)->whereRaw('f.id=(SELECT MAX(f2.id) FROM formulir_checklist f2 WHERE f2.nomor_polisi=f.nomor_polisi AND f2.status_approval=?)', ['approved'])->get();

        return $rows->map(fn ($x) => ['id' => $x->id, 'nomor_polisi' => $x->nomor_polisi, 'merk_mobil' => $x->merk_mobil, 'nama_transport' => $x->nama_transport, 'jenis' => $x->jenis_kendaraan, 'ekim_valid_until' => $x->ekim_valid_until, 'effective_valid_until' => $x->ekim_valid_until, 'hari_tersisa' => today()->diffInDays(Carbon::parse($x->ekim_valid_until), false), 'status_alert' => $x->ekim_valid_until < today()->toDateString() ? 'SUDAH_EXPIRED' : 'PERLU_INSPEKSI'])->all();
    }
}
