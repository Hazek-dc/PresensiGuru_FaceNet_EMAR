/**
 * Kesiapan template wajah guru untuk presensi lewat webcam kiosk, dari
 * GET /gallery/status di mesin (lihat App\Services\TemplateReadiness).
 */

export interface TemplateStatus {
    enrolled: boolean;
    source: 'webcam' | 'photo' | 'unknown' | null;
    n_sessions: number;
    webcam_sessions: number;
    enrolled_at: string | null;
}

export interface StudioSubject {
    id: string;
    user_id?: number;
    name: string;
    email: string;
    template?: TemplateStatus | null;
}

export type ReadinessLevel = 'ready' | 'photo' | 'none' | 'unknown';

export interface Readiness {
    level: ReadinessLevel;
    label: string;
    hint: string;
    /** Pendaftaran pertama dari webcam mengganti template foto; sesudahnya menambah sesi. */
    enrollMode: 'replace' | 'append';
}

export function readinessOf(template: TemplateStatus | null | undefined, statusAvailable: boolean): Readiness {
    if (!statusAvailable || template === undefined) {
        return {
            level: 'unknown',
            label: 'Status wajah tidak diketahui',
            hint: 'Mesin biometrik tidak terhubung, status template tidak dapat dibaca.',
            enrollMode: 'replace',
        };
    }
    if (!template || !template.enrolled) {
        return {
            level: 'none',
            label: 'Belum daftar wajah',
            hint: 'Presensi pasti ditolak. Daftarkan wajah dari kamera presensi ini lebih dulu.',
            enrollMode: 'replace',
        };
    }
    if (template.webcam_sessions < 1) {
        return {
            level: 'photo',
            label: 'Wajah dari foto, belum dari webcam',
            hint: 'Template dari foto ponsel biasanya berjarak L2 0,5-0,7 dari wajah di webcam (batas 0,40), jadi kemungkinan besar ditolak. Daftarkan dari kamera presensi ini.',
            enrollMode: 'replace',
        };
    }
    return {
        level: 'ready',
        label: `Wajah webcam · ${template.n_sessions} sesi`,
        hint: 'Bila gagal di cahaya lain (pagi, malam), tambahkan sampel untuk kondisi itu.',
        enrollMode: 'append',
    };
}
