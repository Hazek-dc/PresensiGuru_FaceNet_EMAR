<?php

use App\Services\LightingModel;

it('mengklasifikasi tabel uji PRD LX01-LX07', function (float $lux, string $category, string $status) {
    $c = LightingModel::classify($lux);
    expect($c['category'])->toBe($category)->and($c['status'])->toBe($status);
})->with([
    'LX01 50' => [50, 'LOW', 'WARNING'],
    'LX02 100' => [100, 'STANDARD', 'VALID'],
    'LX03 150' => [150, 'STANDARD', 'VALID'],
    'LX04 200' => [200, 'OPTIMAL', 'READY'],
    'LX05 250' => [250, 'OPTIMAL', 'READY'],
    // Tabel PRD menulis VALID, tetapi aturan kodenya (200 <= lux <= 300) memberi READY.
    'LX06 300' => [300, 'OPTIMAL', 'READY'],
    'LX07 500' => [500, 'HIGH', 'MONITOR'],
    'tepi 99,9' => [99.9, 'LOW', 'WARNING'],
    'tepi 199,9' => [199.9, 'STANDARD', 'VALID'],
    'tepi 300,1' => [300.1, 'HIGH', 'MONITOR'],
]);

it('kategori naskah sama dengan kategori_lux di parameter_penelitian.py', function (float $lux, string $kategori) {
    expect(LightingModel::classify($lux)['kategori_naskah'])->toBe($kategori);
})->with([[99.9, 'redup'], [100, 'normal'], [300, 'normal'], [300.1, 'terang']]);

it('lux tidak terukur tidak diberi kategori', function () {
    expect(LightingModel::classify(null))->toMatchArray([
        'lux' => null, 'category' => null, 'status' => null, 'kategori_naskah' => null,
    ]);
});

it('fit memulihkan model sintetis dan estimasinya', function () {
    // lux = 10^(3 + 1.5 * log10(luma/255))
    $luma = fn (float $lux) => 255 * 10 ** ((log10($lux) - 3) / 1.5);
    $points = array_map(fn ($lux) => ['lux' => $lux, 'luma' => $luma($lux)], [50, 200, 600]);

    $fit = LightingModel::fit($points);
    expect($fit['ok'])->toBeTrue()
        ->and($fit['a'])->toEqualWithDelta(3.0, 1e-6)
        ->and($fit['b'])->toEqualWithDelta(1.5, 1e-6)
        ->and($fit['max_rel_error'])->toBeLessThan(1e-6);
    expect(LightingModel::estimate($luma(250), $fit['a'], $fit['b']))->toEqualWithDelta(250.0, 0.1);
    expect(LightingModel::estimate(null, $fit['a'], $fit['b']))->toBeNull();
});

it('fit menolak data yang tidak sah', function (array $points, string $reasonPart) {
    $fit = LightingModel::fit($points);
    expect($fit['ok'])->toBeFalse()->and($fit['reason'])->toContain($reasonPart);
})->with([
    'kurang dari 3 titik' => [[['lux' => 50, 'luma' => 40], ['lux' => 300, 'luma' => 120]], 'minimal 3'],
    'rentang sempit' => [[['lux' => 200, 'luma' => 90], ['lux' => 250, 'luma' => 100], ['lux' => 300, 'luma' => 110]], 'terlalu sempit'],
    'eksposur otomatis' => [[['lux' => 50, 'luma' => 120], ['lux' => 200, 'luma' => 118], ['lux' => 600, 'luma' => 121]], 'eksposur'],
    'jenuh' => [[['lux' => 50, 'luma' => 40], ['lux' => 200, 'luma' => 120], ['lux' => 2000, 'luma' => 252]], 'jenuh'],
    'luma tidak ada' => [[['lux' => 50, 'luma' => null], ['lux' => 200, 'luma' => 120], ['lux' => 600, 'luma' => 200]], 'kecerahan'],
]);

it('fit menolak model dengan galat melebihi batas', function () {
    $points = [['lux' => 50, 'luma' => 40], ['lux' => 200, 'luma' => 60], ['lux' => 600, 'luma' => 200]];
    $fit = LightingModel::fit($points);
    expect($fit['ok'])->toBeFalse()
        ->and($fit['max_rel_error'])->toBeGreaterThan(0.20)
        ->and($fit['reason'])->toContain('Galat');
});
