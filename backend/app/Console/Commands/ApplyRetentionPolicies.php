<?php

namespace App\Console\Commands;

use App\Services\RetentionService;
use Illuminate\Console\Command;

class ApplyRetentionPolicies extends Command
{
    protected $signature = 'prima:retention';

    protected $description = 'Terapkan retensi audit log dan backup PRIMA';

    public function handle(RetentionService $retention): int
    {
        $result = $retention->apply();
        $this->info("Retensi selesai: {$result['audit_deleted']} audit dan {$result['backups_deleted']} backup dihapus.");

        return self::SUCCESS;
    }
}
