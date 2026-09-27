<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthAndRBACTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_admin_successful(): void
    {
        $admin = \App\Models\User::factory()->create([
            'password' => bcrypt('password123'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        $response = $this->post('/login', [
            'email' => $admin->email,
            'password' => 'password123',
        ]);

        $this->assertAuthenticatedAs($admin);
        $response->assertRedirect(route('dashboard', absolute: false));
        
        $this->assertDatabaseHas('activity_log', [
            'event' => 'login_success',
        ]);
    }

    public function test_wrong_credentials_rejected(): void
    {
        $user = \App\Models\User::factory()->create([
            'password' => bcrypt('password123'),
            'is_active' => true,
        ]);

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'wrongpassword',
        ]);

        $this->assertGuest();
        
        $this->assertDatabaseHas('activity_log', [
            'event' => 'login_failed',
        ]);
    }

    public function test_inactive_account_rejected(): void
    {
        $user = \App\Models\User::factory()->create([
            'password' => bcrypt('password123'),
            'is_active' => false,
        ]);

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $this->assertGuest();
        $response->assertSessionHasErrors('email'); // Generic error msg
        
        $this->assertDatabaseHas('activity_log', [
            'event' => 'login_failed_inactive',
        ]);
    }

    public function test_non_admin_cannot_access_admin_routes(): void
    {
        $teacher = \App\Models\User::factory()->create([
            'role' => 'teacher',
        ]);

        $response = $this->actingAs($teacher)->get('/admin/enroll');
        $response->assertStatus(403);
    }

    public function test_admin_can_access_admin_routes(): void
    {
        $admin = \App\Models\User::factory()->create([
            'role' => 'admin',
        ]);

        $response = $this->actingAs($admin)->get('/admin/enroll');
        $response->assertStatus(200);
    }
}
