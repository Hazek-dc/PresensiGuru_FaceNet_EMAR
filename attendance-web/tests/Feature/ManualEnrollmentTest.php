<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * Enrollment wajah manual lewat web: pratinjau di mesin tanpa menulis galeri,
 * lalu commit eksplisit. Semua panggilan ke mesin dipalsukan; request nyasar
 * ke mesin live (127.0.0.1:5000) membuat tes gagal.
 */
class ManualEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    private const CONSENT = [
        'consent_checked' => true,
        'consent_version' => 'v1.0-2026',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /** @return array<int, UploadedFile> */
    private function photos(int $count): array
    {
        return array_map(fn ($i) => UploadedFile::fake()->image("face{$i}.jpg", 64, 64), range(1, $count));
    }

    private function enginePreviewOk(string $subject, array $overrides = []): array
    {
        return array_merge([
            'success' => true,
            'message' => 'Pratinjau siap',
            'preview_token' => 'engine-token-' . $subject,
            'subject_id' => $subject,
            'embedding_id' => str_starts_with($subject, 'emb_') ? $subject : 'emb_' . $subject,
            'template_hash' => 'abc123def4567890',
            'n_frames' => 3,
            'n_uploaded' => 3,
            'distance_to_current' => null,
        ], $overrides);
    }

    private function engineCommitOk(string $subject, array $overrides = []): array
    {
        return array_merge([
            'success' => true,
            'message' => 'Wajah berhasil didaftarkan',
            'embedding_id' => str_starts_with($subject, 'emb_') ? $subject : 'emb_' . $subject,
            'subject_id' => $subject,
            'template_hash' => 'abc123def4567890',
            'n_frames' => 3,
            'backup' => 'backup_20260927_101500_000001.pkl',
        ], $overrides);
    }

    /** Palsukan mesin; /enroll lama selalu 500 agar pemakaian tak sengaja terlihat. */
    private function fakeEngine(array $preview, ?array $commit = null, int $commitStatus = 200): void
    {
        Http::fake([
            '*/enroll/preview' => Http::response($preview, 200),
            '*/enroll/commit' => Http::response($commit ?? ['success' => false], $commitStatus),
            '*/enroll' => Http::response(['detail' => 'rute lama tidak boleh dipanggil'], 500),
        ]);
    }

    private function preview(User $actor, User $subject, int $files = 3)
    {
        return $this->actingAs($actor)->post('/api/presensi/enroll/preview', [
            'subject_id' => $subject->id,
            'files' => $this->photos($files),
        ] + self::CONSENT, ['Accept' => 'application/json']);
    }

    private function commit(User $actor, User $subject, ?string $token, bool $replace = false)
    {
        return $this->actingAs($actor)->postJson('/api/presensi/enroll/commit', [
            'preview_token' => $token,
            'subject_id' => $subject->id,
            'replace_confirmed' => $replace,
        ] + self::CONSENT);
    }

    private static function path(HttpRequest $request): string
    {
        return (string) parse_url($request->url(), PHP_URL_PATH);
    }

    private static function multipartValue(HttpRequest $request, string $name): ?string
    {
        foreach ($request->data() as $part) {
            if (($part['name'] ?? null) === $name) {
                return (string) $part['contents'];
            }
        }
        return null;
    }

    private static function fileParts(HttpRequest $request): int
    {
        return count(array_filter($request->data(), fn ($part) => ($part['name'] ?? null) === 'files[]'));
    }

    /** Hanya log enrollment; model User juga mencatat pembuatan akun. */
    private function enrollmentLogs(User $user)
    {
        return Activity::where('subject_id', $user->id)->orderBy('id')->get()
            ->filter(fn (Activity $a) => ($a->properties['event'] ?? null) === 'biometric_enrollment_manual')
            ->values();
    }

    private function assertLegacyEnrollNeverCalled(): void
    {
        Http::assertNotSent(fn (HttpRequest $r) => preg_match('#/enroll$#', self::path($r)) === 1);
    }

    public function test_user_can_fetch_authorized_subjects_for_enrollment(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'name' => 'Guru Biasa']);
        User::factory()->create(['role' => 'teacher', 'name' => 'Guru Lain']);

        // Guru biasa hanya melihat dirinya sendiri
        $response = $this->actingAs($teacher)->getJson('/api/presensi/enroll/subjects');
        $response->assertStatus(200)
            ->assertJsonCount(1, 'subjects')
            ->assertJsonPath('subjects.0.id', $teacher->id);

        $admin = User::factory()->create(['role' => 'admin', 'name' => 'Admin Sekolah']);
        $adminRes = $this->actingAs($admin)->getJson('/api/presensi/enroll/subjects');
        $adminRes->assertStatus(200)
            ->assertJsonCount(3, 'subjects');

        // Kolom department tidak ada di tabel users. SQLite diam-diam mengembalikan
        // teks "department" untuk identifier yang tak dikenal, PostgreSQL gagal (42703),
        // sehingga daftar subjek modal pendaftaran kosong di server sungguhan.
        $adminRes->assertJsonMissingPath('subjects.0.department');
    }

    public function test_enrollment_preview_requires_active_consent(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);

        $this->actingAs($teacher)->postJson('/api/presensi/enroll/preview', [
            'subject_id' => $teacher->id,
            'files' => $this->photos(3),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['consent_checked', 'consent_version']);

        Http::assertNothingSent();
    }

    public function test_preview_requires_between_three_and_five_photos(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);

        $this->preview($teacher, $teacher, 2)->assertStatus(422)->assertJsonValidationErrors(['files']);
        $this->preview($teacher, $teacher, 6)->assertStatus(422)->assertJsonValidationErrors(['files']);

        Http::assertNothingSent();
    }

    public function test_teacher_cannot_preview_another_subject(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $other = User::factory()->create(['role' => 'teacher']);

        $this->preview($teacher, $other)->assertStatus(403);

        Http::assertNothingSent();
    }

    public function test_preview_uses_preview_endpoint_and_does_not_touch_database(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine($this->enginePreviewOk($subject, ['n_frames' => 4, 'n_uploaded' => 5]));

        $res = $this->preview($teacher, $teacher, 5);

        $res->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('preview_data.subject_id', $teacher->id)
            ->assertJsonPath('preview_data.embedding_id', 'emb_' . $subject)
            ->assertJsonPath('preview_data.template_hash', 'abc123def4567890')
            ->assertJsonPath('preview_data.n_frames', 4)
            ->assertJsonPath('preview_data.n_uploaded', 5)
            ->assertJsonPath('preview_data.distance_to_current', null)
            ->assertJsonPath('preview_data.has_existing_template', false)
            ->assertJsonPath('preview_data.existing_embedding_id', null);

        // Token mesin tidak dibocorkan ke klien; klien memegang token Laravel.
        $this->assertNotSame('engine-token-' . $subject, $res->json('preview_token'));
        $this->assertStringNotContainsString('engine-token', $res->getContent());

        Http::assertSentCount(1);
        Http::assertSent(function (HttpRequest $r) use ($subject) {
            return self::path($r) === '/enroll/preview'
                && $r->isMultipart()
                && self::multipartValue($r, 'subject_id') === $subject
                && self::fileParts($r) === 5;
        });
        $this->assertLegacyEnrollNeverCalled();

        $this->assertNull($teacher->fresh()->embedding_id);
        $this->assertSame(0, AttendanceRecord::count());
    }

    public function test_preview_sends_existing_embedding_id_as_engine_subject(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'emb_TEST-QALWANI-001']);
        $this->fakeEngine($this->enginePreviewOk('emb_TEST-QALWANI-001', ['distance_to_current' => 0.1234]));

        $this->preview($teacher, $teacher)
            ->assertOk()
            ->assertJsonPath('preview_data.embedding_id', 'emb_TEST-QALWANI-001')
            ->assertJsonPath('preview_data.distance_to_current', 0.1234)
            ->assertJsonPath('preview_data.has_existing_template', true)
            ->assertJsonPath('preview_data.existing_embedding_id', 'emb_TEST-QALWANI-001');

        Http::assertSent(fn (HttpRequest $r) => self::multipartValue($r, 'subject_id') === 'emb_TEST-QALWANI-001');
    }

    public function test_preview_engine_route_missing_returns_error_without_fallback_to_enroll(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        Http::fake([
            '*/enroll/preview' => Http::response(['detail' => 'Not Found'], 404),
            '*/enroll' => Http::response($this->engineCommitOk((string) $teacher->id), 200),
        ]);

        $res = $this->preview($teacher, $teacher, 3);

        $res->assertStatus(502)
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('engine_error', 'ENGINE_OUTDATED');
        $this->assertStringContainsString('/enroll/preview', $res->json('message'));
        $this->assertStringContainsString('Perbarui biometric-api', $res->json('message'));

        // Satu percobaan ulang ke /api dengan request yang dibangun ulang (lampiran lengkap).
        $sent = Http::recorded()->map(fn ($pair) => $pair[0]);
        $this->assertSame(['/enroll/preview', '/api/enroll/preview'], $sent->map(fn ($r) => self::path($r))->all());
        $sent->each(fn (HttpRequest $r) => $this->assertSame(3, self::fileParts($r)));
        $this->assertLegacyEnrollNeverCalled();
        $this->assertNull($teacher->fresh()->embedding_id);
    }

    public function test_preview_reports_insufficient_faces_from_engine(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        $this->fakeEngine([
            'success' => false,
            'message' => 'Wajah terdeteksi pada 2 dari 4 gambar; minimal 3. Template tidak diubah.',
            'error' => 'INSUFFICIENT_FACES',
            'n_frames' => 2,
            'n_uploaded' => 4,
        ]);

        $this->preview($teacher, $teacher, 4)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Wajah terdeteksi pada 2 dari 4 gambar; minimal 3. Template tidak diubah.')
            ->assertJsonPath('engine_error', 'INSUFFICIENT_FACES')
            ->assertJsonPath('n_frames', 2)
            ->assertJsonPath('n_uploaded', 4)
            ->assertJsonMissingPath('preview_token');
    }

    public function test_preview_reads_fastapi_detail_and_msg_errors(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);

        Http::fake(['*/enroll/preview' => Http::sequence()
            ->push(['detail' => 'Format gambar tidak valid'], 400)
            ->push(['msg' => 'Mesin sibuk'], 503)
            ->push(['detail' => [['loc' => ['body', 'files'], 'msg' => 'field required', 'type' => 'missing']]], 422)]);

        $this->preview($teacher, $teacher)->assertStatus(422)->assertJsonPath('message', 'Format gambar tidak valid');
        $this->preview($teacher, $teacher)->assertStatus(502)->assertJsonPath('message', 'Mesin sibuk');
        $this->preview($teacher, $teacher)->assertStatus(422)->assertJsonPath('message', 'field required');
    }

    public function test_preview_engine_unreachable_returns_503(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        Http::fake(['*' => Http::failedConnection()]);

        $this->preview($teacher, $teacher)->assertStatus(503)->assertJsonPath('status', 'error');
    }

    public function test_commit_calls_engine_commit_and_updates_embedding_id(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine($this->enginePreviewOk($subject), $this->engineCommitOk($subject));

        $token = $this->preview($teacher, $teacher)->assertOk()->json('preview_token');

        $this->commit($teacher, $teacher, $token)
            ->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('embedding_id', 'emb_' . $subject)
            ->assertJsonPath('template_hash', 'abc123def4567890')
            ->assertJsonPath('backup', 'backup_20260927_101500_000001.pkl');

        Http::assertSent(function (HttpRequest $r) use ($subject) {
            return self::path($r) === '/enroll/commit'
                && $r['preview_token'] === 'engine-token-' . $subject
                && $r['subject_id'] === $subject;
        });
        $this->assertLegacyEnrollNeverCalled();

        $this->assertSame('emb_' . $subject, $teacher->fresh()->embedding_id);
        $this->assertSame(0, AttendanceRecord::count());

        $log = $this->enrollmentLogs($teacher)->last();
        $this->assertNotNull($log);
        $this->assertSame('biometric_enrollment_manual', $log->properties['event']);
        $this->assertSame('backup_20260927_101500_000001.pkl', $log->properties['engine_backup']);
        $this->assertSame('abc123def4567890', $log->properties['template_hash']);

        // Token Laravel dilupakan setelah berhasil: commit kedua ditolak tanpa memanggil mesin.
        $this->commit($teacher, $teacher, $token)->assertStatus(422);
        Http::assertSentCount(2);
    }

    public function test_expired_engine_preview_leaves_database_unchanged(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine($this->enginePreviewOk($subject), [
            'success' => false,
            'message' => 'Pratinjau tidak ditemukan atau sudah kedaluwarsa. Ulangi pratinjau.',
            'error' => 'PREVIEW_NOT_FOUND',
        ], 404);

        $token = $this->preview($teacher, $teacher)->json('preview_token');

        $res = $this->commit($teacher, $teacher, $token);
        $res->assertStatus(422)
            ->assertJsonPath('status', 'error')
            ->assertJsonPath('engine_error', 'PREVIEW_NOT_FOUND');
        $this->assertStringContainsString('Ulangi pengambilan sampel', $res->json('message'));

        // 404 berkode dari mesin bukan rute hilang: tidak diulang ke /api.
        Http::assertSentCount(2);
        $this->assertNull($teacher->fresh()->embedding_id);
        $this->assertSame(0, $this->enrollmentLogs($teacher)->count());
        $this->assertLegacyEnrollNeverCalled();

        // Token mesin sudah mati, jadi token Laravel ikut dibuang.
        $this->commit($teacher, $teacher, $token)->assertStatus(422);
        Http::assertSentCount(2);
    }

    public function test_engine_commit_failure_leaves_database_unchanged(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine($this->enginePreviewOk($subject), [
            'success' => false,
            'message' => 'Gagal menyimpan template: disk penuh',
            'error' => 'COMMIT_FAILED',
        ], 500);

        $token = $this->preview($teacher, $teacher)->json('preview_token');

        $this->commit($teacher, $teacher, $token)
            ->assertStatus(502)
            ->assertJsonPath('message', 'Gagal menyimpan template: disk penuh')
            ->assertJsonPath('engine_error', 'COMMIT_FAILED');

        $this->assertNull($teacher->fresh()->embedding_id);
        $this->assertSame(0, $this->enrollmentLogs($teacher)->count());
    }

    public function test_commit_engine_route_missing_returns_error(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine($this->enginePreviewOk($subject), ['detail' => 'Not Found'], 404);

        $token = $this->preview($teacher, $teacher)->json('preview_token');

        $this->commit($teacher, $teacher, $token)
            ->assertStatus(502)
            ->assertJsonPath('engine_error', 'ENGINE_OUTDATED');

        $this->assertNull($teacher->fresh()->embedding_id);
        $this->assertLegacyEnrollNeverCalled();
    }

    public function test_commit_engine_unreachable_leaves_database_unchanged(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        Http::fake([
            '*/enroll/preview' => Http::response($this->enginePreviewOk($subject), 200),
            '*/enroll/commit' => Http::failedConnection(),
        ]);

        $token = $this->preview($teacher, $teacher)->json('preview_token');

        $this->commit($teacher, $teacher, $token)->assertStatus(503);
        $this->assertNull($teacher->fresh()->embedding_id);
    }

    public function test_enrollment_requires_replacement_confirmation_when_overwriting(): void
    {
        $teacher = User::factory()->create([
            'role' => 'teacher',
            'embedding_id' => 'old_embedding_existing',
        ]);
        $this->fakeEngine(
            $this->enginePreviewOk('old_embedding_existing', ['distance_to_current' => 0.52]),
            $this->engineCommitOk('old_embedding_existing'),
        );

        $token = $this->preview($teacher, $teacher)
            ->assertJsonPath('preview_data.has_existing_template', true)
            ->json('preview_token');

        $this->commit($teacher, $teacher, $token, false)
            ->assertStatus(409)
            ->assertJson([
                'status' => 'error',
                'requires_replacement_confirmation' => true,
            ]);

        // Tanpa konfirmasi mesin tidak diminta menulis.
        Http::assertNotSent(fn (HttpRequest $r) => self::path($r) === '/enroll/commit');
        $this->assertSame('old_embedding_existing', $teacher->fresh()->embedding_id);

        $this->commit($teacher, $teacher, $token, true)->assertOk();
        // ID lama dipertahankan; mesin menulis template di bawah ID itu dan alias emb_-nya.
        $this->assertSame('old_embedding_existing', $teacher->fresh()->embedding_id);

        $log = $this->enrollmentLogs($teacher)->last();
        $this->assertSame('old_embedding_existing', $log->properties['old_embedding_id']);
    }

    public function test_daftar_ulang_tidak_mengganti_id_partisipan_riset(): void
    {
        // S07 dipakai di CSV riset dan analisis per subjek; menjadi emb_S07 akan
        // memecah satu partisipan menjadi dua ID.
        $admin = User::factory()->create(['role' => 'admin']);
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'S07']);
        $this->fakeEngine($this->enginePreviewOk('S07'), $this->engineCommitOk('S07'));

        $token = $this->preview($admin, $teacher)->json('preview_token');
        $this->commit($admin, $teacher, $token, true)
            ->assertOk()
            ->assertJsonPath('embedding_id', 'S07');

        $this->assertSame('S07', $teacher->fresh()->embedding_id);
        Http::assertSent(fn (HttpRequest $r) => self::path($r) === '/enroll/commit');
    }

    public function test_replacement_confirmation_required_when_gallery_already_has_template(): void
    {
        // embedding_id kosong di DB, tetapi mesin mengukur jarak ke template yang
        // sudah ada di kunci ini: commit akan menimpanya.
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine(
            $this->enginePreviewOk($subject, ['distance_to_current' => 0.33]),
            $this->engineCommitOk($subject),
        );

        $token = $this->preview($teacher, $teacher)
            ->assertJsonPath('preview_data.has_existing_template', true)
            ->json('preview_token');

        $this->commit($teacher, $teacher, $token, false)->assertStatus(409);
        Http::assertNotSent(fn (HttpRequest $r) => self::path($r) === '/enroll/commit');
        $this->assertNull($teacher->fresh()->embedding_id);
    }

    public function test_commit_rejects_token_from_another_user(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $otherAdmin = User::factory()->create(['role' => 'admin']);
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => null]);
        $subject = (string) $teacher->id;
        $this->fakeEngine($this->enginePreviewOk($subject), $this->engineCommitOk($subject));

        $token = $this->preview($admin, $teacher)->assertOk()->json('preview_token');

        $this->commit($otherAdmin, $teacher, $token)->assertStatus(422);
        Http::assertNotSent(fn (HttpRequest $r) => self::path($r) === '/enroll/commit');
        $this->assertNull($teacher->fresh()->embedding_id);
    }

    public function test_tambah_sampel_diteruskan_ke_mesin_tanpa_konfirmasi_ganti(): void
    {
        // Sampel di cahaya/jarak lain ditambahkan ke template; tidak ada yang diganti.
        $teacher = User::factory()->create(['role' => 'teacher', 'embedding_id' => 'emb_TEST-QALWANI-001']);
        $this->fakeEngine(
            $this->enginePreviewOk('emb_TEST-QALWANI-001', ['distance_to_current' => 0.42, 'mode' => 'append']),
            $this->engineCommitOk('emb_TEST-QALWANI-001', ['n_sessions' => 2, 'mode' => 'append']),
        );

        $token = $this->actingAs($teacher)->post('/api/presensi/enroll/preview', [
            'subject_id' => $teacher->id,
            'files' => $this->photos(3),
            'mode' => 'append',
        ] + self::CONSENT, ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('preview_data.mode', 'append')
            ->json('preview_token');

        Http::assertSent(fn (HttpRequest $r) => self::path($r) === '/enroll/preview'
            && self::multipartValue($r, 'mode') === 'append');

        $this->commit($teacher, $teacher, $token, false)
            ->assertOk()
            ->assertJsonPath('mode', 'append')
            ->assertJsonPath('n_sessions', 2);
        $this->assertSame('emb_TEST-QALWANI-001', $teacher->fresh()->embedding_id);
    }

    public function test_mode_pendaftaran_tidak_dikenal_ditolak(): void
    {
        $teacher = User::factory()->create(['role' => 'teacher']);
        Http::fake();

        $this->actingAs($teacher)->post('/api/presensi/enroll/preview', [
            'subject_id' => $teacher->id,
            'files' => $this->photos(3),
            'mode' => 'gabung',
        ] + self::CONSENT, ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('mode');
        Http::assertNothingSent();
    }
}
