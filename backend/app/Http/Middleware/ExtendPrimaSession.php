<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class ExtendPrimaSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $minutes = max(15, min(480, (int) (DB::table('system_settings')->where('setting_key', 'session_timeout_minutes')->value('setting_value') ?? 60)));
            $token->forceFill(['expires_at' => now()->addMinutes($minutes)])->save();
        }

        return $next($request);
    }
}
