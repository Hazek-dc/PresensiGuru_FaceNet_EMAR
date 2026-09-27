import Modal from '@/Components/Modal';
import React, { useEffect, useRef, useState } from 'react';

export interface PreviewData {
    status: string;
    preview_token: string;
    exact_ids: number[];
    count: number;
    timezone: string;
    date_str: string;
    can_undo: boolean;
    items_summary: Array<{
        id: number;
        status: string;
        time: string;
        user_name: string;
        is_test_data: boolean;
    }>;
}

interface ConfirmHideActivityModalProps {
    show: boolean;
    onClose: () => void;
    previewData: PreviewData | null;
    onConfirm: (
        token: string,
        targetIds: number[],
        reason: string,
    ) => Promise<void>;
    isLoading: boolean;
    errorMessage?: string | null;
}

export default function ConfirmHideActivityModal({
    show,
    onClose,
    previewData,
    onConfirm,
    isLoading,
    errorMessage,
}: ConfirmHideActivityModalProps) {
    const [reason, setReason] = useState('');
    const [confirmationChecked, setConfirmationChecked] = useState(false);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (show) {
            setReason('');
            setConfirmationChecked(false);
            setTimeout(() => {
                cancelButtonRef.current?.focus();
            }, 100);
        }
    }, [show]);

    const isReasonValid = reason.trim().length >= 5;
    const isFormValid =
        isReasonValid &&
        confirmationChecked &&
        previewData !== null &&
        previewData.count > 0 &&
        !isLoading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid || !previewData) return;
        await onConfirm(
            previewData.preview_token,
            previewData.exact_ids,
            reason.trim(),
        );
    };

    return (
        <Modal show={show} onClose={onClose} maxWidth="xl">
            <div className="p-6">
                {/* Header */}
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <span className="material-symbols-outlined text-2xl">
                            visibility_off
                        </span>
                    </div>
                    <div>
                        <h3
                            className="text-lg font-semibold text-gray-900"
                            id="modal-title"
                        >
                            Sembunyikan Aktivitas Verifikasi Hari Ini?
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Fitur ini menyembunyikan entri verifikasi dari feed
                            Dashboard tanpa mengubah presensi resmi atau audit
                            log.
                        </p>
                    </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <span className="material-symbols-outlined text-base">
                            error
                        </span>
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Content Details */}
                {previewData ? (
                    <div className="mt-4 space-y-4">
                        {/* Scope Summary Card */}
                        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-600">
                                    Tanggal & Timezone:
                                </span>
                                <span className="font-medium text-gray-900">
                                    {previewData.date_str} (
                                    {previewData.timezone})
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-600">
                                    Jumlah Entri:
                                </span>
                                <span className="font-semibold text-amber-700">
                                    {previewData.count} Aktivitas
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-gray-200 pb-2">
                                <span className="text-gray-600">
                                    Target Record IDs:
                                </span>
                                <span className="rounded bg-gray-200 px-2 py-0.5 font-mono text-xs text-gray-700">
                                    {previewData.exact_ids.join(', ') ||
                                        'Tidak ada'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">
                                    Dapat Dipulihkan (Undo):
                                </span>
                                <span className="font-medium text-gray-500">
                                    {previewData.can_undo
                                        ? 'Ya'
                                        : 'Tidak (Permanen di Feed)'}
                                </span>
                            </div>
                        </div>

                        {/* Informational Assurance Alert */}
                        <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                            <div className="flex items-center gap-1 font-semibold">
                                <span className="material-symbols-outlined text-sm">
                                    shield
                                </span>
                                Jamu Keamanan Data:
                            </div>
                            <ul className="list-inside list-disc space-y-0.5 text-blue-700">
                                <li>
                                    <strong>Presensi Resmi:</strong> Tetap
                                    tersimpan di Riwayat Presensi
                                    (`/attendance/history`).
                                </li>
                                <li>
                                    <strong>Audit Log:</strong> Event
                                    penyembunyian ini akan dicatat di log audit
                                    append-only.
                                </li>
                                <li>
                                    <strong>Data Biometrik:</strong> Template
                                    wajah, embedding, dan media tidak tersentuh.
                                </li>
                            </ul>
                        </div>

                        {/* Preview Items Summary */}
                        {previewData.items_summary.length > 0 && (
                            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 text-xs">
                                <div className="border-b border-gray-100 px-1 pb-1 font-medium text-gray-500">
                                    Daftar Ringkas Target (
                                    {previewData.items_summary.length}):
                                </div>
                                {previewData.items_summary.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center justify-between px-1 text-gray-700"
                                    >
                                        <span>
                                            ID #{item.id} - {item.user_name} (
                                            {item.time})
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {item.is_test_data && (
                                                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
                                                    TEST DATA
                                                </span>
                                            )}
                                            <span className="rounded bg-gray-100 px-1.5 py-0.5 capitalize text-gray-500">
                                                {item.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Form Inputs */}
                        <form
                            onSubmit={handleSubmit}
                            className="space-y-4 pt-2"
                        >
                            <div>
                                <label
                                    htmlFor="hide-reason"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                    Alasan Penyembunyian{' '}
                                    <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    id="hide-reason"
                                    rows={2}
                                    className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500"
                                    placeholder="Contoh: Pembersihan tampilan feed aktivitas uji coba hari ini"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    disabled={isLoading}
                                />
                                {reason.length > 0 && !isReasonValid && (
                                    <p className="mt-1 text-xs text-red-600">
                                        Alasan minimal 5 karakter.
                                    </p>
                                )}
                            </div>

                            <div className="flex items-start">
                                <div className="flex h-5 items-center">
                                    <input
                                        id="confirmation-checkbox"
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                        checked={confirmationChecked}
                                        onChange={(e) =>
                                            setConfirmationChecked(
                                                e.target.checked,
                                            )
                                        }
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="ml-3 text-xs">
                                    <label
                                        htmlFor="confirmation-checkbox"
                                        className="cursor-pointer font-medium text-gray-700"
                                    >
                                        Saya memahami bahwa {previewData.count}{' '}
                                        aktivitas verifikasi wajah hari ini akan
                                        disembunyikan dari feed Dashboard.
                                    </label>
                                </div>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-gray-500">
                        <span className="material-symbols-outlined animate-spin text-2xl text-amber-600">
                            sync
                        </span>
                        <span>Memuat preview data aktivitas...</span>
                    </div>
                )}

                {/* Actions Footer */}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        ref={cancelButtonRef}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 sm:w-auto"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-transparent bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        disabled={!isFormValid}
                        onClick={handleSubmit}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <span className="material-symbols-outlined animate-spin text-sm">
                                    sync
                                </span>
                                Memproses...
                            </span>
                        ) : (
                            `Ya, Sembunyikan ${previewData ? previewData.count : 0} Aktivitas`
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
