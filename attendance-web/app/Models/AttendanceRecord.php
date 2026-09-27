<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceRecord extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected $casts = [
        'metadata' => 'array',
        'verified_at' => 'datetime',
        'hidden_from_dashboard_at' => 'datetime',
        'is_test_data' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function hiddenBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'hidden_by');
    }

    public function scopeVisibleOnDashboard($query)
    {
        return $query->whereNull('hidden_from_dashboard_at');
    }

    public function getSubjectIdAttribute(): ?string
    {
        return $this->subject_reference ?? $this->user?->embedding_id;
    }

    public function getFinalDecisionAttribute(): string
    {
        return $this->metadata['final_decision'] ?? ($this->status === 'failed' ? 'REJECT' : 'ACCEPT');
    }

    public function getTypeAttribute(): string
    {
        return strtoupper($this->status ?? '');
    }

    public function getReasonAttribute(): ?string
    {
        return $this->metadata['category'] ?? $this->decision_reason;
    }

    public function getDateAttribute()
    {
        return $this->created_at;
    }
}
