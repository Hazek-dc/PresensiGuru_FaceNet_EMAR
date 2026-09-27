<?php

namespace Tests\Feature;

use Tests\TestCase;

class DistanceMeasurementTest extends TestCase
{
    public function test_can_get_current_distance_reading(): void
    {
        $response = $this->getJson('/api/distance/current');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'distance_cm',
                'condition',
                'condition_code',
                'condition_desc',
                'is_ideal',
                'benchmark',
                'source',
                'updated_at',
            ]);
    }

    public function test_can_update_distance_reading_via_api(): void
    {
        $payload = [
            'distance_cm' => 31.5,
            'source' => 'hardware_tof',
            'device' => 'VL53L0X Time-of-Flight Sensor',
        ];

        $response = $this->postJson('/api/distance/update', $payload);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'distance_cm' => 31.5,
                    'condition' => '30 cm (Dekat)',
                    'condition_code' => 'IDEAL_30',
                    'is_ideal' => false,
                    'benchmark' => 30,
                    'source' => 'hardware_tof',
                    'device' => 'VL53L0X Time-of-Flight Sensor',
                ],
            ]);

        $currentResponse = $this->getJson('/api/distance/current');
        $currentResponse->assertStatus(200)
            ->assertJson([
                'distance_cm' => 31.5,
                'condition' => '30 cm (Dekat)',
                'condition_code' => 'IDEAL_30',
                'is_ideal' => false,
            ]);
    }

    public function test_categorizes_distance_benchmarks_accurately(): void
    {
        // Rentang posisi Subbab 5.2: 30-40 Dekat, 45-55 Ideal, 60-70 Jauh (batas inklusif)
        foreach ([18.0, 29.9] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition', 'Terlalu Dekat')
                ->assertJsonPath('data.condition_code', 'TOO_CLOSE')
                ->assertJsonPath('data.is_ideal', false)
                ->assertJsonPath('data.benchmark', 30);
        }

        foreach ([30.0, 35.0, 40.0] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition', '30 cm (Dekat)')
                ->assertJsonPath('data.condition_code', 'IDEAL_30')
                ->assertJsonPath('data.is_ideal', false)
                ->assertJsonPath('data.benchmark', 30);
        }

        // 40 < d < 45 di luar rentang: belum siap, tingkat terdekat 45
        foreach ([40.1, 42.0, 44.9] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition_code', 'TOO_CLOSE')
                ->assertJsonPath('data.is_ideal', false)
                ->assertJsonPath('data.benchmark', 45);
        }

        foreach ([45.0, 50.0, 55.0] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition', '45 cm (Ideal)')
                ->assertJsonPath('data.condition_code', 'MID_45')
                ->assertJsonPath('data.is_ideal', true)
                ->assertJsonPath('data.benchmark', 45);
        }

        // 55 < d < 60 di luar rentang: belum siap, tingkat terdekat 60
        foreach ([55.1, 57.0, 59.9] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition_code', 'TOO_CLOSE')
                ->assertJsonPath('data.is_ideal', false)
                ->assertJsonPath('data.benchmark', 60);
        }

        foreach ([60.0, 65.0, 70.0] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition', '60 cm (Jauh)')
                ->assertJsonPath('data.condition_code', 'FAR_60')
                ->assertJsonPath('data.is_ideal', false)
                ->assertJsonPath('data.benchmark', 60);
        }

        foreach ([70.1, 95.0] as $cm) {
            $this->postJson('/api/distance/update', ['distance_cm' => $cm])
                ->assertJsonPath('data.condition', 'Terlalu Jauh')
                ->assertJsonPath('data.condition_code', 'TOO_FAR')
                ->assertJsonPath('data.is_ideal', false)
                ->assertJsonPath('data.benchmark', 60);
        }
    }
}
