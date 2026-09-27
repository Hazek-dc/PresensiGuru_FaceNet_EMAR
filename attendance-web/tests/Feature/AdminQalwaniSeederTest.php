<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminQalwaniSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_creates_admin_qalwani_idempotently(): void
    {
        putenv('ADMIN_TEST_EMAIL=testadmin@example.com');
        putenv('ADMIN_TEST_PASSWORD=securepass123');
        $_ENV['ADMIN_TEST_EMAIL'] = 'testadmin@example.com';
        $_ENV['ADMIN_TEST_PASSWORD'] = 'securepass123';
        $_SERVER['ADMIN_TEST_EMAIL'] = 'testadmin@example.com';
        $_SERVER['ADMIN_TEST_PASSWORD'] = 'securepass123';

        $this->seed(\Database\Seeders\AdminQalwaniSeeder::class);

        $this->assertDatabaseHas('users', [
            'email' => 'testadmin@example.com',
            'name' => 'Qalwani Anugerah',
            'role' => 'admin',
            'embedding_id' => 'emb_TEST-QALWANI-001',
            'age_at_test' => 21,
            'test_reference_date' => '2026-07-21',
            'is_test_data' => true,
        ]);

        $user = \App\Models\User::where('email', 'testadmin@example.com')->first();
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('securepass123', $user->password));

        // Test idempotency
        $this->seed(\Database\Seeders\AdminQalwaniSeeder::class);
        $this->assertDatabaseCount('users', 1);
    }
}
