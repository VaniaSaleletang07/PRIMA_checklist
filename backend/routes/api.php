<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\PrimaController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/auth/captcha-config', [PrimaController::class, 'captchaConfig'])->middleware('throttle:60,1');
    Route::post('/auth/login', [PrimaController::class, 'login'])->middleware('throttle:login');
    Route::post('/auth/register', [PrimaController::class, 'register'])->middleware('throttle:6,1');
    Route::get('/verify/{value}', [PrimaController::class, 'verify'])->middleware('throttle:60,1');
    Route::post('/scheduler/run/{secret}', [AdminController::class, 'runScheduler'])->middleware('throttle:3,1');

    Route::middleware(['auth:sanctum', 'prima.session', 'prima.available'])->group(function () {
        Route::post('/auth/logout', [PrimaController::class, 'logout']);
        Route::get('/auth/me', [PrimaController::class, 'me']);
        Route::get('/dashboard', [PrimaController::class, 'dashboard']);
        Route::get('/vehicles', [PrimaController::class, 'vehicles']);
        Route::get('/checklists/stats', [PrimaController::class, 'checklistStats']);
        Route::get('/checklists/template', [PrimaController::class, 'template']);
        Route::get('/checklists', [PrimaController::class, 'checklists']);
        Route::post('/checklists', [PrimaController::class, 'saveChecklist']);
        Route::get('/checklists/{id}', [PrimaController::class, 'checklist'])->whereNumber('id');
        Route::put('/checklists/{id}', function (Request $r, int $id) {
            $r->merge(['id' => $id]);

            return app(PrimaController::class)->saveChecklist($r);
        })->whereNumber('id');
        Route::delete('/checklists/{id}', [PrimaController::class, 'deleteChecklist'])->whereNumber('id');
        Route::post('/checklists/signature', [PrimaController::class, 'signature']);
        Route::post('/checklists/workflow', [PrimaController::class, 'workflow']);

        Route::get('/users', [AdminController::class, 'users']);
        Route::put('/users/{id}', [AdminController::class, 'updateUser']);
        Route::delete('/users/{id}', [AdminController::class, 'deleteUser']);
        Route::patch('/users/{id}/status', [AdminController::class, 'toggleUser']);
        Route::post('/users/{id}/reset-password', [AdminController::class, 'resetPassword']);
        Route::get('/registrations', [AdminController::class, 'registrations']);
        Route::post('/registrations/{id}/review', [AdminController::class, 'reviewRegistration']);
        Route::get('/documents', [AdminController::class, 'documents']);
        Route::post('/documents', [AdminController::class, 'uploadDocument']);
        Route::delete('/documents/{id}', [AdminController::class, 'deleteDocument']);
        Route::post('/documents/{id}/review', [AdminController::class, 'reviewDocument']);
        Route::get('/documents/{id}/download', [AdminController::class, 'downloadDocument']);
        Route::get('/audits', [AdminController::class, 'audits']);
        Route::get('/alerts', [AdminController::class, 'alerts']);
        Route::get('/settings', [AdminController::class, 'settings']);
        Route::put('/settings', [AdminController::class, 'saveSettings']);
        Route::post('/settings/backup', [AdminController::class, 'backup']);
        Route::post('/settings/audit-retention', [AdminController::class, 'retention']);
        Route::get('/notifications', [AdminController::class, 'notifications']);
        Route::put('/notifications', [AdminController::class, 'saveNotifications']);
        Route::post('/notifications/regenerate-cron', [AdminController::class, 'regenerateCron']);
        Route::get('/my-vehicles', [AdminController::class, 'myVehicles']);
        Route::post('/my-vehicles', [AdminController::class, 'registerMyVehicle']);
        Route::get('/user-vehicles', [AdminController::class, 'userVehicles']);
        Route::post('/user-vehicles', [AdminController::class, 'registerUserVehicle']);
        Route::post('/vehicles/manage', [AdminController::class, 'saveVehicle']);
        Route::get('/export/checklists', [AdminController::class, 'export']);
    });
});
