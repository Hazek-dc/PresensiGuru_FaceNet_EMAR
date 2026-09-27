<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('user:debug', function () {
    $users = \App\Models\User::all();
    foreach ($users as $user) {
        $this->info("User ID: {$user->id} | Email: {$user->email} | Role: {$user->role} | is_active: " . ($user->is_active ? '1' : '0') . " | verified: " . ($user->email_verified_at ? 'YES' : 'NO'));
        $this->line("  Matches 'Presensi2026!': " . (\Illuminate\Support\Facades\Hash::check('Presensi2026!', $user->password) ? 'YES' : 'NO'));
        $this->line("  Matches 'password123': " . (\Illuminate\Support\Facades\Hash::check('password123', $user->password) ? 'YES' : 'NO'));
        $this->line("  Matches 'password': " . (\Illuminate\Support\Facades\Hash::check('password', $user->password) ? 'YES' : 'NO'));
        $attempt = \Illuminate\Support\Facades\Auth::attempt(['email' => $user->email, 'password' => 'Presensi2026!']);
        $this->line("  Auth::attempt('Presensi2026!'): " . ($attempt ? 'SUCCESS' : 'FAILED'));
    }
});

Artisan::command('user:set-all-passwords {password=Presensi2026!}', function (string $password) {
    foreach (\App\Models\User::all() as $user) {
        $user->password = \Illuminate\Support\Facades\Hash::make($password);
        $user->is_active = true;
        $user->email_verified_at = now();
        $user->save();
        $this->info("Updated {$user->email} (Role: {$user->role}) with password '{$password}' and verified=true");
    }
});

Artisan::command('user:test-login {email=admin@presensi.test} {password=Presensi2026!}', function (string $email, string $password) {
    $this->info("Testing login for {$email} with {$password}...");
    $success = \Illuminate\Support\Facades\Auth::attempt(['email' => $email, 'password' => $password]);
    if ($success) {
        $this->info("Auth::attempt SUCCESS! Logged in as: " . \Illuminate\Support\Facades\Auth::user()->name);
    } else {
        $this->error("Auth::attempt FAILED!");
    }
});
