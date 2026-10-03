/** Jabatan dan bidang studi guru/staff. Kunci dan aturan simpan ada di app/Services/StaffProfile.php. */

export type StaffPosition = 'guru' | 'staff_tu';

export const POSITION_OPTIONS: Array<{ value: StaffPosition; label: string; hint: string; icon: string }> = [
    { value: 'guru', label: 'Guru', hint: 'Mengajar bidang studi', icon: 'school' },
    { value: 'staff_tu', label: 'Staff TU', hint: 'Tata usaha / administrasi', icon: 'badge' },
];

export const POSITION_LABEL: Record<StaffPosition, string> = { guru: 'Guru', staff_tu: 'Staff TU' };

export const MAX_SUBJECT_LENGTH = 60;

export function positionLabel(position: string | null | undefined): string | null {
    return position === 'guru' || position === 'staff_tu' ? POSITION_LABEL[position] : null;
}

/** Rapikan spasi seperti server, agar yang tampil sama dengan yang tersimpan. */
export function cleanSubject(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

/**
 * Tambahkan bidang studi dari isian bebas. Bila sama (tanpa peka huruf besar)
 * dengan pilihan di daftar atau yang sudah dipilih, ejaan yang ada yang dipakai.
 */
export function addSubject(
    selected: string[],
    value: string,
    options: string[],
): { subjects: string[]; subject: string | null; duplicate: boolean } {
    const clean = cleanSubject(value).slice(0, MAX_SUBJECT_LENGTH);
    if (!clean) return { subjects: selected, subject: null, duplicate: false };
    const key = clean.toLowerCase();
    const existing = selected.find((s) => s.toLowerCase() === key);
    if (existing) return { subjects: selected, subject: existing, duplicate: true };
    const subject = options.find((o) => o.toLowerCase() === key) ?? clean;
    return { subjects: [...selected, subject], subject, duplicate: false };
}

export function toggleSubject(selected: string[], subject: string): string[] {
    return selected.includes(subject) ? selected.filter((s) => s !== subject) : [...selected, subject];
}
