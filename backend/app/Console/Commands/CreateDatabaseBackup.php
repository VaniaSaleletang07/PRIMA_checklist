<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

class CreateDatabaseBackup extends Command
{
    protected $signature = 'prima:database-backup {filename}';

    protected $description = 'Buat backup PostgreSQL berformat custom ke private storage';

    public function handle(): int
    {
        $filename = basename((string) $this->argument('filename'));
        if (! preg_match('/^prima-db-[A-Za-z0-9-]+\.dump$/', $filename)) {
            $this->error('Nama file backup tidak valid.');

            return self::FAILURE;
        }

        $directory = storage_path('app/private/backups');
        File::ensureDirectoryExists($directory, 0750);
        $path = $directory.DIRECTORY_SEPARATOR.$filename;
        $database = config('database.connections.pgsql');
        $passFile = $directory.DIRECTORY_SEPARATOR.'.pgpass-'.bin2hex(random_bytes(8));
        $escape = fn ($value) => str_replace(['\\', ':'], ['\\\\', '\\:'], (string) $value);
        file_put_contents($passFile, implode(':', array_map($escape, [$database['host'], $database['port'], $database['database'], $database['username'], $database['password']])).PHP_EOL);
        chmod($passFile, 0600);
        $connectionEscape = fn ($value) => str_replace(['\\', "'"], ['\\\\', "\\'"], (string) $value);
        $connection = "host='".$connectionEscape($database['host'])."' port='".$connectionEscape($database['port'])."' dbname='".$connectionEscape($database['database'])."' user='".$connectionEscape($database['username'])."' passfile='".$connectionEscape(str_replace('\\', '/', $passFile))."'";
        $process = new Process([
            config('prima.pg_dump_binary', 'pg_dump'),
            '--format=custom',
            '--no-owner',
            '--no-privileges',
            '--exclude-table-data=public.personal_access_tokens',
            '--exclude-table-data=public.sessions',
            '--exclude-table-data=public.cache',
            '--exclude-table-data=public.cache_locks',
            '--exclude-table-data=public.jobs',
            '--exclude-table-data=public.failed_jobs',
            '--exclude-table-data=public.job_batches',
            '--exclude-table-data=public.password_reset_tokens',
            '--no-password',
            '--file='.$path,
            '--dbname='.$connection,
        ]);
        $process->setTimeout(300);
        try {
            $process->run();
        } finally {
            @unlink($passFile);
        }

        if (! $process->isSuccessful()) {
            @unlink($path);
            $this->error(trim($process->getErrorOutput()) ?: 'pg_dump gagal tanpa pesan tambahan.');

            return self::FAILURE;
        }

        file_put_contents($path.'.sha256', hash_file('sha256', $path), LOCK_EX);

        $this->info($path);

        return self::SUCCESS;
    }
}
