<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class AdminQalwaniSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $email = env('ADMIN_TEST_EMAIL', 'admin@example.com');
        $password = env('ADMIN_TEST_PASSWORD', 'password123');

        $user = \App\Models\User::updateOrCreate(
            ['email' => $email],
            [
                'name' => 'Qalwani Anugerah',
                'password' => \Illuminate\Support\Facades\Hash::make($password),
                'role' => 'admin',
                // Kunci yang dipakai akun live; enrollment web mengirim embedding_id ini
                // apa adanya sebagai subject_id ke mesin.
                'embedding_id' => 'emb_TEST-QALWANI-001',
                'age_at_test' => 21,
                'test_reference_date' => '2026-07-21',
                'is_test_data' => true,
                'email_verified_at' => now(),
            ]
        );

        // Pastikan akun utama Qalwani Anugerah [emb_1] terdaftar sebagai admin
        $mainAccount = \App\Models\User::where('embedding_id', 'emb_1')
            ->orWhere('email', 'kejugaming@gmail.com')
            ->first();
        if ($mainAccount) {
            $mainAccount->update([
                'role' => 'admin',
                'embedding_id' => 'emb_1',
                'is_active' => true,
            ]);
        }

        if (function_exists('activity')) {
            activity()
                ->performedOn($user)
                ->event('created_or_updated')
                ->log('Admin test account Qalwani Anugerah seeded.');
        }
    }
}
