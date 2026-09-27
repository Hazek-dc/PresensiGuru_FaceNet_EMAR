<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

class LuxMeasurementTest extends TestCase
{
    protected string $storageFile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->storageFile = storage_path('app/lux_reading.json');
    }

    public function test_tanpa_bacaan_tidak_ada_preset_300_lux(): void
    {
        // Dulu tanpa berkas bacaan endpoint mengarang 300 lux "default" dengan
        // updated_at = sekarang, sehingga tampak seperti bacaan segar.
        $this->assertFileDoesNotExist($this->storageFile);

        $this->getJson('/api/lux/current')
            ->assertOk()
            ->assertJson([
                'success' => true,
                'lux' => null,
                'condition' => null,
                'condition_code' => null,
                'is_optimal' => null,
                'source' => 'none',
                'device' => null,
                'updated_at' => null,
                'seconds_ago' => null,
                'is_measured' => false,
                'not_measured_reason' => 'no_reading',
            ]);
    }

    public function test_can_update_lux_reading_via_api(): void
    {
        $payload = [
            'lux' => 325.5,
            'source' => 'hardware_luxmeter',
            'device' => 'UNI-T UT383-BT (COM3)',
        ];

        $response = $this->postJson('/api/lux/update', $payload);

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'lux' => 325.5,
                    'condition' => 'Terang',
                    'condition_code' => 'HIGH',
                    'is_optimal' => false,
                    'source' => 'hardware_luxmeter',
                    'device' => 'UNI-T UT383-BT (COM3)',
                ],
            ]);

        // Bacaan baru dari luxmeter adalah hasil ukur segar.
        $this->getJson('/api/lux/current')
            ->assertOk()
            ->assertJson([
                'lux' => 325.5,
                'condition' => 'Terang',
                'condition_code' => 'HIGH',
                'is_optimal' => false,
                'source' => 'hardware_luxmeter',
                'is_stale' => false,
                'is_measured' => true,
                'not_measured_reason' => null,
            ])
            ->assertJsonPath('max_age_s', fn ($v) => (float) $v === 10.0)
            ->assertJsonPath('seconds_ago', fn ($v) => is_numeric($v) && $v >= 0 && $v <= 3);
    }

    public function test_bacaan_lebih_tua_dari_batas_umur_ditandai_basi(): void
    {
        $this->postJson('/api/lux/update', ['lux' => 180, 'source' => 'hardware_serial'])->assertOk();

        // updated_at disimpan per detik, jadi umur terbaca bisa lebih 1 s.
        $this->travel(9)->seconds();
        $this->getJson('/api/lux/current')
            ->assertJsonPath('is_stale', false)
            ->assertJsonPath('is_measured', true);

        $this->travel(3)->seconds();
        $response = $this->getJson('/api/lux/current')
            ->assertOk()
            ->assertJsonPath('lux', fn ($v) => (float) $v === 180.0)
            ->assertJsonPath('is_stale', true)
            ->assertJsonPath('is_measured', false)
            ->assertJsonPath('not_measured_reason', 'stale');

        // updated_at dan umur adalah milik bacaan asli, bukan waktu permintaan.
        $this->assertEqualsWithDelta(12, $response->json('seconds_ago'), 1);
        $this->assertNotNull($response->json('updated_at'));
    }

    public function test_sidecar_dari_skrip_dengan_offset_zona_waktu(): void
    {
        // measure_lux.py menulis updated_at dengan format strftime %z (+0700).
        File::put($this->storageFile, json_encode([
            'lux' => 95.0,
            'source' => 'hardware_serial',
            'device' => 'Serial Luxometer (COM3)',
            'raw_reading' => 95.0,
            'updated_at' => now()->subSeconds(3)->format('Y-m-d\TH:i:sO'),
        ]));

        $this->getJson('/api/lux/current')
            ->assertJsonPath('condition_code', 'LOW')
            ->assertJsonPath('is_measured', true)
            ->assertJsonPath('seconds_ago', fn ($v) => $v >= 2 && $v <= 5);
    }

    public function test_preset_dan_fallback_bukan_hasil_ukur(): void
    {
        foreach (['manual_preset', 'manual_tune', 'research_preset', 'default'] as $source) {
            $this->postJson('/api/lux/update', ['lux' => 300, 'source' => $source])->assertOk();
            $this->getJson('/api/lux/current')
                ->assertJsonPath('is_stale', false)
                ->assertJsonPath('is_measured', false)
                ->assertJsonPath('not_measured_reason', 'not_a_measurement');
        }

        // Skrip menulis 300 lux dengan raw_reading NO_DATA_FALLBACK saat sensor diam.
        $this->postJson('/api/lux/update', [
            'lux' => 300, 'source' => 'hardware_serial', 'raw_reading' => 'NO_DATA_FALLBACK',
        ])->assertOk();
        $this->getJson('/api/lux/current')
            ->assertJsonPath('is_measured', false)
            ->assertJsonPath('not_measured_reason', 'sensor_no_data');
    }

    public function test_cap_waktu_rusak_tidak_dianggap_segar(): void
    {
        File::put($this->storageFile, json_encode([
            'lux' => 250.0, 'source' => 'hardware_serial', 'updated_at' => 'bukan-tanggal',
        ]));

        $this->getJson('/api/lux/current')
            ->assertJsonPath('seconds_ago', null)
            ->assertJsonPath('is_stale', true)
            ->assertJsonPath('is_measured', false);
    }

    public function test_categorizes_lux_ranges_accurately(): void
    {
        // Subbab 5.2: redup < 100, standar 100 - 300 (inklusif), terang > 300
        foreach ([65.0, 99.9] as $lux) {
            $this->postJson('/api/lux/update', ['lux' => $lux])
                ->assertJsonPath('data.condition', 'Redup')
                ->assertJsonPath('data.condition_code', 'LOW')
                ->assertJsonPath('data.is_optimal', false);
        }

        foreach ([100.0, 280.0, 300.0] as $lux) {
            $this->postJson('/api/lux/update', ['lux' => $lux])
                ->assertJsonPath('data.condition', 'Standar')
                ->assertJsonPath('data.condition_code', 'NORMAL')
                ->assertJsonPath('data.is_optimal', true);
        }

        foreach ([300.1, 500.0, 750.0] as $lux) {
            $this->postJson('/api/lux/update', ['lux' => $lux])
                ->assertJsonPath('data.condition', 'Terang')
                ->assertJsonPath('data.condition_code', 'HIGH')
                ->assertJsonPath('data.is_optimal', false);
        }
    }
}
