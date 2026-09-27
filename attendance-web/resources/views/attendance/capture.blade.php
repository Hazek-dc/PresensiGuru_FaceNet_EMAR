<!DOCTYPE html>
<html lang="id">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Presensi — Verifikasi Wajah</title>
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="min-h-screen bg-slate-100 font-sans text-slate-900">
        <main class="mx-auto max-w-2xl px-6 py-12" data-attendance-capture>
            <h1 class="text-2xl font-semibold">Verifikasi Kehadiran</h1>
            <p class="mt-2 text-slate-600">
                Izinkan akses kamera, lalu rekam respons liveness. Kehadiran belum dicatat
                sampai layanan verifikasi memberi keputusan akhir.
            </p>

            <section class="mt-8 rounded-xl bg-white p-5 shadow-sm">
                <video
                    class="aspect-video w-full rounded-lg bg-slate-900 object-cover"
                    data-camera-preview
                    autoplay
                    muted
                    playsinline
                    aria-label="Pratinjau kamera"
                ></video>

                <div class="mt-4 flex gap-3">
                    <button
                        class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        data-start-recording
                        type="button"
                    >
                        Mulai rekam
                    </button>
                    <button
                        class="rounded-md bg-slate-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        data-stop-recording
                        disabled
                        type="button"
                    >
                        Selesai rekam
                    </button>
                </div>

                <p class="mt-4 text-sm text-slate-600" data-capture-status aria-live="polite">
                    Kamera belum digunakan.
                </p>
            </section>

            <section class="mt-6" aria-label="Pratinjau rekaman">
                <video class="aspect-video w-full rounded-lg bg-slate-900" data-recording-preview controls hidden></video>
            </section>
        </main>
    </body>
</html>
