<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pengaturan Model Biometrik FaceNet & EMAR - SMK Al-Madani</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 18px;
            width: 18px;
            border-radius: 50%;
            background: #2563eb;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
        }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans p-4 sm:p-8">
    <div class="max-w-4xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div>
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-2">
                    <span class="material-symbols-outlined text-[14px]">science</span>
                    <span>Riset Skripsi Qalwani Anugerah (NPM. 221220048)</span>
                </div>
                <h1 class="text-2xl font-bold text-white tracking-tight">Pengaturan Model & Ambang Batas Biometrik</h1>
                <p class="text-xs text-slate-400 mt-1">Kalibrasi parameter deteksi FaceNet (Inception-ResNet-V1) dan Liveness EMAR (Eye-Mouth Aspect Ratio)</p>
            </div>
            <a href="{{ route('dashboard') }}" class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition">
                <span class="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Kembali ke Dashboard</span>
            </a>
        </div>

        @if(session('success'))
            <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[18px]">check_circle</span>
                <span>{{ session('success') }}</span>
            </div>
        @endif

        @if($errors->any())
            <div class="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-1">
                @foreach($errors->all() as $error)
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px]">error</span>
                        <span>{{ $error }}</span>
                    </div>
                @endforeach
            </div>
        @endif

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Form Kalibrasi Utama -->
            <div class="lg:col-span-2 bg-slate-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl backdrop-blur-md">
                <div class="flex items-center justify-between pb-4 border-b border-white/10">
                    <h2 class="text-base font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-blue-400">tune</span>
                        <span>Parameter Keputusan Biometrik</span>
                    </h2>
                    <span class="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400">
                        Strategi Aktif: {{ $settings['liveness_strategy'] ?? 'S2' }}
                    </span>
                </div>

                <form id="settingsForm" action="{{ route('admin.settings.model.update') }}" method="POST" class="space-y-6">
                    @csrf

                    <!-- 1. FaceNet Euclidean Distance Slider -->
                    <div class="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                        <div class="flex items-center justify-between">
                            <div>
                                <label class="text-xs font-bold uppercase tracking-wider text-slate-200">
                                    FaceNet 1:1 Euclidean Distance Threshold (L2)
                                </label>
                                <p class="text-[11px] text-slate-400 mt-0.5">Rentang: 0.20 - 0.60 (Default Bab 3: <strong>0.40</strong>)</p>
                            </div>
                            <span id="facenetValueBadge" class="text-sm font-bold font-mono px-3 py-1 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300">
                                {{ number_format($settings['facenet_threshold'] ?? 0.40, 2) }}
                            </span>
                        </div>
                        <input type="range" name="facenet_threshold" id="facenetInput"
                            min="0.20" max="0.60" step="0.01"
                            value="{{ $settings['facenet_threshold'] ?? 0.40 }}"
                            class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            oninput="document.getElementById('facenetValueBadge').innerText = parseFloat(this.value).toFixed(2)">
                        <div class="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>0.20 (Sangat Ketat)</span>
                            <span class="text-blue-400 font-bold">0.40 (Optimal Bab 3)</span>
                            <span>0.60 (Toleran)</span>
                        </div>
                    </div>

                    <!-- 2. Strategi Fusi Liveness Radio Group -->
                    <div class="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                        <label class="text-xs font-bold uppercase tracking-wider text-slate-200 block">
                            Strategi Fusi Liveness Multi-Modal
                        </label>
                        <p class="text-[11px] text-slate-400 mb-2">Pilih skenario integrasi FaceNet dan EMAR yang diuji dalam penelitian:</p>

                        <div class="space-y-2.5">
                            @php $currStrategy = $settings['liveness_strategy'] ?? 'S2'; @endphp
                            <label class="flex items-start gap-3 p-3 rounded-xl border border-white/5 hover:border-white/20 bg-slate-900/50 cursor-pointer transition">
                                <input type="radio" name="liveness_strategy" value="S1" class="mt-1 text-blue-600 focus:ring-blue-500" {{ $currStrategy === 'S1' ? 'checked' : '' }}>
                                <div class="text-xs">
                                    <div class="font-bold text-white">Skenario S1: Feature Concatenation (Early Fusion)</div>
                                    <div class="text-slate-400 text-[11px] mt-0.5">Menggabungkan 512-D FaceNet embedding dan vektor temporal kedipan-mulut ke dalam 1 representasi.</div>
                                </div>
                            </label>

                            <label class="flex items-start gap-3 p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 cursor-pointer transition">
                                <input type="radio" name="liveness_strategy" value="S2" class="mt-1 text-blue-600 focus:ring-blue-500" {{ $currStrategy === 'S2' ? 'checked' : '' }}>
                                <div class="text-xs">
                                    <div class="font-bold text-blue-300 flex items-center gap-1.5">
                                        <span>Skenario S2: Rule-Based Gate (Cascaded Late Fusion)</span>
                                        <span class="px-1.5 py-0.2 rounded text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/30 font-semibold">DEFAULT BAB 3</span>
                                    </div>
                                    <div class="text-slate-300 text-[11px] mt-0.5">Wajib lulus Liveness EMAR (Blink ≥ 1 & Mouth ≥ 1) SEBELUM verifikasi jarak Euclidean FaceNet (L2 ≤ 0.40).</div>
                                </div>
                            </label>

                            <label class="flex items-start gap-3 p-3 rounded-xl border border-white/5 hover:border-white/20 bg-slate-900/50 cursor-pointer transition">
                                <input type="radio" name="liveness_strategy" value="S3" class="mt-1 text-blue-600 focus:ring-blue-500" {{ $currStrategy === 'S3' ? 'checked' : '' }}>
                                <div class="text-xs">
                                    <div class="font-bold text-white">Skenario S3: Score-Level Fusion (Weighted Score)</div>
                                    <div class="text-slate-400 text-[11px] mt-0.5">Mengombinasikan skor probabilitas FaceNet dan EMAR dengan pembobotan linear (w1·ScoreFace + w2·ScoreEMAR).</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- 3. EAR Threshold Slider -->
                    <div class="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                        <div class="flex items-center justify-between">
                            <div>
                                <label class="text-xs font-bold uppercase tracking-wider text-slate-200">
                                    Eye Aspect Ratio Threshold (T_EAR)
                                </label>
                                <p class="text-[11px] text-slate-400 mt-0.5">Ambang batas kedipan mata. Rentang: 0.15 - 0.25 (Default: <strong>0.20</strong>)</p>
                            </div>
                            <span id="earValueBadge" class="text-sm font-bold font-mono px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                                {{ number_format($settings['ear_threshold'] ?? 0.20, 2) }}
                            </span>
                        </div>
                        <input type="range" name="ear_threshold" id="earInput"
                            min="0.15" max="0.25" step="0.01"
                            value="{{ $settings['ear_threshold'] ?? 0.20 }}"
                            class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            oninput="document.getElementById('earValueBadge').innerText = parseFloat(this.value).toFixed(2)">
                        <div class="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>0.15 (Mata Sangat Sipit)</span>
                            <span class="text-emerald-400 font-bold">0.20 (Standard Soukupova)</span>
                            <span>0.25 (Sensitif)</span>
                        </div>
                    </div>

                    <!-- 4. MAR Threshold Slider -->
                    <div class="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                        <div class="flex items-center justify-between">
                            <div>
                                <label class="text-xs font-bold uppercase tracking-wider text-slate-200">
                                    Mouth Aspect Ratio Threshold (T_MAR)
                                </label>
                                <p class="text-[11px] text-slate-400 mt-0.5">Ambang batas bukaan mulut. Rentang: 0.06 - 0.20 (Default: <strong>0.10</strong>)</p>
                            </div>
                            <span id="marValueBadge" class="text-sm font-bold font-mono px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
                                {{ number_format($settings['mar_threshold'] ?? 0.10, 2) }}
                            </span>
                        </div>
                        <input type="range" name="mar_threshold" id="marInput"
                            min="0.06" max="0.20" step="0.01"
                            value="{{ $settings['mar_threshold'] ?? 0.10 }}"
                            class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            oninput="document.getElementById('marValueBadge').innerText = parseFloat(this.value).toFixed(2)">
                        <div class="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>0.06 (Bukaan Kecil)</span>
                            <span class="text-amber-400 font-bold">0.10 (Optimal Bab 3)</span>
                            <span>0.20 (Bukaan Lebar)</span>
                        </div>
                    </div>

                    <!-- Alasan Perubahan -->
                    <div>
                        <label class="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-1">
                            Catatan / Alasan Kalibrasi (Audit Log)
                        </label>
                        <input type="text" name="reason" placeholder="Contoh: Pengujian variasi pencahayaan Lux 100 Bab 4..."
                            class="w-full px-4 py-2.5 text-xs bg-slate-900 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    </div>

                    <!-- Tombol Aksi -->
                    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
                        <button type="button" onclick="document.getElementById('resetForm').submit()"
                            class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition">
                            <span class="material-symbols-outlined text-[16px]">restart_alt</span>
                            <span>Reset to Default Bab 3 Skripsi</span>
                        </button>

                        <button type="submit"
                            class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/30 transition">
                            <span class="material-symbols-outlined text-[16px]">save</span>
                            <span>Simpan Konfigurasi Model</span>
                        </button>
                    </div>
                </form>

                <form id="resetForm" action="{{ route('admin.settings.model.reset') }}" method="POST" class="hidden">
                    @csrf
                </form>
            </div>

            <!-- Panel Parameter Terkunci & Metrik Riset -->
            <div class="space-y-6">
                <!-- Parameter Terkunci (Read-Only) -->
                <div class="bg-slate-900/90 border border-white/10 rounded-3xl p-6 space-y-4 shadow-xl">
                    <h3 class="text-sm font-bold text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-slate-400">lock</span>
                        <span>Parameter Eksperimen Terkunci</span>
                    </h3>
                    <p class="text-[11px] text-slate-400 leading-relaxed">
                        Parameter di bawah ini dipertahankan konstan sesuai batasan metodologi skripsi di SMK Al-Madani:
                    </p>

                    <div class="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold text-slate-300">Durasi Scan Window</div>
                            <div class="text-[10px] text-slate-500">Waktu perekaman video per sesi</div>
                        </div>
                        <div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-white/10 text-xs font-mono font-bold text-slate-200">
                            <span class="material-symbols-outlined text-[14px] text-slate-400">lock</span>
                            <span>8 Detik</span>
                        </div>
                    </div>

                    <div class="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold text-slate-300">Jarak Kamera Biometrik</div>
                            <div class="text-[10px] text-slate-500">Jarak subjek ke lensa webcam</div>
                        </div>
                        <div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-white/10 text-xs font-mono font-bold text-slate-200">
                            <span class="material-symbols-outlined text-[14px] text-slate-400">lock</span>
                            <span>30 cm</span>
                        </div>
                    </div>

                    <div class="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                        <div>
                            <div class="text-xs font-semibold text-slate-300">Minimal Stabilitas Wajah</div>
                            <div class="text-[10px] text-slate-500">Face detection continuity threshold</div>
                        </div>
                        <div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-white/10 text-xs font-mono font-bold text-slate-200">
                            <span class="material-symbols-outlined text-[14px] text-slate-400">lock</span>
                            <span>≥ 80.0%</span>
                        </div>
                    </div>
                </div>

                <!-- Rumus Aturan S2 (PRD Skripsi) -->
                <div class="bg-gradient-to-br from-blue-950/40 to-slate-900 border border-blue-500/20 rounded-3xl p-6 space-y-3">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[16px]">verified</span>
                        <span>Logika Keputusan (Skenario S2)</span>
                    </h3>
                    <div class="p-3 rounded-xl bg-slate-950/60 border border-white/5 font-mono text-[11px] text-slate-300 space-y-1">
                        <div class="text-emerald-400 font-bold">ACCEPT jika dan hanya jika:</div>
                        <div>(D_L2 ≤ 0.40) ∧</div>
                        <div>(Blink ≥ 1) ∧ (Mouth ≥ 1) ∧</div>
                        <div>(Stabilitas ≥ 80%)</div>
                    </div>
                    <p class="text-[11px] text-slate-400 leading-relaxed">
                        Jika kedipan ≥ 1x namun mulut = 0x, sistem mengklasifikasikan sebagai serangan <strong>Cut-Out Photo Attack</strong> dan segera menolak (REJECT).
                    </p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
