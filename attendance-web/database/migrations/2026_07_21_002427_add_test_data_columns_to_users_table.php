<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->integer('age_at_test')->nullable();
            $table->date('test_reference_date')->nullable();
            $table->boolean('is_test_data')->default(false);
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            $table->boolean('is_test_data')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['age_at_test', 'test_reference_date', 'is_test_data']);
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropColumn('is_test_data');
        });
    }
};
