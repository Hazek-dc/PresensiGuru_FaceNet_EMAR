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
        Schema::create('evaluation_matrices', function (Blueprint $table) {
            $table->id();
            $table->string('subject_id', 32)->index(); // S01 - S18
            $table->string('claimed_subject_id', 32)->index();
            $table->string('sample_type', 32)->default('BONA_FIDE'); // BONA_FIDE, ATTACK
            $table->string('session_type', 32)->default('TEST'); // ENROLLMENT (Session-E), TEST (Session-T)
            $table->integer('distance_cm')->default(30); // 30 cm fixed scenario
            $table->integer('lux_value')->default(300); // e.g. 310 Lux
            $table->float('scan_duration_sec')->default(8.0); // 8.0 seconds
            $table->integer('ear_blink_count')->default(0);
            $table->integer('mar_mouth_count')->default(0);
            $table->float('face_detected_pct')->default(100.0);
            $table->float('euclidean_distance')->nullable();
            $table->float('facenet_score')->nullable();
            $table->float('emar_score')->nullable();
            $table->string('pad_prediction', 32)->default('BONA_FIDE'); // BONA_FIDE, ATTACK
            $table->string('id_prediction', 32)->default('MATCH'); // MATCH, NON_MATCH
            $table->string('final_decision', 32)->default('ACCEPT'); // ACCEPT, REJECT
            $table->json('raw_metadata')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('evaluation_matrices');
    }
};
