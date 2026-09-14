<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TurnstileVerifier
{
    public function enabled(): bool
    {
        return (bool) config('services.turnstile.enabled', true);
    }

    public function verify(?string $token, ?string $ipAddress = null): bool
    {
        if (! $this->enabled()) {
            return true;
        }

        $secret = (string) config('services.turnstile.secret_key');
        if ($secret === '' || blank($token)) {
            return false;
        }

        try {
            $response = Http::asForm()
                ->acceptJson()
                ->timeout((int) config('services.turnstile.timeout', 6))
                ->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', array_filter([
                    'secret' => $secret,
                    'response' => $token,
                    'remoteip' => $ipAddress,
                ]));

            if (! $response->successful() || ! $response->json('success', false)) {
                Log::warning('Turnstile verification rejected', [
                    'status' => $response->status(),
                    'errors' => $response->json('error-codes', []),
                    'ip_address' => $ipAddress,
                ]);

                return false;
            }

            if (app()->environment('production')) {
                $expectedAction = (string) config('services.turnstile.expected_action', 'login');
                $action = (string) $response->json('action', '');
                if ($expectedAction !== '' && $action !== $expectedAction) {
                    return false;
                }

                $allowedHostnames = config('services.turnstile.allowed_hostnames', []);
                $hostname = (string) $response->json('hostname', '');
                if ($allowedHostnames !== [] && ! in_array($hostname, $allowedHostnames, true)) {
                    return false;
                }
            }

            return true;
        } catch (\Throwable $exception) {
            Log::error('Turnstile verification unavailable', [
                'message' => $exception->getMessage(),
                'ip_address' => $ipAddress,
            ]);

            return false;
        }
    }
}
