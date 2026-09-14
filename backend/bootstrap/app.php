<?php

use App\Http\Middleware\EnsurePrimaAvailable;
use App\Http\Middleware\ExtendPrimaSession;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Backend hanya dapat diakses lewat reverse proxy nginx di network Docker
        // (tidak ada port yang dipublish), sehingga '*' aman di sini. Tanpa ini,
        // seluruh request terlihat berasal dari IP container nginx sehingga
        // throttle:login menjadi rate limit global, dan HTTPS tidak terdeteksi.
        $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_FOR
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT
            | Request::HEADER_X_FORWARDED_PROTO);

        $middleware->append(SecurityHeaders::class);
        $middleware->alias([
            'prima.available' => EnsurePrimaAvailable::class,
            'prima.session' => ExtendPrimaSession::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
