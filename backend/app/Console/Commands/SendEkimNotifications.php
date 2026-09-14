<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class SendEkimNotifications extends Command
{
    protected $signature = 'prima:notifications {--dry-run : Periksa kandidat tanpa mengirim email atau mengubah database}';

    protected $description = 'Kirim notifikasi email EKIM yang mendekati atau melewati masa berlaku';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $settings = DB::table('system_settings')->pluck('setting_value', 'setting_key');
        $days = max(0, min(365, (int) ($settings['notif_days_threshold'] ?? 30)));
        $until = today()->addDays($days)->toDateString();
        $rows = DB::table('formulir_checklist as f')->leftJoin('kendaraan as k', 'k.nomor_polisi', '=', 'f.nomor_polisi')->where('f.status_approval', 'approved')->whereNotNull('k.email_kontraktor')->whereNotNull('f.ekim_valid_until')->where('f.ekim_valid_until', '<=', $until)->whereRaw('f.id=(SELECT MAX(f2.id) FROM formulir_checklist f2 WHERE f2.nomor_polisi=f.nomor_polisi AND f2.status_approval=?)', ['approved'])->select('f.*', 'k.email_kontraktor')->get();

        if ($dryRun) {
            $this->info('Mode uji: '.$rows->count().' kandidat ditemukan; tidak ada email atau data yang diubah.');

            return self::SUCCESS;
        }

        if (! empty($settings['smtp_host'])) {
            $encryption = $settings['smtp_encryption'] ?? 'tls';
            Config::set('mail.mailers.smtp', ['transport' => 'smtp', 'scheme' => $encryption === 'ssl' ? 'smtps' : 'smtp', 'host' => $settings['smtp_host'], 'port' => (int) ($settings['smtp_port'] ?? 587), 'auto_tls' => $encryption !== 'none', 'username' => $settings['smtp_username'] ?? null, 'password' => isset($settings['smtp_password']) ? decrypt($settings['smtp_password']) : null, 'timeout' => 30]);
            Config::set('mail.default', 'smtp');
        }
        if (! empty($settings['smtp_from_email'])) {
            Config::set('mail.from', ['address' => $settings['smtp_from_email'], 'name' => $settings['smtp_from_name'] ?? 'PRIMA']);
        }

        foreach ($rows as $x) {
            if (DB::table('kim_notifications')->where('nomor_polisi', $x->nomor_polisi)->where('status', 'sent')->where('sent_at', '>=', now()->subDays(7))->exists()) {
                continue;
            }
            $remaining = today()->diffInDays($x->ekim_valid_until, false);
            $status = 'sent';
            $error = null;
            try {
                Mail::raw("EKIM kendaraan {$x->nomor_polisi} ".($remaining < 0 ? 'telah kedaluwarsa' : "akan kedaluwarsa dalam $remaining hari")." pada {$x->ekim_valid_until}. Pengurus wajib melakukan inspeksi ulang dan memperbarui dokumen yang kedaluwarsa.", fn ($m) => $m->to($x->email_kontraktor)->subject("Notifikasi EKIM {$x->nomor_polisi}"));
            } catch (\Throwable $e) {
                $status = 'failed';
                $error = $e->getMessage();
            }
            $this->log($x, $remaining, $status, $error);
        }
        DB::table('system_settings')->upsert([['setting_key' => 'cron_last_run', 'setting_value' => now()->toDateTimeString(), 'updated_at' => now()]], ['setting_key'], ['setting_value', 'updated_at']);
        $this->info('Scheduler notifikasi selesai: '.$rows->count().' kandidat.');

        return self::SUCCESS;
    }

    private function log(object $x, int $remaining, string $status, ?string $error): void
    {
        DB::table('kim_notifications')->insert(['nomor_polisi' => $x->nomor_polisi, 'nama_transport' => $x->nama_transport, 'email_to' => $x->email_kontraktor, 'ekim_valid_until' => $x->ekim_valid_until, 'hari_tersisa' => $remaining, 'status' => $status, 'error_message' => $error, 'sent_at' => now()]);
    }
}
