import { describe, expect, it } from 'vitest';
import {
    canRequestPreview,
    canTakeSample,
    distanceToCurrentText,
    enrollmentErrorMessage,
    facesDetectedText,
    MAX_ENROLL_SAMPLES,
    MIN_ENROLL_SAMPLES,
    offerReenrollment,
    sameEmbeddingId,
    sampleHint,
} from '../enrollmentPreview';
import { formatDecimalId, l2ThresholdCaption, toFiniteNumber } from '../faceMatchDisplay';

describe('batas jumlah sampel enrollment', () => {
    it('sama dengan validasi server (3 sampai 5 foto)', () => {
        expect(MIN_ENROLL_SAMPLES).toBe(3);
        expect(MAX_ENROLL_SAMPLES).toBe(5);
    });

    it('tombol periksa aktif hanya untuk 3 sampai 5 foto dan saat tidak mengirim', () => {
        expect([0, 1, 2, 3, 4, 5, 6].map((n) => canRequestPreview(n, false))).toEqual([
            false, false, false, true, true, true, false,
        ]);
        expect(canRequestPreview(4, true)).toBe(false);
    });

    it('jepret foto berhenti di 5', () => {
        expect(canTakeSample(4)).toBe(true);
        expect(canTakeSample(5)).toBe(false);
    });

    it('petunjuk menyebut sisa foto minimal', () => {
        expect(sampleHint(0)).toBe('Ambil 3 foto lagi (minimal 3).');
        expect(sampleHint(2)).toBe('Ambil 1 foto lagi (minimal 3).');
        expect(sampleHint(3)).toContain('sampai 5');
        expect(sampleHint(5)).toBe('Batas 5 foto tercapai.');
    });
});

describe('ringkasan pratinjau', () => {
    it('menulis jumlah foto berisi wajah dari angka mesin', () => {
        expect(facesDetectedText(4, 5)).toBe('4 dari 5 foto berisi wajah');
        expect(facesDetectedText(0, 3)).toBe('0 dari 3 foto berisi wajah');
    });

    it('tidak mengarang angka yang tidak dilaporkan mesin', () => {
        expect(facesDetectedText(null, 5)).toBeNull();
        expect(facesDetectedText(3, undefined)).toBeNull();
    });

    it('jarak ke template tersimpan ditulis 3 desimal, null berarti tidak ada pembanding', () => {
        expect(distanceToCurrentText(0.12345)).toBe('0,123');
        expect(distanceToCurrentText(0)).toBe('0,000');
        expect(distanceToCurrentText(null)).toBe('Tidak ada template tersimpan untuk dibandingkan');
    });
});

describe('enrollmentErrorMessage', () => {
    it('memakai pesan server', () => {
        expect(enrollmentErrorMessage({ message: 'Wajah terdeteksi pada 2 dari 4 gambar' }, 'x')).toBe(
            'Wajah terdeteksi pada 2 dari 4 gambar',
        );
    });

    it('menambahkan pesan mesin bila berbeda', () => {
        const body = {
            message: 'Pratinjau tidak ditemukan di mesin biometrik.',
            engine_message: 'Pratinjau tidak ditemukan atau sudah kedaluwarsa.',
        };
        expect(enrollmentErrorMessage(body, 'x')).toBe(
            'Pratinjau tidak ditemukan di mesin biometrik. (Mesin: Pratinjau tidak ditemukan atau sudah kedaluwarsa.)',
        );
        expect(enrollmentErrorMessage({ message: 'sama', engine_message: 'sama' }, 'x')).toBe('sama');
    });

    it('mengutamakan pesan validasi per kolom', () => {
        const body = { message: 'The given data was invalid.', errors: { files: ['Minimal 3 foto.'] } };
        expect(enrollmentErrorMessage(body, 'x')).toBe('Minimal 3 foto.');
    });

    it('memakai fallback bila respons kosong', () => {
        expect(enrollmentErrorMessage(undefined, 'fallback')).toBe('fallback');
        expect(enrollmentErrorMessage({ message: '  ' }, 'fallback')).toBe('fallback');
    });
});

describe('l2ThresholdCaption', () => {
    it('menulis jarak nyata dan ambang yang dikonfigurasi', () => {
        expect(l2ThresholdCaption(0.644, 0.4)).toBe('Jarak L2 0,644 · batas ≤ 0,40');
        expect(l2ThresholdCaption(0.312, 0.35)).toBe('Jarak L2 0,312 · batas ≤ 0,35');
    });

    it('tanpa jarak tidak ada teks (bukan 0)', () => {
        expect(l2ThresholdCaption(null, 0.4)).toBeNull();
        expect(l2ThresholdCaption(undefined, 0.4)).toBeNull();
        expect(l2ThresholdCaption('', 0.4)).toBeNull();
    });

    it('tanpa ambang dari server hanya jaraknya yang ditampilkan', () => {
        expect(l2ThresholdCaption(0.5, undefined)).toBe('Jarak L2 0,500');
        expect(l2ThresholdCaption(0.5, null)).toBe('Jarak L2 0,500');
    });

    it('jarak 0 tetap ditampilkan karena itu hasil ukur', () => {
        expect(l2ThresholdCaption(0, 0.4)).toBe('Jarak L2 0,000 · batas ≤ 0,40');
    });
});

describe('helper angka', () => {
    it('formatDecimalId memakai koma', () => {
        expect(formatDecimalId(0.4, 2)).toBe('0,40');
    });

    it('toFiniteNumber menolak null, boolean, dan teks bukan angka', () => {
        expect(toFiniteNumber(null)).toBeNull();
        expect(toFiniteNumber(true)).toBeNull();
        expect(toFiniteNumber('abc')).toBeNull();
        expect(toFiniteNumber(Number.NaN)).toBeNull();
        expect(toFiniteNumber('0.25')).toBe(0.25);
    });
});

describe('tawaran daftar ulang wajah setelah gagal', () => {
    const gagalWajah = {
        final_decision: 'REJECT',
        id_pred: 'NON_MATCH',
        pad_pred: 'BONA_FIDE',
        subject_id: 'emb_TEST-QALWANI-001',
    };

    it('ditawarkan pada presensi pribadi yang wajahnya tidak cocok tetapi liveness lolos', () => {
        expect(offerReenrollment(gagalWajah, 'personal', 'emb_TEST-QALWANI-001')).toBe(true);
        expect(offerReenrollment(gagalWajah, 'personal', 'TEST-QALWANI-001')).toBe(true);
    });

    it('tidak ditawarkan di mode kiosk: NON_MATCH bisa penolakan penyerang yang benar', () => {
        expect(offerReenrollment(gagalWajah, 'kiosk', 'emb_TEST-QALWANI-001')).toBe(false);
    });

    it('tidak ditawarkan bila liveness gagal, mesin tak tersedia, atau subjek orang lain', () => {
        expect(offerReenrollment({ ...gagalWajah, pad_pred: 'ATTACK' }, 'personal', 'emb_TEST-QALWANI-001')).toBe(false);
        expect(offerReenrollment({ ...gagalWajah, id_pred: 'UNAVAILABLE' }, 'personal', 'emb_TEST-QALWANI-001')).toBe(false);
        expect(offerReenrollment({ ...gagalWajah, final_decision: 'ACCEPT' }, 'personal', 'emb_TEST-QALWANI-001')).toBe(false);
        expect(offerReenrollment(gagalWajah, 'personal', 'emb_1')).toBe(false);
        expect(offerReenrollment(gagalWajah, 'personal', null)).toBe(false);
        expect(offerReenrollment(null, 'personal', 'emb_TEST-QALWANI-001')).toBe(false);
    });

    it('alias emb_ dianggap subjek yang sama', () => {
        expect(sameEmbeddingId('S07', 'emb_S07')).toBe(true);
        expect(sameEmbeddingId('emb_S07', 'S07')).toBe(true);
        expect(sameEmbeddingId('S07', 'S08')).toBe(false);
        expect(sameEmbeddingId('', 'S07')).toBe(false);
    });
});
