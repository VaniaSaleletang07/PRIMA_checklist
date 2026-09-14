<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ImportLegacyMysql extends Command
{
    protected $signature = 'prima:import-legacy {--uploads= : Folder uploads/dokumen lama}';

    protected $description = 'Migrasikan seluruh data PRIMA dari MySQL lama ke PostgreSQL';

    public function handle(): int
    {
        if (! config('database.connections.legacy_mysql.database')) {
            $this->error('Isi LEGACY_DB_DATABASE dan kredensial legacy pada .env.');

            return self::FAILURE;
        }
        $tables = ['users', 'user_registrations', 'kendaraan', 'pengurus_kendaraan', 'formulir_checklist', 'checklist_items', 'dokumen_kendaraan', 'audit_log', 'digital_signature_log', 'system_settings', 'kim_notifications', 'dokumen_expire_notifications', 'ekim_notifikasi'];
        DB::statement('SET session_replication_role = replica');
        try {
            foreach ($tables as $table) {
                if (! Schema::connection('legacy_mysql')->hasTable($table) || ! Schema::hasTable($table)) {
                    $this->warn("Lewati $table (tidak ditemukan)");

                    continue;
                }
                $dest = Schema::getColumnListing($table);
                $total = 0;
                DB::connection('legacy_mysql')->table($table)->orderBy(Schema::connection('legacy_mysql')->hasColumn($table, 'id') ? 'id' : $dest[0])->chunk(250, function ($rows) use ($table, $dest, &$total) {
                    $data = [];
                    foreach ($rows as $row) {
                        $x = array_intersect_key((array) $row, array_flip($dest));
                        foreach ($x as $k => $v) {
                            if (is_string($v) && ($v === '0000-00-00' || str_starts_with($v, '0000-00-00 '))) {
                                $x[$k] = null;
                            }
                        }
                        if ($table === 'dokumen_kendaraan' && ! empty($x['file_path'])) {
                            $x['file_path'] = 'dokumen/'.basename(str_replace('\\', '/', $x['file_path']));
                        }
                        if ($table === 'system_settings' && ($x['setting_key'] ?? null) === 'smtp_password' && ! empty($x['setting_value'])) {
                            $x['setting_value'] = encrypt($x['setting_value']);
                        }
                        $data[] = $x;
                    }
                    if ($data) {
                        $key = array_key_exists('id', $data[0]) ? ['id'] : [array_key_first($data[0])];
                        DB::table($table)->upsert($data, $key, array_values(array_diff(array_keys($data[0]), $key)));
                        $total += count($data);
                    }
                });
                $this->info("$table: $total baris");
                if (Schema::hasColumn($table, 'id')) {
                    DB::statement("SELECT setval(pg_get_serial_sequence('$table','id'), COALESCE((SELECT MAX(id) FROM $table), 1), true)");
                }
            }
            $this->repairNullableRelations();
            $this->assertRequiredRelations();
        } finally {
            DB::statement('SET session_replication_role = DEFAULT');
        }
        if ($source = $this->option('uploads')) {
            if (is_dir($source)) {
                foreach (glob(rtrim($source, '/\\').'/*') ?: [] as $file) {
                    if (is_file($file)) {
                        Storage::disk('private')->put('dokumen/'.basename($file), file_get_contents($file));
                    }
                }
                $this->info('Dokumen lama disalin ke private storage.');
            }
        }
        $this->info('Migrasi MySQL ke PostgreSQL selesai. Jalankan verifikasi jumlah data dan UAT sebelum cutover.');

        return self::SUCCESS;
    }

    private function repairNullableRelations(): void
    {
        $relations = [
            ['user_registrations', 'reviewed_by', 'users'],
            ['kendaraan', 'created_by', 'users'],
            ['formulir_checklist', 'created_by', 'users'],
            ['formulir_checklist', 'ttd_hsse_user_id', 'users'],
            ['formulir_checklist', 'ttd_manajer_user_id', 'users'],
            ['dokumen_kendaraan', 'uploaded_by', 'users'],
            ['dokumen_kendaraan', 'reviewed_by', 'users'],
            ['audit_log', 'formulir_id', 'formulir_checklist'],
            ['digital_signature_log', 'user_id', 'users'],
            ['kim_notifications', 'sent_by', 'users'],
            ['ekim_notifikasi', 'formulir_id', 'formulir_checklist'],
        ];
        foreach ($relations as [$table, $column, $parent]) {
            $fixed = DB::table($table)->whereNotNull($column)->whereNotExists(fn ($query) => $query->selectRaw('1')->from($parent)->whereColumn("$parent.id", "$table.$column"))->update([$column => null]);
            if ($fixed > 0) {
                $this->warn("$table.$column: $fixed referensi yatim dipertahankan sebagai NULL");
            }
        }
    }

    private function assertRequiredRelations(): void
    {
        $relations = [
            ['pengurus_kendaraan', 'user_id', 'users'],
            ['checklist_items', 'formulir_id', 'formulir_checklist'],
            ['digital_signature_log', 'formulir_id', 'formulir_checklist'],
            ['ekim_notifikasi', 'user_id', 'users'],
        ];
        foreach ($relations as [$table, $column, $parent]) {
            $orphans = DB::table($table)->whereNotExists(fn ($query) => $query->selectRaw('1')->from($parent)->whereColumn("$parent.id", "$table.$column"))->count();
            if ($orphans > 0) {
                throw new \RuntimeException("Migrasi dibatalkan: $orphans relasi wajib $table.$column tidak valid.");
            }
        }
    }
}
