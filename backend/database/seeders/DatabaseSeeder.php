<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        User::firstOrCreate(
            ['username' => env('PRIMA_ADMIN_USERNAME', 'admin')],
            [
                'full_name' => 'Administrator',
                'email' => env('PRIMA_ADMIN_EMAIL', 'admin@prima.local'),
                'password' => Hash::make(env('PRIMA_ADMIN_PASSWORD', 'ChangeMe-Immediately!')),
                'role' => 'admin',
                'status' => 'active',
            ]
        );
    }
}
