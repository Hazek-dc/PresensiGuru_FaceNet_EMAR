<?php

namespace App\Services;

use Illuminate\Validation\Rule;

/**
 * Jabatan dan bidang studi guru/staff. Label jabatan untuk tampilan ada di
 * resources/js/Utils/staffProfile.ts; di sini hanya kunci yang disimpan.
 */
final class StaffProfile
{
    public const POSITIONS = ['guru', 'staff_tu'];

    /**
     * Bidang studi guru dari data sekolah, tanpa duplikat dan diurutkan abjad.
     * "Konsentrasi Keahlian 1,2" dipecah menjadi 1 dan 2 (angka 2 juga muncul
     * sendiri); "Projek Kreatif & Kewirausahaan" disatukan dengan ejaan yang lebih
     * sering dipakai, "Project Kreatif dan Kewirausahaan".
     */
    public const SUBJECT_OPTIONS = [
        'Bahasa Indonesia',
        'Bahasa Inggris',
        'BK',
        'Conversation',
        'Dasar-Dasar Program Keahlian RPL',
        'Dasar-Dasar Program Keahlian TKJ',
        'Informatika',
        'Konsentrasi Keahlian 1',
        'Konsentrasi Keahlian 2',
        'Matematika',
        'Mulok (Desain Grafis)',
        'Mulok (KKPI)',
        'Mulok (Seni Tari)',
        'Multimedia',
        'PAIBK',
        'Pendidikan Pancasila',
        'PJOK',
        'PKL',
        'Project Ilmu Pengetahuan Alam dan Sosial',
        'Project Kreatif dan Kewirausahaan',
        'Public Speaking',
        "Qur'an Tahfidz",
        'Sejarah',
        'Seni Musik',
        'Seni Rupa',
    ];

    /** Ejaan lain di data sekolah untuk pilihan yang sama (kunci huruf kecil). */
    private const SUBJECT_ALIASES = [
        'projek kreatif & kewirausahaan' => 'Project Kreatif dan Kewirausahaan',
    ];

    /** Guru boleh memilih 1, 2, atau 3 bidang studi; boleh juga dikosongkan dulu. */
    public const MAX_SUBJECTS = 3;

    public const MAX_SUBJECT_LENGTH = 60;

    /** @return array<string, mixed> */
    public static function rules(): array
    {
        return [
            'position' => ['nullable', Rule::in(self::POSITIONS)],
            'subjects' => ['exclude_unless:position,guru', 'nullable', 'array', 'max:'.self::MAX_SUBJECTS],
            'subjects.*' => ['exclude_unless:position,guru', 'required', 'string', 'distinct:ignore_case', 'max:'.self::MAX_SUBJECT_LENGTH],
        ];
    }

    /** @return array<string, string> */
    public static function messages(): array
    {
        return [
            'position.in' => 'Jabatan harus Guru atau Staff TU.',
            'subjects.array' => 'Bidang studi tidak valid.',
            'subjects.max' => 'Guru paling banyak memilih '.self::MAX_SUBJECTS.' bidang studi.',
            'subjects.*.required' => 'Nama bidang studi tidak boleh kosong.',
            'subjects.*.string' => 'Bidang studi harus berupa teks.',
            'subjects.*.distinct' => 'Bidang studi yang sama dipilih lebih dari sekali.',
            'subjects.*.max' => 'Nama bidang studi paling panjang '.self::MAX_SUBJECT_LENGTH.' karakter.',
        ];
    }

    /**
     * Nilai yang disimpan ke users: bidang studi hanya untuk jabatan guru.
     *
     * @param  array<string, mixed>  $validated
     * @return array{position: ?string, subjects: ?array<int, string>}
     */
    public static function attributes(array $validated): array
    {
        $position = $validated['position'] ?? null;
        $subjects = $position === 'guru' ? self::normalizeSubjects($validated['subjects'] ?? []) : [];

        return ['position' => $position, 'subjects' => $subjects ?: null];
    }

    /**
     * Rapikan spasi, buang duplikat tanpa peka huruf besar, dan samakan ejaan
     * dengan daftar sekolah bila cocok. Urutan: daftar sekolah dulu, lalu tambahan.
     *
     * @param  array<int, mixed>  $subjects
     * @return array<int, string>
     */
    public static function normalizeSubjects(array $subjects): array
    {
        $known = self::SUBJECT_ALIASES;
        foreach (self::SUBJECT_OPTIONS as $option) {
            $known[mb_strtolower($option)] = $option;
        }

        $picked = [];
        foreach ($subjects as $subject) {
            $clean = preg_replace('/\s+/u', ' ', trim((string) $subject));
            if ($clean === '') {
                continue;
            }
            $subject = $known[mb_strtolower($clean)] ?? $clean;
            $picked[mb_strtolower($subject)] ??= $subject;
        }

        $fromList = array_values(array_filter(self::SUBJECT_OPTIONS, fn ($option) => isset($picked[mb_strtolower($option)])));
        $extra = array_values(array_filter($picked, fn ($subject) => ! in_array($subject, self::SUBJECT_OPTIONS, true)));

        return [...$fromList, ...$extra];
    }

    /** Props halaman Tambah/Edit guru. */
    public static function formProps(): array
    {
        return [
            'subject_options' => self::SUBJECT_OPTIONS,
            'max_subjects' => self::MAX_SUBJECTS,
        ];
    }
}
