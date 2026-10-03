import { KeyboardEvent, useState } from 'react';
import { addSubject, MAX_SUBJECT_LENGTH, POSITION_OPTIONS, StaffPosition, toggleSubject } from '../../Utils/staffProfile';

interface StaffProfileFieldsProps {
    position: StaffPosition | '';
    subjects: string[];
    subjectOptions: string[];
    maxSubjects: number;
    onPositionChange: (position: StaffPosition) => void;
    onSubjectsChange: (subjects: string[]) => void;
    errors?: Partial<Record<string, string>>;
    disabled?: boolean;
}

const LABEL = 'block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300';

/**
 * Jabatan (guru / staff TU) dan bidang studi. Bidang studi hanya untuk guru;
 * pilihan dari daftar sekolah, ditambah isian bebas untuk yang belum ada.
 */
export function StaffProfileFields({
    position,
    subjects,
    subjectOptions,
    maxSubjects,
    onPositionChange,
    onSubjectsChange,
    errors = {},
    disabled = false,
}: StaffProfileFieldsProps) {
    const [draft, setDraft] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const atMax = subjects.length >= maxSubjects;
    // Isian bebas yang sudah dipilih ikut tampil sebagai chip; dilepas berarti dihapus.
    const chips = [...subjectOptions, ...subjects.filter((s) => !subjectOptions.includes(s))];
    const subjectError =
        errors.subjects ?? Object.entries(errors).find(([key]) => key.startsWith('subjects.'))?.[1] ?? null;

    const addDraft = () => {
        const result = addSubject(subjects, draft, subjectOptions);
        if (!result.subject) return;
        if (result.duplicate) {
            setNotice(`“${result.subject}” sudah dipilih.`);
        } else {
            onSubjectsChange(result.subjects);
            setNotice(null);
        }
        setDraft('');
    };

    const onDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        // Enter di sini menambah bidang studi, bukan mengirim formulir.
        if (e.key === 'Enter') {
            e.preventDefault();
            addDraft();
        }
    };

    return (
        <div className="space-y-5">
            <fieldset disabled={disabled} className="space-y-2.5">
                <legend className={LABEL}>Jabatan di sekolah</legend>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {POSITION_OPTIONS.map((option) => {
                        const checked = position === option.value;
                        return (
                            <label key={option.value} className="block cursor-pointer">
                                <input
                                    type="radio"
                                    name="position"
                                    value={option.value}
                                    checked={checked}
                                    onChange={() => onPositionChange(option.value)}
                                    className="peer sr-only"
                                />
                                <span className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface-container-low px-3.5 py-2.5 transition-colors hover:bg-surface-container peer-checked:border-royal-blue peer-checked:bg-royal-blue/10 peer-focus-visible:ring-2 peer-focus-visible:ring-royal-blue/60 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:peer-checked:border-sky-400 dark:peer-checked:bg-sky-500/15">
                                    <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-royal-blue dark:text-sky-400">
                                        {option.icon}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-bold text-deep-navy dark:text-white">{option.label}</span>
                                        <span className="block text-[11px] text-on-surface-variant dark:text-slate-400">{option.hint}</span>
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className={`material-symbols-outlined text-[20px] ${
                                            checked ? 'text-royal-blue dark:text-sky-400' : 'text-on-surface-variant dark:text-slate-500'
                                        }`}
                                    >
                                        {checked ? 'radio_button_checked' : 'radio_button_unchecked'}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
                {!position && <p className="text-[11px] text-on-surface-variant dark:text-slate-400">Belum diisi.</p>}
                {errors.position && <p className="text-xs text-rose-600 dark:text-rose-400">{errors.position}</p>}
            </fieldset>

            {position === 'guru' && (
                <fieldset disabled={disabled} className="space-y-2.5">
                    <legend className={LABEL}>Bidang studi</legend>
                    <p className="text-[11px] text-on-surface-variant dark:text-slate-400" aria-live="polite">
                        Boleh 1 sampai {maxSubjects} bidang studi, tidak lebih. {subjects.length} dari {maxSubjects} dipilih.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {chips.map((subject) => {
                            const checked = subjects.includes(subject);
                            return (
                                <label key={subject} className="cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!checked && atMax}
                                        onChange={() => {
                                            onSubjectsChange(toggleSubject(subjects, subject));
                                            setNotice(null);
                                        }}
                                        className="peer sr-only"
                                    />
                                    <span
                                        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-royal-blue/60 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:min-h-[40px] ${
                                            checked
                                                ? 'border-deep-navy bg-deep-navy text-white dark:border-sky-600 dark:bg-sky-600'
                                                : 'border-outline-variant/60 bg-surface-container-low text-deep-navy hover:bg-surface-container dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                                            {checked ? 'check' : 'add'}
                                        </span>
                                        {subject}
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    <div className="flex gap-2">
                        <label htmlFor="subject-extra" className="sr-only">
                            Bidang studi lain
                        </label>
                        <input
                            id="subject-extra"
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={onDraftKeyDown}
                            maxLength={MAX_SUBJECT_LENGTH}
                            disabled={atMax}
                            placeholder={atMax ? `Sudah ${maxSubjects} bidang studi` : 'Bidang studi lain'}
                            className="block min-h-[44px] w-full min-w-0 rounded-xl border border-outline-variant/60 bg-white px-3 py-2 text-xs text-deep-navy focus:border-royal-blue focus:ring-1 focus:ring-royal-blue disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                        />
                        <button
                            type="button"
                            onClick={addDraft}
                            disabled={atMax || draft.trim() === ''}
                            className="min-h-[44px] shrink-0 rounded-xl border border-outline-variant/60 bg-surface-container-low px-4 text-xs font-bold text-deep-navy hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                        >
                            Tambah
                        </button>
                    </div>
                    {notice && (
                        <p role="status" className="text-[11px] text-on-surface-variant dark:text-slate-400">
                            {notice}
                        </p>
                    )}
                    {subjectError && <p className="text-xs text-rose-600 dark:text-rose-400">{subjectError}</p>}
                </fieldset>
            )}

            {position === 'staff_tu' && subjects.length > 0 && (
                <p className="text-[11px] text-on-surface-variant dark:text-slate-400">
                    Bidang studi ({subjects.join(', ')}) tidak disimpan untuk Staff TU.
                </p>
            )}
        </div>
    );
}
