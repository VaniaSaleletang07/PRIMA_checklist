<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsurePrimaAvailable
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || $user->status !== 'active') {
            return response()->json(['success' => false, 'message' => 'Akun tidak aktif.', 'data' => null], 401);
        }
        $maintenance = DB::table('system_settings')->where('setting_key', 'maintenance_mode')->value('setting_value') === '1';
        if ($maintenance && $user->role !== 'admin') {
            $message = DB::table('system_settings')->where('setting_key', 'maintenance_message')->value('setting_value') ?: 'Sistem sedang dalam pemeliharaan.';

            return response()->json(['success' => false, 'message' => $message, 'data' => null], 503);
        }

        return $next($request);
    }
}
