<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laporan Presensi Guru - SMK Al-Madani Pontianak</title>
    <link rel="icon" type="image/png" href="/images/logo-smk-al-madani.png">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #0f172a;
            background: #f8fafc;
            padding: 20px;
            font-size: 11pt;
            line-height: 1.4;
        }

        .no-print-bar {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 12px 20px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            max-width: 1080px;
            margin-left: auto;
            margin-right: auto;
        }

        .no-print-bar .title {
            font-weight: 700;
            font-size: 14px;
            color: #1e293b;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .no-print-bar .actions {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-left: auto;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.15s ease;
            border: none;
        }

        .btn-primary {
            background: #2563eb;
            color: #ffffff;
        }

        .btn-primary:hover {
            background: #1d4ed8;
        }

        .btn-secondary {
            background: #f1f5f9;
            color: #475569;
            border: 1px solid #cbd5e1;
        }

        .btn-secondary:hover {
            background: #e2e8f0;
            color: #0f172a;
        }

        /* Printable Paper Canvas */
        .sheet {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
            padding: 30px 40px;
            max-width: 1080px;
            margin-left: auto;
            margin-right: auto;
            border-radius: 8px;
        }

        /* Kop Surat Official SMK */
        .kop-surat {
            display: flex;
            align-items: center;
            gap: 20px;
            padding-bottom: 14px;
            border-bottom: 3px double #0f172a;
            margin-bottom: 20px;
        }

        .kop-logo {
            width: 80px;
            height: 80px;
            object-fit: contain;
            flex-shrink: 0;
        }

        .kop-text {
            text-align: center;
            flex-grow: 1;
        }

        .kop-text h3 {
            font-size: 13pt;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #1e293b;
            text-transform: uppercase;
        }

        .kop-text h2 {
            font-size: 17pt;
            font-weight: 900;
            letter-spacing: 1px;
            color: #1e3a8a;
            text-transform: uppercase;
            margin: 2px 0;
        }

        .kop-text .kop-sub {
            font-size: 9.5pt;
            font-weight: 600;
            color: #475569;
        }

        .kop-text .kop-contact {
            font-size: 8.5pt;
            color: #64748b;
            margin-top: 3px;
        }

        /* Title section */
        .doc-header {
            text-align: center;
            margin-bottom: 18px;
        }

        .doc-header h1 {
            font-size: 13pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #0f172a;
            text-decoration: underline;
        }

        .doc-header .doc-meta {
            font-size: 9.5pt;
            color: #475569;
            margin-top: 4px;
        }

        /* KPI Cards Strip */
        .kpi-strip {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 20px;
        }

        .kpi-card {
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            border-radius: 6px;
            padding: 8px 10px;
            text-align: center;
        }

        .kpi-card .kpi-num {
            font-size: 13pt;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.2;
        }

        .kpi-card .kpi-label {
            font-size: 7.5pt;
            font-weight: 600;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.3px;
        }

        .kpi-card.hadir .kpi-num { color: #16a34a; }
        .kpi-card.terlambat .kpi-num { color: #d97706; }
        .kpi-card.pulang .kpi-num { color: #0284c7; }
        .kpi-card.izin .kpi-num { color: #7c3aed; }
        .kpi-card.gagal .kpi-num { color: #dc2626; }

        /* Report Table */
        .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
            margin-bottom: 24px;
        }

        .report-table th, 
        .report-table td {
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
            vertical-align: middle;
        }

        .report-table th {
            background-color: #f1f5f9;
            font-weight: 700;
            color: #1e293b;
            text-align: center;
            font-size: 8.5pt;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .report-table tr:nth-child(even) {
            background-color: #f8fafc;
        }

        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border: 1px solid transparent;
        }

        .badge-success {
            background-color: #dcfce7;
            color: #15803d;
            border-color: #bbf7d0;
        }

        .badge-warning {
            background-color: #fef3c7;
            color: #b45309;
            border-color: #fde68a;
        }

        .badge-info {
            background-color: #e0f2fe;
            color: #0369a1;
            border-color: #bae6fd;
        }

        .badge-purple {
            background-color: #f3e8ff;
            color: #6b21a8;
            border-color: #e9d5ff;
        }

        .badge-danger {
            background-color: #fee2e2;
            color: #b91c1c;
            border-color: #fecaca;
        }

        /* Signatures block */
        .signature-section {
            display: flex;
            justify-content: space-between;
            margin-top: 35px;
            padding: 0 20px;
            page-break-inside: avoid;
        }

        .signature-box {
            text-align: center;
            width: 250px;
        }

        .signature-box .date-line {
            font-size: 9.5pt;
            color: #334155;
            margin-bottom: 4px;
        }

        .signature-box .role-line {
            font-size: 9.5pt;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 75px;
        }

        .signature-box .name-line {
            font-size: 10pt;
            font-weight: 800;
            color: #0f172a;
            text-decoration: underline;
        }

        .signature-box .nip-line {
            font-size: 8.5pt;
            color: #64748b;
        }

        .footer-note {
            margin-top: 30px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 10px;
            font-size: 8pt;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
        }

        /* Print Media Styles */
        @media print {
            body {
                background: #ffffff !important;
                padding: 0 !important;
                color: #000000 !important;
                font-size: 9pt;
            }

            .no-print-bar {
                display: none !important;
            }

            .sheet {
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                max-width: 100% !important;
                margin: 0 !important;
            }

            @page {
                size: A4 landscape;
                margin: 10mm 12mm;
            }

            .report-table th {
                background-color: #f1f5f9 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .badge {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>

    <!-- Non-printable top action bar -->
    <div class="no-print-bar">
        <div class="title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9V2h12v7"></path>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            <span>Pratinjau Cetak Laporan Presensi Guru</span>
        </div>
        <div class="actions">
            <a href="/attendance/history" class="btn btn-secondary">
                ← Kembali ke Pusat Riwayat
            </a>
            <button type="button" onclick="window.print()" class="btn btn-primary">
                Cetak / Simpan PDF
            </button>
        </div>
    </div>

    <!-- Official Paper Sheet -->
    <div class="sheet">
        <!-- Kop Surat -->
        <div class="kop-surat">
            <img src="/images/logo-smk-al-madani.png" alt="Logo SMK Al-Madani" class="kop-logo">
            <div class="kop-text">
                <h3>Yayasan Pendidikan Islam Al-Madani Pontianak</h3>
                <h2>SMK AL-MADANI PONTIANAK</h2>
                <div class="kop-sub">BIDANG KEAHLIAN TEKNOLOGI INFORMASI & KOMUNIKASI • STATUS TERAKREDITASI</div>
                <div class="kop-contact">Jl. Sungai Raya Dalam Gg. Imaduddin, Pontianak Kalimantan Barat • Telp: (0561) 712345 • info@smkalmadani.sch.id</div>
            </div>
        </div>

        <!-- Document Title -->
        <div class="doc-header">
            <h1>Laporan Rekapitulasi Presensi &amp; Verifikasi Biometrik Guru</h1>
            <div class="doc-meta">
                @if(!empty($date))
                    Tanggal: <strong>{{ \Carbon\Carbon::parse($date)->translatedFormat('d F Y') }}</strong> &bull;
                @else
                    Periode: <strong>Semua Tanggal</strong> &bull;
                @endif
                Filter Status: <strong>{{ !empty($status) ? strtoupper($status) : 'SEMUA' }}</strong> &bull;
                Dicetak oleh: <strong>{{ $user->name ?? 'Administrator' }}</strong>
            </div>
        </div>

        <!-- KPI Summary Strip -->
        <div class="kpi-strip">
            <div class="kpi-card">
                <div class="kpi-num">{{ $total }}</div>
                <div class="kpi-label">Total Entri</div>
            </div>
            <div class="kpi-card hadir">
                <div class="kpi-num">{{ $hadir }}</div>
                <div class="kpi-label">Hadir Tepat Waktu</div>
            </div>
            <div class="kpi-card terlambat">
                <div class="kpi-num">{{ $terlambat }}</div>
                <div class="kpi-label">Terlambat</div>
            </div>
            <div class="kpi-card pulang">
                <div class="kpi-num">{{ $pulang ?? 0 }}</div>
                <div class="kpi-label">Presensi Pulang</div>
            </div>
            <div class="kpi-card izin">
                <div class="kpi-num">{{ $izinSakit }}</div>
                <div class="kpi-label">Izin / Sakit</div>
            </div>
            <div class="kpi-card gagal">
                <div class="kpi-num">{{ $failed }}</div>
                <div class="kpi-label">Ditolak / Gagal</div>
            </div>
        </div>

        <!-- Data Table -->
        <table class="report-table">
            <thead>
                <tr>
                    <th style="width: 4%;">No</th>
                    <th style="width: 14%;">Waktu &amp; Tanggal</th>
                    <th style="width: 8%;">Kode Guru</th>
                    <th style="width: 22%;">Nama Tenaga Pendidik</th>
                    <th style="width: 12%;">Status</th>
                    <th style="width: 15%;">Biometrik FaceNet</th>
                    <th style="width: 10%;">Telemetri</th>
                    <th style="width: 15%;">Keterangan</th>
                </tr>
            </thead>
            <tbody>
                @forelse($records as $index => $r)
                    @php
                        $st = strtolower($r->status ?? '');
                        $meta = $r->metadata ?? [];
                        $isSuccess = in_array($st, ['success', 'hadir']);
                        $isLate = $st === 'terlambat';
                        $isPulang = $st === 'pulang';
                        $isIzin = in_array($st, ['izin', 'sakit']);
                        $teacher = $r->user;
                    @endphp
                    <tr>
                        <td style="text-align: center; font-weight: 600;">{{ $index + 1 }}</td>
                        <td>
                            <div style="font-weight: 700; font-family: monospace;">
                                {{ $r->created_at ? $r->created_at->format('H:i:s') : '-' }} WIB
                            </div>
                            <div style="font-size: 8pt; color: #64748b;">
                                {{ $r->created_at ? $r->created_at->format('d/m/Y') : '-' }}
                            </div>
                        </td>
                        <td style="text-align: center; font-family: monospace; font-weight: 700;">
                            {{ $teacher->embedding_id ?? ($meta['subject_id'] ?? 'S00') }}
                        </td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;">{{ $teacher->name ?? 'Guru Presensi' }}</div>
                            <div style="font-size: 7.5pt; color: #64748b;">{{ $teacher->email ?? '-' }}</div>
                        </td>
                        <td style="text-align: center;">
                            @if($isSuccess)
                                <span class="badge badge-success">HADIR</span>
                            @elseif($isLate)
                                <span class="badge badge-warning">TERLAMBAT</span>
                            @elseif($isPulang)
                                <span class="badge badge-info">PULANG</span>
                            @elseif($isIzin)
                                <span class="badge badge-purple">{{ strtoupper($r->status) }}</span>
                            @else
                                <span class="badge badge-danger">{{ strtoupper($r->status ?: 'GAGAL') }}</span>
                            @endif
                        </td>
                        <td>
                            <div style="font-size: 8pt;">
                                <strong>L2:</strong> {{ isset($meta['euclidean_distance']) ? number_format($meta['euclidean_distance'], 3) : '-' }}
                                &bull;
                                <strong>PAD:</strong> {{ $meta['pad_pred'] ?? 'PASS' }}
                            </div>
                            <div style="font-size: 7.5pt; color: #64748b;">
                                Blinks: {{ $meta['ear_blinks'] ?? 0 }} | Mouth: {{ $meta['mar_mouths'] ?? 0 }}
                            </div>
                        </td>
                        <td style="font-size: 8pt; text-align: center;">
                            {{ $meta['distance_cm'] ?? 30 }} cm &bull; {{ $meta['lux'] ?? 300 }} Lux
                        </td>
                        <td style="font-size: 8pt; color: #334155;">
                            {{ $r->decision_reason ?: ($isSuccess ? 'Terverifikasi biometrik' : '-') }}
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 24px; color: #64748b;">
                            Tidak ada data presensi yang sesuai dengan kriteria filter.
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>

        <!-- Signature Section -->
        <div class="signature-section">
            <div class="signature-box">
                <div class="date-line">&nbsp;</div>
                <div class="role-line">Mengetahui,<br>Kepala Sekolah SMK Al-Madani</div>
                <div class="name-line">H. Erni Sulistiawati, S.Pd.</div>
                <div class="nip-line">NIP. 19750815 200501 2 004</div>
            </div>

            <div class="signature-box">
                <div class="date-line">Pontianak, {{ $printedDate }}</div>
                <div class="role-line">Petugas / Operator Sistem,<br>SMK Al-Madani Pontianak</div>
                <div class="name-line">{{ $user->name ?? 'Administrator' }}</div>
                <div class="nip-line">NUPTK / ID: {{ $user->id ?? 'ADM-01' }}</div>
            </div>
        </div>

        <!-- Footer Note -->
        <div class="footer-note">
            <span>Dokumen ini dicetak otomatis dari Sistem Presensi &amp; Verifikasi Wajah FaceNet + EMAR SMK Al-Madani Pontianak.</span>
            <span>Waktu Cetak: {{ $printedAt }}</span>
        </div>
    </div>

</body>
</html>
