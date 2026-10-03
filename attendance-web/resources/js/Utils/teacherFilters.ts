/** Filter daftar guru di /admin/teachers; nilai bawaan sama dengan TeacherController@index. */

export type TeacherStatusFilter =
    | ''
    | 'active'
    | 'enrolled'
    | 'not_enrolled'
    | 'hadir'
    | 'izin'
    | 'sakit'
    | 'guru'
    | 'staff_tu'
    | 'no_position'
    | 'disabled';
export type TeacherSort = 'name' | 'name_desc' | 'newest' | 'oldest';
export type TeacherCountKey =
    | 'all'
    | 'hadir'
    | 'izin'
    | 'sakit'
    | 'enrolled'
    | 'not_enrolled'
    | 'guru'
    | 'staff_tu'
    | 'no_position'
    | 'disabled';
export type TeacherStatusCounts = Partial<Record<TeacherCountKey, number>>;

export interface TeacherFilters {
    search: string;
    status: TeacherStatusFilter;
    sort: TeacherSort;
    per_page: number;
}

export const DEFAULT_TEACHER_FILTERS: TeacherFilters = {
    search: '',
    status: '',
    sort: 'name',
    per_page: 9,
};

export const PER_PAGE_OPTIONS = [9, 18, 36] as const;

export const SEARCH_DEBOUNCE_MS = 300;

export const SORT_OPTIONS: Array<{ value: TeacherSort; label: string }> = [
    { value: 'name', label: 'Nama A–Z' },
    { value: 'name_desc', label: 'Nama Z–A' },
    { value: 'newest', label: 'Terbaru ditambahkan' },
    { value: 'oldest', label: 'Terlama ditambahkan' },
];

export interface StatusChip {
    value: TeacherStatusFilter;
    label: string;
    countKey: TeacherCountKey;
    /** Warna titik sama dengan aksen kartu guru, jadi chip sekaligus legenda. */
    dot?: string;
}

export const STATUS_GROUPS: Array<{
    label: string | null;
    chips: StatusChip[];
}> = [
    { label: null, chips: [{ value: '', label: 'Semua', countKey: 'all' }] },
    {
        label: 'Hari ini',
        chips: [
            {
                value: 'hadir',
                label: 'Hadir',
                countKey: 'hadir',
                dot: 'bg-emerald-500',
            },
            {
                value: 'izin',
                label: 'Izin',
                countKey: 'izin',
                dot: 'bg-amber-500',
            },
            {
                value: 'sakit',
                label: 'Sakit',
                countKey: 'sakit',
                dot: 'bg-purple-500',
            },
        ],
    },
    {
        label: 'Biometrik',
        chips: [
            {
                value: 'enrolled',
                label: 'Sudah enroll',
                countKey: 'enrolled',
                dot: 'bg-sky-500',
            },
            {
                value: 'not_enrolled',
                label: 'Belum enroll',
                countKey: 'not_enrolled',
                dot: 'bg-slate-400',
            },
        ],
    },
    {
        label: 'Jabatan',
        chips: [
            { value: 'guru', label: 'Guru', countKey: 'guru' },
            { value: 'staff_tu', label: 'Staff TU', countKey: 'staff_tu' },
            { value: 'no_position', label: 'Belum diisi', countKey: 'no_position' },
        ],
    },
    {
        label: 'Akun',
        chips: [
            {
                value: 'disabled',
                label: 'Nonaktif',
                countKey: 'disabled',
                dot: 'bg-rose-500',
            },
        ],
    },
];

export const STATUS_FILTER_LABEL: Record<
    Exclude<TeacherStatusFilter, ''>,
    string
> = {
    active: 'Akun aktif',
    hadir: 'Hadir hari ini',
    izin: 'Izin hari ini',
    sakit: 'Sakit hari ini',
    enrolled: 'Sudah enroll',
    not_enrolled: 'Belum enroll',
    guru: 'Jabatan Guru',
    staff_tu: 'Jabatan Staff TU',
    no_position: 'Jabatan belum diisi',
    disabled: 'Akun nonaktif',
};

/** Bentuk di dalam kalimat ("tidak ada guru berstatus ..."), tanpa merusak singkatan seperti TU. */
export const STATUS_FILTER_PHRASE: Record<
    Exclude<TeacherStatusFilter, ''>,
    string
> = {
    active: 'akun aktif',
    hadir: 'hadir hari ini',
    izin: 'izin hari ini',
    sakit: 'sakit hari ini',
    enrolled: 'sudah enroll',
    not_enrolled: 'belum enroll',
    guru: 'jabatan Guru',
    staff_tu: 'jabatan Staff TU',
    no_position: 'jabatan belum diisi',
    disabled: 'akun nonaktif',
};

const STATUS_VALUES = new Set<string>([
    '',
    ...Object.keys(STATUS_FILTER_LABEL),
]);
const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((o) => o.value));

/** Props `filters` dari server ke bentuk lengkap; nilai tak dikenal jatuh ke bawaan. */
export function normalizeTeacherFilters(
    raw: Partial<Record<keyof TeacherFilters, unknown>> | null | undefined,
): TeacherFilters {
    const status =
        typeof raw?.status === 'string' && STATUS_VALUES.has(raw.status)
            ? raw.status
            : '';
    const sort =
        typeof raw?.sort === 'string' && SORT_VALUES.has(raw.sort)
            ? raw.sort
            : DEFAULT_TEACHER_FILTERS.sort;
    const perPage = Number(raw?.per_page);
    return {
        search: typeof raw?.search === 'string' ? raw.search : '',
        status: status as TeacherStatusFilter,
        sort: sort as TeacherSort,
        per_page: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
            ? perPage
            : DEFAULT_TEACHER_FILTERS.per_page,
    };
}

/** Parameter URL tanpa nilai bawaan, agar alamat halaman tetap pendek dan bisa dibagikan. */
export function teacherQuery(
    filters: TeacherFilters,
): Record<string, string | number> {
    const query: Record<string, string | number> = {};
    const search = filters.search.trim();
    if (search) query.search = search;
    if (filters.status) query.status = filters.status;
    if (filters.sort !== DEFAULT_TEACHER_FILTERS.sort)
        query.sort = filters.sort;
    if (filters.per_page !== DEFAULT_TEACHER_FILTERS.per_page)
        query.per_page = filters.per_page;
    return query;
}

export function hasActiveTeacherFilters(filters: TeacherFilters): boolean {
    return filters.search.trim() !== '' || filters.status !== '';
}

/** Potong teks menjadi bagian cocok/tidak cocok dengan kata pencarian (tidak peka huruf besar). */
export function highlightParts(
    text: string,
    query: string,
): Array<{ text: string; match: boolean }> {
    const needle = query.trim().toLowerCase();
    const lower = text.toLowerCase();
    // Beberapa huruf berubah panjang saat di-lowercase; indeksnya tidak lagi sejajar.
    if (!needle || !text || lower.length !== text.length)
        return [{ text, match: false }];

    const parts: Array<{ text: string; match: boolean }> = [];
    let from = 0;
    for (
        let at = lower.indexOf(needle);
        at !== -1;
        at = lower.indexOf(needle, from)
    ) {
        if (at > from) parts.push({ text: text.slice(from, at), match: false });
        parts.push({ text: text.slice(at, at + needle.length), match: true });
        from = at + needle.length;
    }
    if (from < text.length)
        parts.push({ text: text.slice(from), match: false });
    return parts;
}
