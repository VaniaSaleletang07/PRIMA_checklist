<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('prima:notifications')->dailyAt('06:00')->withoutOverlapping()->onOneServer();
Schedule::command('prima:retention')->dailyAt('02:00')->withoutOverlapping()->onOneServer();
