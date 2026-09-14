<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\Process;

class RestoreDatabaseBackup extends Command
{
    protected $signature = 'prima:database-restore {filename : Nama file dalam private/backups} {--database= : Database tujuan} {--force : Konfirmasi operasi destruktif}';

    protected $description = 'Pulihkan backup PostgreSQL atau backup portabel PRIMA';

    public function handle(): int
    {
        if (! $this->option('force')) {
            $this->error('Restore membuang data pada database tujuan. Jalankan kembali dengan --force.');

            return self::FAILURE;
        }

        $filename = basename((string) $this->argument('filename'));
        if ($filename !== $this->argument('filename') || (! str_ends_with($filename, '.dump') && ! str_ends_with($filename, '.json.gz'))) {
            $this->error('Nama file backup tidak valid.');

            return self::FAILURE;
        }
        $disk = Storage::disk('local');
        $relative = 'backups/'.$filename;
        if (! $disk->exists($relative)) {
            $this->error('File backup tidak ditemukan.');

            return self::FAILURE;
        }
        $path = $disk->path($relative);
        if (! $disk->exists($relative.'.sha256')) {
            $this->error('Checksum backup tidak ditemukan. Restore dibatalkan.');

            return self::FAILURE;
        }
        $expected = trim($disk->get($relative.'.sha256'));
        if (! hash_equals($expected, hash_file('sha256', $path))) {
            $this->error('Checksum backup tidak cocok. Restore dibatalkan.');

            return self::FAILURE;
        }

        $database = (string) ($this->option('database') ?: config('database.connections.pgsql.database'));
        try {
            if (str_ends_with($filename, '.dump')) {
                $this->restorePostgres($path, $database);
            } else {
                $this->restorePortable($path, $database);
            }
        } catch (\Throwable $e) {
            $this->error('Restore gagal: '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info("Restore ke database $database berhasil dan checksum telah diverifikasi.");

        return self::SUCCESS;
    }

    private function restorePostgres(string $path, string $database): void
    {
        $config = config('database.connections.pgsql');
        $process = new Process([
            config('prima.pg_restore_binary', 'pg_restore'),
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-privileges',
            '--exit-on-error',
            '--host='.$config['host'],
            '--port='.(string) $config['port'],
            '--username='.$config['username'],
            '--dbname='.$database,
            $path,
        ], null, ['PGPASSWORD' => $config['password']]);
        $process->setTimeout(600);
        $process->run();
        if (! $process->isSuccessful()) {
            throw new RuntimeException(trim($process->getErrorOutput()) ?: 'pg_restore gagal tanpa pesan tambahan.');
        }
    }

    private function restorePortable(string $path, string $database): void
    {
        $json = gzdecode(file_get_contents($path));
        if ($json === false) {
            throw new RuntimeException('Backup portabel tidak dapat didekompresi.');
        }
        $payload = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        if (($payload['format'] ?? null) !== 'prima-portable-backup-v1' || ! is_array($payload['tables'] ?? null)) {
            throw new RuntimeException('Format backup portabel tidak dikenali.');
        }

        config(['database.connections.pgsql.database' => $database]);
        DB::purge('pgsql');
        $connection = DB::connection('pgsql');
        $available = collect($connection->select("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))->pluck('tablename')->all();
        $tables = array_values(array_intersect(array_keys($payload['tables']), $available));
        if ($tables === []) {
            throw new RuntimeException('Schema tujuan belum dimigrasikan atau tidak cocok.');
        }

        $quote = fn (string $name) => '"'.str_replace('"', '""', $name).'"';
        $connection->transaction(function () use ($connection, $payload, $tables, $quote): void {
            $connection->statement('SET LOCAL session_replication_role = replica');
            $connection->statement('TRUNCATE TABLE '.implode(', ', array_map($quote, $tables)).' RESTART IDENTITY CASCADE');
            foreach ($tables as $table) {
                foreach (array_chunk($payload['tables'][$table], 250) as $chunk) {
                    if ($chunk !== []) {
                        $connection->table($table)->insert($chunk);
                    }
                }
            }
        });
        foreach ($tables as $table) {
            $hasId = $connection->selectOne('SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', ['public', $table, 'id']);
            if (! $hasId) {
                continue;
            }
            $sequence = $connection->selectOne("SELECT pg_get_serial_sequence(?, 'id') AS name", [$table])->name ?? null;
            if ($sequence) {
                $quoted = $quote($table);
                $connection->statement("SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE((SELECT MAX(id) FROM $quoted), 1), (SELECT COUNT(*) > 0 FROM $quoted))", [$table]);
            }
        }
    }
}
