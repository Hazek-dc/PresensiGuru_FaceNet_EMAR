<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Profil Guru - {{ $teacher->name }}</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen p-6 font-sans">
    <div class="max-w-4xl mx-auto space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between pb-4 border-b border-gray-200">
            <div>
                <h1 class="text-2xl font-bold text-gray-800">Edit Profil Guru</h1>
                <p class="text-sm text-gray-500">Kelola data profil, status biometrik, dan presensi guru</p>
            </div>
            <a href="{{ route('admin.teachers.index') }}" class="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Kembali ke Daftar Guru
            </a>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Form Utama -->
            <div class="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <form action="{{ route('admin.teachers.update', $teacher->id) }}" method="POST" class="space-y-4">
                    @csrf
                    @method('PUT')

                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Nama Lengkap</label>
                        <input type="text" name="name" value="{{ old('name', $teacher->name) }}" required class="w-full px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                    </div>

                    <div>
                        <label class="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Email</label>
                        <input type="email" name="email" value="{{ old('email', $teacher->email) }}" required class="w-full px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                    </div>

                    <div class="pt-4">
                        <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow transition">
                            Simpan Perubahan
                        </button>
                    </div>
                </form>
            </div>

            <!-- Sidebar Status Akun -->
            <div class="space-y-4">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h3 class="text-base font-bold text-gray-800">Status Akun</h3>

                    <!-- Status Template Biometrik -->
                    <div class="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                        <div class="text-xs text-gray-500 font-medium mb-1">Status Template Biometrik</div>
                        @if($teacher->embedding_id)
                            <div class="text-sm font-bold text-emerald-600 flex items-center gap-1">
                                <span>✓ Terdaftar ({{ $teacher->embedding_id }})</span>
                            </div>
                        @else
                            <div class="text-sm font-bold text-amber-600 flex items-center gap-1">
                                <span>⚠️ Belum Terdaftar</span>
                            </div>
                        @endif
                    </div>

                    <!-- Widget Presensi / Dispensasi Hari Ini -->
                    <div class="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                        <div class="text-xs text-gray-500 font-medium mb-1">Presensi / Dispensasi Hari Ini</div>
                        
                        @if($todayAttendance)
                            <!-- JIKA SUDAH PRESENSI SUKSES (STATUS AKTIF / HADIR) -->
                            <div class="flex items-center text-sm font-semibold text-emerald-700">
                                <span class="relative flex h-2.5 w-2.5 mr-2">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                                <span>Aktif (Hadir {{ \Carbon\Carbon::parse($todayAttendance->created_at)->timezone('Asia/Pontianak')->format('H:i') }} WIB)</span>
                            </div>
                            <div class="text-[11px] text-emerald-600 mt-0.5 ml-4.5 font-medium">
                                ✓ Terverifikasi FaceNet + EMAR ({{ $todayAttendance->subject_id ?? $teacher->subject_id ?? $teacher->embedding_id }})
                            </div>

                        @elseif(isset($todayDispensation) && $todayDispensation)
                            <!-- JIKA ADA DISPENSASI (IZIN / SAKIT) -->
                            @if($todayDispensation->type === 'IZIN' || $todayDispensation->status === 'izin')
                                <div class="flex items-center text-sm font-semibold text-amber-700">
                                    <span class="h-2 w-2 mr-2 rounded-full bg-amber-500"></span>
                                    <span>Izin ({{ $todayDispensation->reason ?? 'Dinas/Keperluan' }})</span>
                                </div>
                            @else
                                <div class="flex items-center text-sm font-semibold text-purple-700">
                                    <span class="h-2 w-2 mr-2 rounded-full bg-purple-500"></span>
                                    <span>Sakit (Surat Dokter)</span>
                                </div>
                            @endif

                        @else
                            <!-- JIKA BELUM PRESENSI -->
                            <div class="flex items-center text-sm text-gray-500">
                                <span class="h-2 w-2 mr-2 rounded-full bg-gray-300"></span>
                                <span>Belum ada presensi / izin hari ini</span>
                            </div>
                        @endif
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
