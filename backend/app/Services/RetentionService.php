<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class RetentionService
{
    public function apply(): array
    {
        return [
            'audit_deleted' => $this->pruneAuditLogs(),
            'backups_deleted' => $this->pruneBackups(),
        ];
    }

    public function pruneAuditLogs(): int
    {
        $days = max(90, min(3650, (int) $this->setting('audit_retention_days', 365)));

        return DB::table('audit_log')->where('created_at', '<', now()->subDays($days))->delete();
    }

    public function pruneBackups(): int
    {
        $days = max(7, min(365, (int) $this->setting('backup_retention_days', 30)));
        $disk = Storage::disk('local');
        $deleted = 0;
        foreach ($disk->files('backups') as $file) {
            if (! str_ends_with($file, '.dump') && ! str_ends_with($file, '.json.gz')) {
                continue;
            }
            if ($disk->lastModified($file) >= now()->subDays($days)->timestamp) {
                continue;
            }
            if ($disk->delete($file)) {
                $deleted++;
            }
            $disk->delete($file.'.sha256');
        }

        return $deleted;
    }

    private function setting(string $key, mixed $default): mixed
    {
        return DB::table('system_settings')->where('setting_key', $key)->value('setting_value') ?? $default;
    }
}
