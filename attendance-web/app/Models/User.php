<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Activitylog\LogOptions;

#[Fillable(['name', 'email', 'password', 'role', 'position', 'subjects', 'embedding_id', 'department', 'is_active', 'status_presensi', 'last_presensi_at', 'age_at_test', 'test_reference_date', 'is_test_data'])]
#[Hidden(['password', 'remember_token', 'avatar_path'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, SoftDeletes, LogsActivity;

    /** Alamat foto profil (rute admin), dengan penanda versi agar foto baru tidak tertahan cache. */
    protected $appends = ['avatar_url'];

    public function getAvatarUrlAttribute(): ?string
    {
        // Lewat attributes: kueri yang hanya memilih sebagian kolom tidak membawa avatar_path.
        $path = $this->attributes['avatar_path'] ?? null;
        if (! $path || ! $this->getKey()) {
            return null;
        }

        return route('admin.teachers.avatar', ['teacher' => $this->getKey(), 'v' => substr(md5($path), 0, 8)]);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logFillable()
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs();
    }

    /**
     * Alias for embedding_id (e.g. S01, S02)
     */
    public function getSubjectIdAttribute(): ?string
    {
        return $this->embedding_id;
    }

    /**
     * Relationship to dispensations (izin and sakit attendance records)
     */
    public function dispensations()
    {
        return $this->hasMany(AttendanceRecord::class, 'user_id')->whereIn('status', ['izin', 'sakit']);
    }

    /**
     * Relationship to all attendance records
     */
    public function attendanceRecords()
    {
        return $this->hasMany(AttendanceRecord::class, 'user_id');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_presensi_at' => 'datetime',
            'subjects' => 'array',
            'password' => 'hashed',
        ];
    }
}
