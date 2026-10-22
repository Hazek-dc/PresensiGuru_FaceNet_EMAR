# Audit Tahap 1: PRD Orkestrasi 6 Agen (21 Oktober 2026)

Audit read-only atas PRD "Struktur Direktori Orkestrasi Claude Code" terhadap kode di branch `claude/charming-allen-en8oki` (main + PR #2). Lima auditor (satu per domain agen) menilai setiap butir PRD, lalu satu verifier per domain mencoba membantah setiap klaim konflik dengan membaca kode sendiri. Kolom "Verifikasi" berisi **lolos** bila verifier menemukan bukti yang mendukung, **dibantah** bila tidak, dan kosong untuk butir yang tidak diverifikasi karena dinilai bisa dikerjakan.

Nomor baris merujuk ke commit 6976b4f dan bisa bergeser. Rujukan keputusan D1-D11 ada di `CLAUDE.md` bagian 7.

## Ringkasan

| Verdict | Jumlah butir |
|---|---|
| Bisa dengan perubahan | 23 |
| Bertentangan dengan metodologi terkunci | 19 |
| Risiko integritas data | 15 |
| Keliru secara fakta | 9 |
| Sudah ada | 6 |
| Belum layak sekarang | 3 |
| Bisa sesuai PRD | 2 |

## frontend (Agen 1 frontend-mediapipe)

**Path PRD yang tidak ada di repo:**

- resources/js/Pages/Presensi/**/*.tsx (di root repo tidak ada folder resources/; yang nyata hanya attendance-web/resources/js/Pages/Presensi/Index.tsx)
- resources/js/hooks/useMediaPipeFaceMesh.ts (tidak ada; yang nyata attendance-web/resources/js/Hooks/useFaceLandmarker.ts, folder Hooks berhuruf kapital)
- resources/js/components/PadTestbenchPanel.tsx (tidak ada; panel terdekat attendance-web/resources/js/Components/Presensi/SoloBatchPanel.tsx)

**Berkas nyata wilayah agen:**

- `attendance-web/resources/js/Pages/Presensi/Index.tsx`: Halaman Studio/presensi: state subjek, target lux/jarak, mode solo, penyusunan FormData POST /presensi/verify (frame_series, target, challenge)
- `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx`: Pemindai: gerbang kualitas/jarak, hitung mundur 3 s, rekaman 8,0 s, tantangan acak, panduan suara, badge subjek, chip jarak/lux, deret EAR/MAR
- `attendance-web/resources/js/Components/Presensi/SoloBatchPanel.tsx`: Panel mode solo calibration_dev (sel sampel x lux x jarak, antrean repetisi)
- `attendance-web/resources/js/Hooks/useSoloBatch.ts`: State antrean solo + bunyi fase
- `attendance-web/resources/js/Hooks/useFaceLandmarker.ts`: MediaPipe FaceLandmarker (478 titik, numFaces 1), EAR/MAR per frame, throttling state 120 ms
- `attendance-web/resources/js/Utils/emarGeometry.ts`: EAR/MAR geometris, CycleCounter, ChallengeTracker, CHALLENGE_TIMEOUT_S
- `attendance-web/resources/js/Utils/soloSession.ts`: Konstanta P_DEV_01/calibration_dev, gerbang jarak solo, reducer antrean
- `attendance-web/resources/js/Utils/audioCue.ts`: Bunyi Web Audio mode solo
- `attendance-web/resources/js/Utils/faceDistance.ts`: Estimasi jarak antropometri tanpa kalibrasi + smoother EMA
- `attendance-web/resources/js/Utils/distanceCalibration.ts`: Model d = a/r + b (3 titik), DISTANCE_BANDS, pra-cek jarak; kembaran DistanceModel.php
- `attendance-web/resources/js/Utils/sensorReading.ts`: Aturan asal-usul bacaan: hasil ukur vs target, kesegaran 10 s
- `attendance-web/resources/js/Utils/testParameters.ts`: Kesesuaian hasil ukur dengan target jarak/lux
- `attendance-web/resources/js/Utils/luxMeasurement.ts`: Kategori lux <100/100-300/>300 dan fotometri kamera
- `attendance-web/resources/js/Utils/luxCalibration.ts`: classifyLighting/kategoriNaskah, probe lux terkalibrasi
- `attendance-web/resources/js/Utils/landmarkSmoothing.ts`: Indeks iris 468-477 dan smoother landmark
- `attendance-web/resources/js/Components/Presensi/DistanceMeterWidget.tsx`: Sumber jarak (kamera/sensor/preset target)
- `attendance-web/resources/js/Components/Presensi/LuxometerWidget.tsx`: Sumber lux (kamera/luxmeter/preset target), kalibrasi faktor kamera
- `attendance-web/resources/js/Components/Presensi/DistanceAutoCalibration.tsx`: Kalibrasi jarak 3 titik semi-otomatis dengan meteran
- `attendance-web/resources/js/Components/Presensi/CameraAutoCalibrationModal.tsx`: Modal kalibrasi jarak + lux (suara bawaan aktif)
- `attendance-web/resources/js/Components/Presensi/EMARLivenessMeter.tsx`: Meter EAR/MAR dengan progress bar; saat ini tidak dipakai
- `attendance-web/resources/js/Components/Presensi/QalwaniResearchPanel.tsx`: Panel riset: angka EAR/MAR live (tab Riset)
- `attendance-web/resources/js/Utils/__tests__/emarGeometry.test.ts`: Uji ChallengeTracker (timeout 4 s)
- `attendance-web/resources/js/Utils/__tests__/soloSession.test.ts`: Uji mode solo
- `attendance-web/resources/js/Utils/__tests__/distanceCalibration.test.ts`: Uji model jarak 3 titik
- `attendance-web/resources/js/Utils/__tests__/sensorReading.test.ts`: Uji pemisahan target vs hasil ukur

### F1a: F1: jarak pinhole dari iris Z_raw = (focal_length_px * 1.17) / iris_diameter_px dengan landmark iris 468 & 473

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak ada estimator iris dan tidak ada focal length di kode (grep 'focal' kosong). Jarak browser dihitung dari lebar wajah: tanpa kalibrasi pakai konstanta antropometri (IOD 70% + lebar pipi 30%) dan ditandai '~'/(estimasi); dengan kalibrasi pakai d = a/r + b dari pipi 234/454. FaceLandmarker (tasks-vision) dipakai dengan numFaces 1; kode memperlakukan keluaran sebagai 478 titik termasuk iris, jadi tidak ada opsi refineLandmarks yang perlu dinyalakan.
- **Konflik dan dampak:** 468 dan 473 adalah pusat iris mata kiri dan mata kanan (landmarkSmoothing.ts:82-87). Jarak 468 ke 473 adalah jarak antarpupil (sekitar 6 cm), bukan diameter iris 1,17 cm, sehingga rumus PRD meleset sekitar 5 kali sebelum dikoreksi faktor. Diameter iris harus diambil dari tepi iris satu mata (469-471 atau 474-476). focal_length_px tidak tersedia di kode/peramban, jadi harus diasumsikan atau dikalibrasi, dan hasilnya Z = k / iris_px, keluarga yang sama dengan a/r yang sudah ada tetapi tanpa offset b. Mengganti sumber jarak dari lebar pipi ke iris mengubah input gerbang jarak bona fide (soloSession.ts:110-124, FaceScannerContainer.tsx:851-858) dan angka distance_cm browser yang dicatat. Akibatnya presentasi lama dan baru tidak sebanding, dan karena model engine tetap lebar rahang dlib, distance_mismatch_cm akan bertambah. Hitungan ilustratif, bukan hasil ukur (FOV kamera tidak ada di kode): pada lebar 1280 px dan FOV horizontal 60-70 derajat, iris 1,17 cm di 60 cm hanya sekitar 18-22 px, jadi selisih 1 px setara kira-kira 5% atau 3 cm.
- **Bukti:**
  - `attendance-web/resources/js/Utils/faceDistance.ts:113`: `const K_INTEROCULAR = 4.55; // 30cm * 0.1517 iod ratio`
  - `attendance-web/resources/js/Utils/faceDistance.ts:150`: `const rawDistanceCm = (distFromIod * 0.70) + (distFromWidth * 0.30);`
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:7`: `model sendiri: d_cm = a / r + b, dicocokkan dengan kuadrat terkecil`
  - `attendance-web/resources/js/Hooks/useFaceLandmarker.ts:61`: `landmarkCount: 478,`
  - `attendance-web/resources/js/Hooks/useFaceLandmarker.ts:157`: `numFaces: 1,`
  - `attendance-web/resources/js/Utils/landmarkSmoothing.ts:80`: `Iris Landmark Indices (Left & Right Iris center and perimeter)`
  - `attendance-web/resources/js/Utils/landmarkSmoothing.ts:84`: `468, 469, 470, 471, 472,`
  - `attendance-web/resources/js/Utils/landmarkSmoothing.ts:86`: `473, 474, 475, 476, 477,`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Utils/faceDistance.ts:120`: Bila diinginkan sebagai pembanding: tambah fungsi irisDiameterPx(landmarks, videoW, videoH) yang memakai 469-471 dan 474-476 dalam piksel video (bukan 468/473). Hasilnya hanya untuk telemetri, bukan pengganti estimateFaceDistance/estimateFromRatio.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:808`: Jangan ganti sumber jarak gerbang. Kalaupun iris dicatat, kirim sebagai field terpisah (mis. browser_iris_px) di samping distance_cm yang ada. Validitasnya diuji dulu terhadap meteran di 30/45/60 lewat alur DistanceAutoCalibration.
- **Pertanyaan keputusan:** Estimator iris cukup dicatat sebagai telemetri pembanding, atau Anda ingin menggantikan model lebar wajah d = a/r + b? Menggantinya mengubah input gerbang jarak dan membuat data lama tidak sebanding.
- **Catatan verifier:** Klaim kondisi kode benar: tidak ada estimator iris maupun focal length. Jarak tanpa kalibrasi memakai fusi 70% IOD (sudut mata 33/133 dan 263/362, bukan iris) dan 30% lebar pipi. Jarak berkalibrasi memakai a/r + b dari pipi 234/454. FaceLandmarker dipakai dengan numFaces 1, keluarannya 478 titik, dan tidak punya opsi refineLandmarks. Ada beberapa koreksi. (1) Kode tidak menyatakan secara eksplisit bahwa 468/473 adalah pusat iris. landmarkSmoothing.ts hanya menulis 'center and perimeter' untuk himpunan 468-472 dan 473-477, jadi pernyataan '468/473 = pusat' berasal dari konvensi MediaPipe, bukan dari kode. (2) Vonis 'factually_wrong' bergantung pada tafsiran PRD. Frasa '468 & 473' bisa berarti 'iris kiri dan kanan' (dua iris), bukan jarak antara dua titik itu. Kesimpulan bahwa diameter tidak bisa dihitung dari dua titik pusat tetap benar, tetapi PRD lebih tepat disebut ambigu/kurang spesifik daripada pasti salah. (3) Kamera meminta ideal 1920x1080 dengan min 1280 (FaceScannerContainer.tsx:471-472). Contoh 1280 px dalam hitungan ilustratif adalah batas bawah. Pada 1920 px dengan asumsi FOV yang sama, iris kira-kira 27-32 px. Ini tetap ilustrasi yang belum diukur. (4) Delegate GPU punya fallback CPU (useFaceLandmarker.ts:176), juga dengan numFaces 1.

### F1b: F1: tombol 'Kalibrasi ke Target Aktif' yang menyimpan calibrationFactor = targetCm / Z_raw di localStorage (1 titik, contoh 45/49.3 = 0.9128) dan lencana 'Terkalibrasi (Hijau)'

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Yang sudah ada adalah kalibrasi 3 titik (30/45/60 cm diukur meteran) dengan kuadrat terkecil d = a/r + b. Kalibrasi ditolak bila rasio tidak menurun atau residu maksimum > 3,0 cm. Hasilnya disimpan di server per label kamera dan resolusi, dan id kalibrasi ikut tiap presentasi. Backend menurunkan klaim camera_calibrated tanpa id yang sah menjadi 'camera'. Chip jarak hijau berarti 'di dalam rentang', bukan 'terkalibrasi'. Tanda tanpa kalibrasi adalah '~' dan '(estimasi)'. Tombol/lencana PRD tidak ditemukan di kode maupun bundel build.
- **Konflik dan dampak:** 'Kalibrasi ke Target Aktif' menganggap subjek tepat di target tanpa meteran, lalu memaksa estimasi sama dengan target. Sesudahnya, jarak 'terukur' di titik itu adalah target yang disalin, bukan hasil ukur (thesis-guard.md:24, preset target dicatat sebagai hasil ukur). Satu titik tidak punya residu, sehingga kesalahan model di 30 dan 60 cm tidak terdeteksi; model 3 titik yang ada menolak residu > 3,0 cm. Toleransi PRD ±2,0 cm bahkan lebih ketat dari ketelitian model yang diizinkan (3,0 cm). Faktor di localStorage berlaku per peramban dan tidak punya id server, sehingga backend akan mencatatnya sebagai 'camera' (estimasi tak terkalibrasi) sementara UI menampilkan 'Terkalibrasi (Hijau)'. Tampilan dan data saling bertentangan, dan naskah bisa salah melaporkan sumber jarak.
- **Bukti:**
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:36`: `export const DEFAULT_MAX_RESIDUAL_CM = 3.0;`
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:211`: `if (maxResidual > maxResidualCm) {`
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:458`: `if (calibration.camera_label && camera.label && normalizeLabel(calibration.camera_label) !== normalizeLabel(camera.label)) {`
  - `attendance-web/resources/js/Components/Presensi/DistanceAutoCalibration.tsx:78`: `Ukur dengan meteran, lalu tatap kamera dan diam.`
  - `attendance-web/config/biometrics.php:46`: `'calibration_max_residual_cm' => (float) env('BIOMETRICS_CALIBRATION_MAX_RESIDUAL_CM', 3.0),`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:813`: `sensors.distanceSubmitReading?.source === 'camera_calibrated' ? sensors.activeCalibrationId : null;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:1097`: `$browserSource = 'camera';`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1589`: ``${liveDistanceSource === 'camera' ? '~' : ''}${liveDistanceCm.toFixed(1)} cm``
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1566`: Tanpa kalibrasi baru: tambahkan teks eksplisit di chip jarak, mis. 'Kalibrasi #id' bila calibratedModel (baris 189) ada dan 'Belum dikalibrasi' bila tidak, agar status terbaca dari 60 cm. Warna hijau tetap berarti di dalam rentang.
  - `attendance-web/resources/js/Components/Presensi/SoloBatchPanel.tsx:71`: Pesan blocker yang sudah ada ('Bona fide butuh kalibrasi jarak kamera ini') diberi tautan atau tombol pembuka DistanceAutoCalibration (3 titik, meteran), bukan kalibrasi 1 titik.
- **Pertanyaan keputusan:** Setuju tetap memakai kalibrasi 3 titik yang ada (meteran, residu ≤ 3,0 cm, tersimpan di server dengan id) dan tidak menambah faktor 1 titik di localStorage?
- **Catatan verifier:** Inti klaim benar. Kalibrasi 3 titik memakai kuadrat terkecil dengan residu maksimum 3,0 cm, berlaku per label kamera dan aspek, dan backend menurunkan klaim camera_calibrated tanpa id yang sah menjadi 'camera'. Tombol 'Kalibrasi ke Target Aktif' dan lencana 'Terkalibrasi' tidak ditemukan di sumber maupun bundel. Ada beberapa koreksi. (1) Status kalibrasi sudah ditampilkan di chip jarak, hanya lewat tooltip: title berisi 'Jarak dari kamera terkalibrasi (kalibrasi #id)', dan tanda '~' hilang bila terkalibrasi. Usulan 'Kalibrasi #id' tinggal menjadikannya teks yang terlihat. (2) Id kalibrasi tidak ikut di 'tiap presentasi'. Id hanya ikut bila sumber bacaan jarak = camera_calibrated (Index.tsx:812-813). (3) Backend mendahulukan jarak mesin ('engine') bila kalibrasi server punya model engine yang cocok. Faktor localStorage baru tercatat sebagai 'camera' bila jarak mesin tidak tersedia; selain itu nilainya hanya muncul di payload dan distance_mismatch_cm. (4) Pola faktor kalibrasi di localStorage sudah ada untuk lux (saveLuxCalibration/loadLuxCalibration). Pola itu mungkin menjadi rujukan PRD, tetapi tidak ada padanannya untuk jarak.

### F1c: F1: toleransi valid ±2,0 cm dari target (target 45 -> 43-47 cm)

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Rentang sah terkunci 30-40 / 45-55 / 60-70 cm, inklusif, dan dicerminkan di frontend. Gerbang mode solo untuk bona fide hanya meloloskan rentang milik target.
- **Konflik dan dampak:** ±2,0 cm di sekitar target tidak sama dengan DISTANCE_BANDS (Subbab 5.2). Contohnya, 43-44,9 cm sah menurut PRD tetapi berada di celah antarrentang (tidak sah) menurut naskah, sedangkan 47,1-55 cm sah menurut naskah tetapi ditolak PRD. Mengubah toleransi gerbang mengubah presentasi mana yang direkam dan definisi kondisi jarak di naskah. Perubahan ini juga harus disamakan di DistanceModel.php, parameter_penelitian.py, testParameters.ts, dan soloSession.ts.
- **Bukti:**
  - `parameter_penelitian.py:75`: `45: (45.0, 55.0),`
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:31`: `{ category: 'IDEAL', target_cm: 45, min_cm: 45, max_cm: 55, label: 'Ideal' },`
  - `attendance-web/resources/js/Utils/soloSession.ts:117`: `if (cm >= band.min_cm && cm <= band.max_cm) {`
  - `attendance-web/resources/js/Utils/testParameters.ts:10`: `[45, 55],`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:29`: Tidak diubah. Bila peneliti menyetujui definisi baru, perubahan dimulai dari parameter_penelitian.py:73-77 lalu dicerminkan ke DistanceModel.php, distanceCalibration.ts:29-33, testParameters.ts:8-12, dan naskah Subbab 5.2.
- **Pertanyaan keputusan:** Rentang sah jarak tetap 30-40/45-55/60-70 cm seperti parameter terkunci, atau Anda menyetujui perubahan ke target ±2 cm (definisi kondisi di Subbab 5.2 ikut berubah)?
- **Catatan verifier:** Benar. Rentang 30-40/45-55/60-70 inklusif identik di parameter_penelitian.py, distanceCalibration.ts, testParameters.ts, DistanceModel.php, dan gerbang solo. Satu hal yang terlewat: rentang itu asimetris karena target adalah batas bawah. Akibatnya, untuk ketiga target, separuh toleransi ±2 cm jatuh di zona tidak sah (28-29,9; 43-44,9; 58-59,9 cm), bukan hanya untuk target 45. Panduan 'Mundur/Maju' di gerbang solo juga bergantung pada band.min_cm/max_cm, jadi teksnya ikut berubah bila definisi diganti.

### F2: F2: input wajib 'Lux Meter Fisik (lux)' + kategori otomatis (<100 Redup, 100-300 Standar, >300 Terang)

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Kategori otomatis sudah ada dengan batas yang sama dengan parameter terkunci. Bacaan luxmeter per presentasi hanya diterima dari sidecar /api/lux/current: harus is_measured, umur ≤ 10 s, dan sumber preset/tune/default/fallback ditolak. Mode manual hanya menetapkan target, dan lux presensi dikirim kosong. Input angka luxmeter fisik yang ada dipakai untuk kalibrasi faktor kamera, bukan sebagai hasil ukur per presentasi. Panel solo hanya memilih kategori target. Backend calibration_dev mewajibkan lux_target, bukan lux terukur.
- **Konflik dan dampak:** Batas kategori tidak bertentangan dengan parameter. Ada tiga hal yang perlu ditetapkan. (1) Angka yang diketik operator adalah hasil ukur hanya bila memang dibaca dari luxmeter di posisi wajah saat itu, jadi butuh sumber tersendiri ('luxmeter_manual'), bukan 'luxmeter' sidecar, agar asal-usulnya tidak dilebihkan. (2) Aturan kesegaran 10 s membuat satu bacaan per sel kedaluwarsa sebelum repetisi berikutnya, padahal di mode solo operator tidak bisa mengetik tiap repetisi dari 60 cm. Masa berlaku per sel harus diputuskan. (3) Backend menolak sumber baru (whitelist LUX_SOURCES); perubahan ini lintas domain. Label 'Standar' di UI setara 'normal' di naskah dan parameter (kosmetik).
- **Bukti:**
  - `attendance-web/resources/js/Utils/luxMeasurement.ts:97`: `// Subbab 5.2: redup < 100, standar 100 - 300 (inklusif), terang > 300`
  - `attendance-web/resources/js/Utils/luxCalibration.ts:43`: `kategoriNaskah: v < 100 ? 'redup' : v <= 300 ? 'normal' : 'terang'`
  - `parameter_penelitian.py:51`: `LUX_NORMAL_MAX = 300.0 # normal : 100 <= lux <= 300 ; terang : lux > 300`
  - `attendance-web/resources/js/Components/Presensi/LuxometerWidget.tsx:261`: `// Preset hanya menetapkan target skenario uji. Tidak dikirim ke /api/lux/update`
  - `attendance-web/resources/js/Components/Presensi/LuxometerWidget.tsx:475`: `Masukkan angka pembacaan dari luxmeter fisik Anda saat ini untuk mengunci kalibrasi kamera`
  - `attendance-web/resources/js/Utils/sensorReading.ts:11`: `export const SENSOR_MAX_AGE_S = 10;`
  - `attendance-web/resources/js/Utils/sensorReading.ts:64`: `const NON_MEASUREMENT_SOURCE = /preset\|tune\|default\|fallback/i;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:35`: `private const LUX_SOURCES = ['luxmeter', 'camera', 'camera_calibrated'];`
  - `attendance-web/resources/js/Utils/soloSession.ts:31`: `export const SOLO_LUX_TARGETS: Record<SoloLuxLevel, number> = { redup: 75, normal: 300, terang: 650 };`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/SoloBatchPanel.tsx:147`: Tambah input 'Bacaan luxmeter fisik (lux)' per sel, kosong secara bawaan, disimpan bersama waktu baca dan direset saat sel berganti. Tampilkan kategori via classifyLighting(...).kategoriNaskah dan peringatan bila tidak sama dengan kategori target (checkLuxTarget di testParameters.ts:196).
  - `attendance-web/resources/js/Components/Presensi/SoloBatchPanel.tsx:213`: Bila peneliti memutuskan 'wajib': tombol Mulai antrean dinonaktifkan sampai bacaan diisi (hanya mode solo, tidak untuk kiosk guru).
  - `attendance-web/resources/js/Utils/sensorReading.ts:14`: Tambah LuxSource 'luxmeter_manual' dengan aturan masa berlaku per sel, terpisah dari SENSOR_MAX_AGE_S.
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:842`: Di blok soloTrial, kirim lux_value + lux_source='luxmeter_manual' hanya bila bacaan diisi. Jangan pernah diisi dari SOLO_LUX_TARGETS.
  - `attendance-web/app/Http/Controllers/PresensiController.php:35`: (Domain backend) tambah 'luxmeter_manual' ke LUX_SOURCES beserta kolom ekspor/metadata.
- **Pertanyaan keputusan:** Apakah bacaan luxmeter fisik wajib per sel di mode solo saja (bukan kiosk), berapa lama satu bacaan berlaku (satu sel/N menit), dan apakah ia mengalahkan estimasi kamera saat dicatat?

### F3: F3: toggle 'Kunci Ukuran Meteran = Target Skenario' yang mengisi 'Jarak Meteran Fisik' otomatis 30/45/60 agar 'Validasi Setup' hijau (masalah: 'Meteran: belum diisi (tidak masuk rekap)')

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Panel 'Mode Uji Mandiri PAD & Jarak', kolom 'Jarak Meteran Fisik', 'Validasi Setup', dan status 'Meteran: belum diisi (tidak masuk rekap)' tidak ada di sumber maupun bundel build. Kode sengaja memisahkan target dari hasil ukur: preset hanya menjadi distance_target_cm, sedangkan distance_cm hanya dari sensor/kamera segar. Mode solo mengirim distance_target_cm dari sel, dan untuk serangan jarak mengikuti penanda lantai tanpa gerbang. Rekap calibration_dev mengelompokkan presentasi berdasarkan TARGET, jadi presentasi tanpa jarak terukur tetap masuk rekap.
- **Konflik dan dampak:** Mengisi 'jarak meteran' otomatis dari target sama dengan mencatat target sebagai hasil ukur, pola yang dilarang thesis-guard. Dampaknya: distance_target_met selalu true dengan sendirinya, kolom jarak tidak bisa lagi menangkap subjek yang bergeser dari penanda, dan bila nilainya masuk distance_cm akan diteruskan ke mesin (PresensiController.php:248) serta ke ekspor. Naskah akan melaporkan 'jarak terukur' yang sebenarnya target. Premis PRD juga tidak sesuai kode: tidak ada status 'Meteran' dan analisis tidak membuang presentasi tanpa jarak terukur (pengelompokan memakai target).
- **Bukti:**
  - `attendance-web/resources/js/Utils/sensorReading.ts:7`: `estimasi kamera di browser. Preset, angka dari query string, dan bacaan basi`
  - `attendance-web/resources/js/Utils/sensorReading.ts:181`: `if (distanceTarget !== null && Number.isFinite(distanceTarget)) {`
  - `attendance-web/resources/js/Components/Presensi/DistanceMeterWidget.tsx:136`: `// Preset hanya menetapkan target skenario uji. Tidak dikirim ke`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:846`: `formData.set('distance_target_cm', String(soloTrial.distanceCm));`
  - `attendance-web/resources/js/Utils/soloSession.ts:97`: `Serangan: jarak dari lebar wajah mengukur ukuran wajah di foto/layar`
  - `scripts/analisis_kalibrasi_dev.py:129`: `distance_target = _float(row.get("Target Jarak Skenario (cm)", ""))`
  - `.claude/agents/thesis-guard.md:24`: `or preset targets recorded as measurements`
  - `attendance-web/app/Http/Controllers/PresensiController.php:248`: `] + array_filter(['distance_cm' => $browserDistanceCm, 'lux' => $luxValue], fn ($v) => $v !== null);`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/SoloBatchPanel.tsx:167`: Jangan tambah toggle. Bila perlu bukti setup, tambahkan konfirmasi operator terpisah 'Penanda lantai {target} cm sudah diukur dengan meteran' (boolean, default tidak dicentang).
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:842`: Kirim konfirmasi itu dengan nama field sendiri (mis. distance_marker_confirmed), bukan distance_cm/distance_source. Bila operator benar-benar mengukur, input angka manual dengan sumber 'tape_manual' harus kosong bawaan dan tidak pernah diisi otomatis (validasi backend di luar domain ini).
- **Pertanyaan keputusan:** Untuk bukti kondisi jarak, cukup konfirmasi operator bahwa penanda lantai sudah diukur (field terpisah), atau perlu angka meteran manual per sel? Keduanya tidak boleh diisi otomatis dari target.
- **Catatan verifier:** Benar. Panel dan kolom yang disebut PRD tidak ada. Preset hanya menjadi distance_target_cm. Mode solo mengirim target dari sel. Analisis mengelompokkan presentasi menurut target, dan measured() hanya menyaring FTA, mesin tidak tersedia, atau L2 kosong; tidak ada saringan jarak terukur. Ada dua koreksi. (1) 'distance_target_met selalu true' hanya berlaku bila nilai isian otomatis menjadi distance_cm yang dicatat. recordedDistance mendahulukan jarak engine bila kalibrasi server punya model engine yang cocok. Dalam kasus itu nilai isian otomatis hanya masuk payload ke mesin (baris 248) dan distance_mismatch_cm. (2) UI sudah memuat bukti pemisahan yang disengaja: DistanceMeterWidget menampilkan 'Preset hanya menetapkan target uji. Jarak presensi dikirim kosong.'

### F4: F4: countdown 3 detik + audio beep sebelum jendela 8,0 s

- **Verdict:** Sudah ada (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Sudah ada. Hitung mundur 3 s berjalan sebelum rekaman 8 s dan dibatalkan bila posisi keluar rentang. Di mode solo ada bunyi 'countdown' (880 Hz) saat hitung mundur mulai dan bunyi 'record' saat perekaman mulai. Di luar mode solo hanya ada panduan suara TTS bila diaktifkan. Bunyi solo hanya satu kali di awal, tidak tiap detik.
- **Konflik dan dampak:** Tidak ada konflik. Hitung mundur berlangsung sebelum perekaman, sehingga OBSERVATION_WINDOW_S = 8,0 dan video ke mesin tidak berubah. Probe lux mengunci eksposur sesaat di awal hitung mundur (FaceScannerContainer.tsx:228-230, 261-263); bunyi tidak memengaruhinya.
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:143`: `const COUNTDOWN_TOTAL_SEC = 3; // 3 seconds pre-scan countdown`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:144`: `const SCAN_DURATION_MS = 8000; // Jendela observasi pasif 8,0 s (Tabel 5.2)`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1049`: `start8SecondScan();`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:770`: `if (stage === 'COUNTDOWN') playCue('countdown');`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:1649`: `onStageChange={soloCell ? handleSoloStage : undefined}`
  - `attendance-web/resources/js/Utils/audioCue.ts:13`: `countdown: [[880, 150]],`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1028`: Opsional: tambah prop onCountdownTick(n) yang dipanggil tiap detik di interval hitung mundur.
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:769`: Opsional: putar playCue('countdown') tiap tick (3-2-1) saat soloCell aktif.
- **Catatan verifier:** Benar. Hitung mundur 3 s berjalan sebelum MediaRecorder 8000 ms. Di mode solo, bunyi 'countdown' (880 Hz) diputar sekali saat tahap COUNTDOWN dan 'record' saat SCANNING_8S. Probe lux berjalan di awal COUNTDOWN. Ada satu koreksi kecil: pembatalan hitung mundur karena posisi keluar rentang hanya terjadi bila distanceBlocked true. Kondisi itu hanya muncul bila ada kalibrasi (distancePrecheck: blocked = calibrated && ...) atau pada gerbang solo untuk bona fide berkalibrasi. Tanpa kalibrasi, jarak tidak membatalkan hitung mundur. Bunyi solo lain (rest/resume/done/error) berasal dari useSoloBatch, tidak ada yang per detik.

### F5: F5: timeout tantangan KEDIPKAN MATA/BUKA MULUT dari 4,0 s menjadi 7,0 s dalam jendela 8,0 s

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** CHALLENGE_TIMEOUT_S = 4,0 di browser, sama dengan modul Python active_liveness.py. Tantangan acak muncul pada T ≥ 1,0 s. Status yang masih WAITING saat rekaman berhenti dicatat sebagai REJECT_TIMEOUT. Keputusan PAD (S2) di backend diambil dari challenge_status browser. Di mode solo, instruksi tantangan hanya berupa teks kecil (11-12 px) dan TTS speakGuidance yang MATI secara bawaan (localStorage 'presensi_voice_guidance' harus 'true'). Bunyi 'record' tidak memberi tahu jenis tantangan. Sebagai pembanding, modal kalibrasi justru menyalakan suara secara bawaan.
- **Konflik dan dampak:** Timeout 4,0 s adalah ambang waktu tantangan yang dipakai browser dan modul Python. Aturan mdc melarang mengubah timing threshold tanpa persetujuan eksplisit. Karena PAD S2 diputuskan dari status tantangan browser, mengubah timeout langsung mengubah keputusan PAD. Logika ChallengeTracker identik sampai batas waktu: setiap urutan yang lolos dalam 4 s juga lolos dalam 7 s. Maka APCER semua spesies PAI hanya bisa tetap atau naik, dan BPCER hanya bisa tetap atau turun. replay_video paling terdampak, karena BLINK sudah lolos pada satu frame EAR < 0,20 setelah mata terbuka (emarGeometry.ts:136-139), sehingga kedipan alami di video replay lebih mungkin jatuh dalam 7 s. Tantangan muncul pada T ≥ 1,0 s, jadi timeout 7,0 s jatuh tepat di akhir rekaman 8,0 s (baris 1005-1007): batas waktunya praktis hilang. Data calibration_dev dengan 7 s juga tidak mewakili protokol TEST 4 s, sehingga ambang yang dikalibrasi darinya tidak sebanding. Penyebab timeout saat uji seorang diri lebih mungkin soal persepsi instruksi: dari 60 cm teks 11-12 px sulit dibaca, TTS mati secara bawaan, dan tidak ada bunyi yang membedakan BLINK dari OPEN_MOUTH. Teks '4 detik' juga tertanam di FaceScannerContainer.tsx:782, 1787, 1793, PresensiController.php:389, dan uji emarGeometry.test.ts:110-127.
- **Bukti:**
  - `attendance-web/resources/js/Utils/emarGeometry.ts:96`: `export const CHALLENGE_TIMEOUT_S = 4.0;`
  - `active_liveness.py:13`: `Fase 3: Jendela Observasi Spesifik (T=2s s.d T=5s, timeout 4.0s):`
  - `active_liveness.py:38`: `def __init__(self, timeout_seconds: float = 4.0):`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:949`: `if (elapsedSec >= 1.0 && !activeChallengeRef.current) {`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:986`: `? 'REJECT_TIMEOUT'`
  - `attendance-web/app/Http/Controllers/PresensiController.php:329`: `$isLivenessValid = ($challengeStatus === 'PASS_LIVENESS');`
  - `attendance-web/app/Http/Controllers/PresensiController.php:335`: `$padPred = $isLivenessValid ? 'BONA_FIDE' : 'ATTACK';`
  - `attendance-web/resources/js/Utils/emarGeometry.ts:137`: `else if (this.seenEyesOpen) {`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:326`: `return localStorage.getItem('presensi_voice_guidance') === 'true';`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:351`: `if (!isVoiceEnabled \|\| typeof window === 'undefined' \|\| !('speechSynthesis' in window)) return;`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1766`: `<p className="text-[11px] sm:text-xs font-black tracking-wide uppercase text-white drop-shadow">`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:771`: `else if (stage === 'SCANNING_8S') playCue('record');`
  - `attendance-web/resources/js/Components/Presensi/CameraAutoCalibrationModal.tsx:48`: `const [voice, setVoice] = useState(true);`
  - `.cursor/rules/thesis-methodology.mdc:12`: `Do not introduce, replace, or tune FaceNet, EAR, MAR, blink, or timing thresholds without explicit approval.`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Utils/audioCue.ts:9`: Tanpa mengubah 4,0 s: tambah CueName 'challenge_blink' dan 'challenge_mouth' dengan pola yang jelas berbeda (mis. dua nada tinggi pendek vs satu nada rendah panjang).
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:958`: Panggil prop baru onChallengeIssued(ch) saat tantangan dibuat. Index.tsx:769-772 memutar cue sesuai jenis bila soloCell aktif. Bunyi kode lebih cepat dari ucapan TTS (perkiraan 1-2 s, belum diukur) yang memakan jendela 4 s.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:324`: Dalam mode solo (prop), nyalakan panduan suara secara bawaan atau tampilkan peringatan bila mati.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1748`: Perbesar banner tantangan di mode solo (ikon dan teks besar) agar terbaca dari 60 cm.
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:836`: Catat mode isyarat yang aktif (suara/bunyi/teks) di metadata presentasi agar analisis bisa memisahkan data sebelum dan sesudah perbaikan.
  - `parameter_penelitian.py:35`: Hanya bila peneliti menyetujui 7,0 s: tambah konstanta bernama (mis. CHALLENGE_TIMEOUT_S), lalu samakan active_liveness.py:38, emarGeometry.ts:96, label UI 782/1787/1793, PresensiController.php:389, uji emarGeometry.test.ts:110-127 dan BiometricDecisionGateTest.php:334, serta catat challenge_timeout_s per presentasi.
- **Pertanyaan keputusan:** Tetap 4,0 s sambil memperbaiki keterlihatan/keterdengaran instruksi di mode solo? Atau ubah ambang waktu terkunci ke 7,0 s, dengan konsekuensi APCER (terutama replay) tidak bisa turun dan data lama tidak sebanding?
- **Catatan verifier:** Inti klaim benar. CHALLENGE_TIMEOUT_S = 4,0 dan tantangan muncul pada T ≥ 1,0 s. Status WAITING saat rekaman berhenti menjadi REJECT_TIMEOUT. PAD S2 di backend = (challenge_status === 'PASS_LIVENESS'). TTS mati secara bawaan, sedangkan modal kalibrasi menyalakan suara secara bawaan. Dengan 7,0 s, batas waktu jatuh sekitar 8,0 s, kira-kira bersamaan dengan stop rekaman. Argumen monoton APCER/BPCER sahih karena tracker deterministik sampai batas waktu. Ada beberapa koreksi. (1) Logika Python ActiveLivenessEMAR TIDAK sama dengan ChallengeTracker browser; kesamaannya hanya nilai timeout 4,0. Di Python, BLINK lolos pada satu frame EAR<0,20 & MAR<0,10 tanpa transisi mata terbuka, dan MAR≥0,10 langsung REJECT_WRONG_ACTION. Di browser, BLINK butuh transisi mata terbuka lalu tertutup, dan aksi salah butuh tahan 0,6 s. (2) Daftar tempat yang harus disamakan bila timeout diubah melewatkan live_inference_pad.py, yang memuat ActiveLivenessEMAR(timeout_seconds=4.0) di baris 853, 960, 984, 1305, 1331, dan 1355. (3) Nilai 4,0 tidak ada di parameter_penelitian.py. Statusnya sebagai parameter terkunci berasal dari aturan mdc:12 ('timing thresholds'), bukan dari berkas parameter. (4) tracker.update hanya dipanggil pada frame berwajah. Akibatnya REJECT_TIMEOUT di onstop juga mencakup kasus wajah hilang, bukan hanya tidak ada respons. (5) Banner punya ikon Eye/Smile 16-20 px selain teks 11-12 px, jadi bukan 'hanya teks'. Meski begitu, ukurannya tetap kecil untuk dibaca dari 60 cm. Dugaan bahwa penyebab timeout adalah persepsi instruksi adalah hipotesis, bukan bukti kode.

### F6: F6: tampilkan EAR: 0.xxx (Target <= 0.20) dan MAR: 0.xxx (Target >= 0.10) real-time + progress bar di samping badge Kedip: Nx / Mulut: Nx

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Overlay pindai hanya menampilkan jumlah siklus Kedip/Mulut dan waktu. Angka EAR/MAR live ada di QalwaniResearchPanel pada tab Riset, hanya untuk subjek Qalwani/admin dan tanpa progress bar. EMARLivenessMeter.tsx (dengan progress bar) ada tetapi tidak dipakai di mana pun dan menyalin ambang sendiri. State EAR/MAR di halaman bernilai awal 0 sebelum ada pengukuran.
- **Konflik dan dampak:** Label PRD 'Target <= 0.20' salah. Aturan terkunci adalah EAR < 0,20 (ketat), jadi EAR tepat 0,200 bukan kedip; MAR >= 0,10 sudah benar. Angka yang ditampilkan adalah EAR MediaPipe di browser, bukan EAR dlib mesin, dan perlu dilabeli demikian. Risiko metodologi: menampilkan EAR/MAR mentah ke subjek saat merekam calibration_dev memberi umpan balik visual. Peneliti bisa terdorong melebih-lebihkan kedipan atau bukaan mulut agar melewati bar, sehingga distribusi EAR/MAR untuk kalibrasi ambang tidak mewakili subjek uji yang tidak melihat meter. Nilai 0 sebelum ada pengukuran juga tidak boleh tampil sebagai 0.000.
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1829`: `<span>Kedip: <strong className="font-mono text-white">{earBlinksCount}x</strong></span>`
  - `attendance-web/resources/js/Components/Presensi/QalwaniResearchPanel.tsx:113`: `value={ear.toFixed(3)}`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:2090`: `{isQalwaniSubject && (`
  - `attendance-web/resources/js/Components/Presensi/EMARLivenessMeter.tsx:12`: `const EAR_THRESH = 0.20;`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:698`: `const [ear, setEar] = useState(0);`
  - `attendance-web/resources/js/Utils/emarGeometry.ts:15`: `/** Mata tertutup jika EAR < 0,20 (Tabel 5.2). */`
  - `parameter_penelitian.py:32`: `EAR_BLINK_THRESHOLD = 0.20 # mata tertutup jika EAR < 0,20`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1821`: Tambah chip 'EAR 0.xxx (< 0.20)' dan 'MAR 0.xxx (≥ 0.10)' dari geometricEar/geometricMar (baris 381-382), tampil '–' bila null, memakai EAR_BLINK_THRESHOLD/MAR_OPEN_THRESHOLD yang sudah diimpor (baris 40-41). Dipasang di balik prop showLiveRatios yang default false.
  - `attendance-web/resources/js/Components/Presensi/EMARLivenessMeter.tsx:12`: Bila dipakai ulang untuk progress bar, ganti konstanta EAR_THRESH/MAR_THRESH dengan impor dari Utils/emarGeometry.ts dan terima ear/mar bertipe number \| null.
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:698`: Ubah state ear/mar menjadi number \| null (awal null) agar nilai yang belum diukur tidak tampil sebagai 0.
- **Pertanyaan keputusan:** Bolehkah angka EAR/MAR live terlihat oleh subjek selama perekaman calibration_dev, atau hanya ditampilkan setelah jendela 8 s/di tab operator agar perilaku kedip tidak terpengaruh?

### F7: F7: ganti badge subjek yang memuat nama pribadi/emb_TEST-...-001 menjadi P_DEV_01

- **Verdict:** Sudah ada (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Sudah dilakukan untuk mode solo: subjectId dan kioskId dikunci ke P_DEV_01, dan form mengirim participant_id/subject_id = P_DEV_01. Badge menampilkan subjectId yang memang diklaim ke mesin. 'emb_TEST-QALWANI-001' muncul di luar mode solo karena embedding_id akun admin. Nama pribadi muncul di kartu identitas sidebar, bukan di badge. Badge dan state halaman memakai fallback 'S01' bila tidak ada subjek.
- **Konflik dan dampak:** Di luar mode solo, mengganti badge menjadi P_DEV_01 membuat tampilan berbeda dari identitas yang diklaim. Mengganti subject_id-nya mengubah klaim verifikasi 1:1 ke mesin, sehingga hasil identitas berubah. Fallback 'S01' (Index.tsx:490, FaceScannerContainer.tsx:1536/1539) mengisi identitas yang tidak dipilih dengan subjek nyata S01 (pola nilai bawaan karangan). Nama/email pribadi di sidebar dapat ikut terekam bila layar direkam saat uji mandiri.
- **Bukti:**
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:753`: `setSubjectId(SOLO_PARTICIPANT_ID);`
  - `attendance-web/resources/js/Utils/soloSession.ts:11`: `export const SOLO_PARTICIPANT_ID = 'P_DEV_01';`
  - `attendance-web/resources/js/Utils/soloSession.ts:82`: `['subject_id', SOLO_PARTICIPANT_ID],`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1539`: `{scenarioParams?.subject_id \|\| 'S01'}`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:490`: `'S01',`
  - `attendance-web/database/seeders/AdminQalwaniSeeder.php:26`: `'embedding_id' => 'emb_TEST-QALWANI-001',`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:1827`: `{user.name}`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:800`: `formData.append('subject_id', subjectId);`
  - `attendance-web/app/Http/Controllers/PresensiController.php:244`: `'claimed_id' => $cleanSubjectId,`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1536`: Ganti fallback 'S01' pada title dan isi badge dengan teks 'Subjek belum dipilih'.
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:1819`: Saat soloCell aktif, sembunyikan user.name/user.email di kartu identitas dan tampilkan P_DEV_01 saja. subject_id di luar mode solo tidak diubah.
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:490`: Perlu keputusan terpisah: fallback 'S01' sebagai klaim identitas bawaan (dipakai mode kiosk) sebaiknya diganti string kosong yang memblokir pengiriman sampai subjek dipilih.
- **Catatan verifier:** Sebagian besar benar. Saat sel solo aktif, subjectId dan kioskId di-set ke P_DEV_01, dan soloFormFields menimpa subject_id/participant_id. Badge pemindai menampilkan scenarioParams.subject_id = subjectId, dengan fallback 'S01'. Koreksi penting: emb_TEST-QALWANI-001 TETAP muncul di mode solo, tidak hanya di luar mode solo. Mode tetap 'personal' bila admin login (setMode tidak dipanggil oleh solo). Kartu identitas sidebar lalu menampilkan user.name, user.email, dan chip 'Terdaftar ({user.embedding_id})' di samping lencana subjectId P_DEV_01 pada judul kartu, sehingga tampilan saling bertentangan. Usulan menyembunyikan identitas di baris 1819 juga harus mencakup chip embedding_id. Pengecekan 'personal' di sidebar tidak berubah oleh mode solo.

### F8a: F8: payload raw_frames_telemetry[] (frame_idx, timestamp_ms, client_ear, client_mar, est_distance_cm)

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Sebagian sudah ada. frameSeries [t_ms, ear, mar] dikumpulkan hanya saat mode solo (collectFrameSeries = soloCell !== null), dikirim sebagai frame_series, lalu ditulis backend ke log_raw_frames_dev.csv dengan kolom frame_idx, t_ms, raw_ear, raw_mar. Backend hanya menerima frame berisi tepat 3 elemen. Tidak ada est_distance_cm per frame. Deret diambil per pembaruan state React (berkala ≤ 120 ms atau saat melintasi ambang), bukan per frame video.
- **Konflik dan dampak:** Menambah elemen ke tiap frame tanpa mengubah validator backend membuat SELURUH frame dibuang (count === 3), dan log hilang hanya dengan warning. 'frame_idx' saat ini adalah indeks pembaruan state, bukan indeks frame kamera; menyebutnya per frame video melebih-lebihkan resolusi data. est_distance_cm pada sampel serangan mengukur ukuran wajah di foto/layar, bukan jarak artefak (soloSession.ts:97-99), jadi harus kosong atau ditandai untuk ATTACK. Jarak live adalah hasil EMA, bukan mentah, dan sifat itu harus dicatat. Selama hanya dicatat, keputusan tidak berubah. Perubahan backend di luar domain frontend.
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:84`: `/** [ms sejak awal rekaman, EAR, MAR] tiap pembaruan landmark; hanya bila collectFrameSeries. */`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:746`: `frameSeriesRef.current.push([`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:848`: `formData.set('frame_series', JSON.stringify(scanMetrics.frameSeries));`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:1650`: `collectFrameSeries={soloCell !== null}`
  - `attendance-web/app/Http/Controllers/PresensiController.php:847`: `if (is_array($frame) && count($frame) === 3 && array_is_list($frame)`
  - `attendance-web/app/Http/Controllers/PresensiController.php:878`: `'frame_idx', 't_ms', 'raw_ear', 'raw_mar', 'trial_l2_dist', 'landmark_source',`
  - `attendance-web/resources/js/Hooks/useFaceLandmarker.ts:374`: `nowTime - lastStateUpdateRef.current > 120;`
  - `attendance-web/resources/js/Hooks/useFaceLandmarker.ts:401`: `if (onResults) onResults(results, rawLms);`
  - `attendance-web/resources/js/Utils/faceDistance.ts:163`: `export class DistanceSensorSmoother {`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:745`: Tambah elemen ke-4: jarak mentah (rawDist, baris 810-812) atau null, dengan sumber (camera/camera_calibrated) dikirim sekali per presentasi. Isi null untuk sampel ATTACK.
  - `attendance-web/resources/js/Hooks/useFaceLandmarker.ts:401`: Bila perlu benar-benar per frame video: kumpulkan EAR/MAR lewat onResults dengan timestamp rVFC. Ini tidak mengubah input mesin, cukup push ke array.
  - `attendance-web/app/Http/Controllers/PresensiController.php:847`: (Domain backend) terima 3 atau 4 elemen, tambah kolom est_distance_cm dan distance_source di header baris 875-879, serta ganti nama kolom indeks menjadi sample_idx bila tetap per pembaruan state.
- **Pertanyaan keputusan:** Deret per pembaruan state (≤ 120 ms, sudah ada) cukup, atau perlu per frame video? Untuk est_distance_cm per frame, dipakai yang mentah atau yang terhaluskan, dan dikosongkan untuk sampel serangan?

### F8b: F8: status browser_object_detected terpisah tanpa membatalkan pengiriman ke FastAPI

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak ada object detector di frontend (tidak ditemukan ObjectDetector/coco/efficientdet di kode maupun bundel). PAD hanya EMAR. FaceLandmarker numFaces 1, jadi gerbang MULTIPLE_FACES (faceCount > 1) tidak pernah aktif. Frame diproses per requestVideoFrameCallback dengan delegate GPU.
- **Konflik dan dampak:** Detektor objek adalah sinyal PAD baru di luar metodologi (PAD = EMAR). Meskipun disebut 'terpisah' dan hanya dicatat, menjalankannya di peramban berbagi GPU/CPU dengan FaceLandmarker pada loop rVFC. Laju pembaruan landmark bisa turun, sehingga deret EAR/MAR yang dipakai ChallengeTracker (keputusan PAD S2) berubah dan input keputusan tidak identik dengan presentasi sebelumnya. Bila kelak dipakai untuk menolak, APCER/BPCER tidak lagi milik EMAR saja dan naskah harus menambah metode.
- **Bukti:**
  - `docs/specs/THESIS_METHODOLOGY.md:14`: `**Metode Liveness:** EMAR (Eye & Mouth Aspect Ratio) yang berjalan di ruang temporal (video).`
  - `docs/specs/DECISION_LOG.md:13`: `Tidak akan menggunakan model CNN 3D untuk liveness.`
  - `attendance-web/resources/js/Hooks/useFaceLandmarker.ts:154`: `delegate: 'GPU',`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1166`: `processFrame(video, now);`
  - `attendance-web/resources/js/Utils/faceGeometry.ts:235`: `if (faceCount > 1) {`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1153`: Tidak diimplementasikan di browser sekarang. Bila tetap diinginkan, jalankan offline pada video tersimpan di sisi mesin (domain lain) sebagai kolom eksploratif yang tidak masuk keputusan.
- **Pertanyaan keputusan:** Apakah deteksi objek (ponsel/kertas) memang masuk lingkup skripsi? Jika ya, setuju dijalankan offline pada video tersimpan, bukan di browser saat pemindaian?
- **Catatan verifier:** Benar bahwa tidak ada detektor objek di kode aplikasi dan PAD = EMAR menurut naskah. Ada beberapa koreksi. (1) Bundel build MEMUAT string 'mediapipe.tasks.vision.ObjectDetectorGraph' di useFaceLandmarker-Bb0IqVNT.js. String itu bagian pustaka @mediapipe/tasks-vision yang ikut terbundel dan tidak dipakai kode aplikasi (tidak ada ObjectDetector di resources/js). Klaim 'tidak ditemukan di bundel' perlu diluruskan. (2) Delegate GPU punya fallback CPU, juga dengan numFaces 1. (3) Terlewat auditor: THESIS_METHODOLOGY.md:16 mewajibkan fail-closed bila wajah lebih dari satu. Dengan numFaces 1 di kedua jalur, gerbang MULTIPLE_FACES di browser tidak pernah aktif. Di mesin, grep tidak menemukan penolakan multi-wajah; facenet_emar_system.py:672-673 memilih satu kotak lewat select_boxes. Ini celah metodologi tersendiri. (4) Dampak GPU terhadap laju landmark masuk akal, tetapi belum diukur.

### OBS-1: Temuan di luar PRD (FaceScannerContainer, wilayah agen ini): face_pct, durasi, dan fallback metrik yang tidak diukur

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** totalFrames dan detectedFrames hanya bertambah saat wajah ada, jadi face_pct selalu 100 (atau 100,0 bila tanpa frame). durationS ditulis 8.0 tetap. earVal/marVal berawal 0,30/0,05 dan activeChallenge jatuh ke 'BLINK' bila kosong. face_pct ikut menentukan ACCEPT lewat gerbang stabilitas ≥ 80%.
- **Konflik dan dampak:** face_detected_pct yang tercatat adalah nilai karangan (selalu 100), sehingga gerbang stabilitas ≥ 80% tidak pernah bekerja. scan_duration_s bukan durasi rekaman sebenarnya. Memperbaikinya akan mengubah keputusan untuk presentasi yang wajahnya hilang lebih dari 20%, jadi perlu persetujuan dan uji.
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:725`: `if (!hasFace) return;`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:739`: `totalFramesRef.current++;`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:976`: `: 100.0;`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:993`: `durationS: 8.0,`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:996`: `activeChallenge: activeChallengeRef.current \|\| 'BLINK',`
  - `attendance-web/app/Http/Controllers/PresensiController.php:344`: `if ($isIdMatch && $isLivenessValid && $isStabilityValid) {`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1164`: Hitung total frame di loop rVFC selama SCANNING_8S, termasuk frame tanpa wajah. Kirim null bila total 0.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:968`: Di onstop, isi durationS dari performance.now() - startTime. Kirim earVal/marVal null bila tidak ada frame berwajah, dan activeChallenge kosong bila tantangan tidak pernah dibuat.
- **Pertanyaan keputusan:** Setuju face_pct dan durasi diganti dengan nilai terukur, walau gerbang stabilitas 80% lalu benar-benar bisa menolak presentasi?
- **Catatan verifier:** Benar. totalFrames dan detectedFrames hanya naik bersamaan di blok yang sudah lolos 'if (!hasFace) return', sehingga face_pct = 100 atau fallback 100,0. durationS juga ditulis tetap 8.0. activeChallenge jatuh ke 'BLINK', dan nilai awal minEar 0,30 / maxMar 0,05 memotong nilai nyata (earVal ≤ 0,30, marVal ≥ 0,05). Tambahan yang terlewat: (1) Backend juga mengarang nilai. face_pct ?? 100.0 dan scan_duration_s ?: 8.0 (PresensiController.php:193-194). ear_val ?? (0,18/0,28) dan mar_val ?? (0,40/0,05) di baris 405-406 masuk ke S2 bila tidak ada tantangan. Memperbaiki frontend saja tidak cukup. (2) 'Frame' yang dihitung sebenarnya jumlah eksekusi useEffect saat geometricEar/geometricMar berubah, bukan frame video. Karena itu penghitungan harus dipindah ke loop rVFC seperti diusulkan. (3) Fallback 'BLINK' yang digabung dengan REJECT_TIMEOUT menghasilkan jenis tantangan karangan bila tantangan tidak pernah dibuat.

### OBS-2: Temuan di luar PRD: repetisi bawaan mode solo

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Repetisi bawaan calibration_dev adalah 10 per sel, sedangkan desain uji terkunci memakai 5 repetisi per kombinasi.
- **Konflik dan dampak:** Tidak melanggar desain TEST karena calibration_dev adalah split terpisah, tetapi angkanya perlu disengaja dan disebut di naskah bila data kalibrasi dilaporkan.
- **Bukti:**
  - `attendance-web/resources/js/Utils/soloSession.ts:19`: `export const SOLO_DEFAULT_REPETITIONS = 10;`
  - `parameter_penelitian.py:97`: `REPETITIONS = 5`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Utils/soloSession.ts:19`: Konfirmasi ke peneliti. Bila mengikuti desain, ubah ke 5 atau dokumentasikan alasan 10.
- **Pertanyaan keputusan:** Repetisi calibration_dev sengaja 10 per sel, atau disamakan dengan REPETITIONS = 5?

## laravel

**Path PRD yang tidak ada di repo:**

- app/Http/Requests/SelfTestTrialRequest.php (attendance-web/app/Http/Requests hanya berisi Auth/ dan ProfileUpdateRequest.php)
- app/Models/SelfTestTrial.php
- database/migrations/*_create_self_test_trials_table.php
- app/Services/BiometricExportService.php
- tabel self_test_trials (tidak ada migrasi)
- tabel attendance_trials (yang ada: attendance_records)
- rute GET /presensi/export-research-csv
- Semua path PRD tanpa awalan attendance-web/; satu-satunya yang ada adalah attendance-web/app/Http/Controllers/PresensiController.php
- Kolom PRD yang tidak ada di kode mana pun: browser_object_flag, minifasnet_score, app_hardened_decision, pure_thesis_decision, s3_final_score, latency_mtcnn_ms, latency_facenet_ms, latency_dlib_ms, latency_emar_ms, latency_fusion_ms, latency_total_ms, actual_fps, is_valid_setup, measured_distance_cm, camera_est_distance_cm, target_lux_category, ground_truth_type, evaluation_test (git grep tanpa hasil; measured_lux hanya muncul di dataset/self_qalwani/manifests/MANIFEST_QALWANI_TEMPLATE.csv:1)

**Berkas nyata wilayah agen:**

- `attendance-web/app/Http/Controllers/PresensiController.php`: Gerbang presensi: validasi split calibration_dev, resolusi identitas klaim, S1/S2/S3, metadata attendance_records, penulisan CSV riset (Matriks/Bab5/log_raw_frames_dev), activity log
- `attendance-web/app/Http/Controllers/AttendanceHistoryController.php`: Rute ekspor: exportAll, exportResearch, exportOperational, exportCochran, exportPdfData
- `attendance-web/app/Services/CombinedHistoryExport.php`: CSV riwayat+log aktivitas; masukan scripts/analisis_kalibrasi_dev.py (kontrak kolom)
- `attendance-web/app/Services/CochranExportService.php`: Ekspor TEST berpasangan S1/S2/S3 dari logs/telemetry.db
- `attendance-web/app/Models/AttendanceRecord.php`: Model catatan presensi, metadata JSON
- `attendance-web/app/Models/EvaluationMatrix.php`: Model evaluation_matrices
- `attendance-web/app/Models/DistanceLog.php`: Log jarak per presensi
- `attendance-web/app/Models/LightingLog.php`: Log lux per presensi
- `attendance-web/database/migrations/`: Skema attendance_records, evaluation_matrices, distance_logs, lighting_logs, activity_log
- `attendance-web/routes/web.php`: Definisi rute dan middleware auth
- `attendance-web/bootstrap/app.php`: Pengecualian CSRF untuk api/* dan presensi/verify
- `attendance-web/config/biometrics.php`: Ambang runtime, path CSV riset, path telemetry.db, desain 3240
- `attendance-web/app/Http/Controllers/Admin/ModelSettingController.php`: Override ambang runtime lewat storage/app/biometrics_settings.json
- `attendance-web/app/Http/Requests/`: Lokasi FormRequest baru bila validasi store() diekstrak
- `attendance-web/tests/Feature/CalibrationDevSplitTest.php`: Tes kontrak split calibration_dev
- `attendance-web/tests/Feature/CombinedHistoryExportTest.php`: Tes kontrak CSV riwayat (baris Presensi vs Aktivitas)
- `attendance-web/tests/Feature/BiometricDecisionGateTest.php`: Tes gerbang keputusan
- `attendance-web/tests/Feature/BiometricIntegrityTest.php`: Tes integritas skor
- `attendance-web/tests/Feature/CochranDatasetExportTest.php`: Tes ekspor TEST telemetry
- `scripts/analisis_kalibrasi_dev.py`: BUKAN milik agen ini; konsumen kolom CSV riwayat (Jenis, Split Dataset, ID Partisipan) yang wajib dijaga kompatibel
- `attendance-web/resources/js/Utils/soloSession.ts`: BUKAN milik agen ini; pengirim field participant_id/dataset_split/pai_species/lux_target/distance_target_cm

### L0-stack: Klaim stack: Laravel 12/11, PHP 8.3, MySQL/SQLite

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Laravel 13 (constraint ^13.8, terkunci v13.33.0), PHP ^8.3, Spatie activitylog 4.12.3. Default DB SQLite; MySQL 8.0 hanya di docker-compose.
- **Konflik dan dampak:** Versi Laravel di PRD salah (13, bukan 12/11). Agen yang mengikuti API Laravel 11/12 bisa salah, misalnya mencari Kernel.php padahal middleware dan CSRF diatur di bootstrap/app.php. Tidak berdampak ke data.
- **Bukti:**
  - `attendance-web/composer.json:11`: `"laravel/framework": "^13.8",`
  - `attendance-web/composer.lock:1135`: `"version": "v13.33.0",`
  - `attendance-web/composer.json:9`: `"php": "^8.3",`
  - `attendance-web/.env.example:23`: `DB_CONNECTION=sqlite`
  - `docker-compose.yml:38`: `image: mysql:8.0`
- **Usulan perubahan:**
  - `(teks PRD)`: Ganti klaim menjadi Laravel 13.33 / PHP 8.3 / SQLite (dev), MySQL 8.0 (docker). Kode tidak perlu diubah.
- **Catatan verifier:** Klaim benar. Tambahan: (1) docker-compose.yml hanya berisi layanan biometric-api, db (MySQL 8.0), dan nginx. Tidak ada layanan Laravel yang memakai MySQL itu, dan config/database.php:20 bawaannya sqlite. Jadi MySQL praktis tidak dipakai. (2) Tidak ada app/Http/Kernel.php. CSRF dan middleware diatur di bootstrap/app.php:14-26, sesuai catatan auditor. (3) Ada ketidaksesuaian stack lain yang terlewat: DECISION_LOG.md:16 menyebut Biometric API memakai FastAPI dan 'Menolak Flask'. Kenyataannya mesin yang dipanggil Laravel (BIOMETRIC_API_URL :5000 /verify) adalah Flask di facenet_emar_system.py (create_flask_api; docker FLASK_ENV), sedangkan biometric-api/app/api/verify.py masih stub TODO.

### L1-a: participant_id wajib dengan regex ^(P_DEV_01\|P0[1-9]\|P1[0-8])$

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Validasi umum memakai regex alfanumerik. participant_id wajib pada calibration_dev, dan akunnya harus ada dengan embedding_id yang sama persis. ID subjek nyata adalah embedding_id S01..S18 (seeder, galeri, telemetry). P01 dianggap ID sintetis oleh tes. Peneliti memakai P_DEV_01.
- **Konflik dan dampak:** Regex P01..P18 menolak semua 18 subjek nyata (S01..S18). Ini memaksa salah satu dari dua hal: embedding_id diganti nama, sehingga kunci galeri dan telemetry putus dan perbandingan 1:1 memakai templat yang salah, atau evaluation_test tidak bisa direkam. Selain itu P01 sudah dipakai sebagai penanda data sintetis di Dataset_Eksperimen_Bab5.csv dan di tes. Ada tiga skema ID yang bersaing: S01 (kode), P01 (PRD), SUBJ-001 (DATA_GOVERNANCE).
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:107`: `'participant_id' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9_]+$/'],`
  - `attendance-web/app/Http/Controllers/PresensiController.php:140`: `$user = User::where('embedding_id', $targetSubjectId)->first();`
  - `attendance-web/database/seeders/TeacherDatasetSeeder.php:17`: `'embedding_id' => 'S01', 'role' => 'teacher'`
  - `attendance-web/app/Services/SubjectLevelAnalysisService.php:119`: `Dahulu dipetakan ke P01 karena data sintetis memakai awalan P;`
  - `attendance-web/tests/Feature/CochranDatasetExportTest.php:137`: `$this->assertNotContains('P01', $participants, 'ID sintetis tidak boleh muncul');`
  - `attendance-web/resources/js/Utils/soloSession.ts:11`: `export const SOLO_PARTICIPANT_ID = 'P_DEV_01';`
  - `docs/specs/DATA_GOVERNANCE.md:7`: ``subject_id` harus diubah ke bentuk pseudonim (contoh: `SUBJ-001`)`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:118`: Aturan per split: calibration_dev 'participant_id' => 'required\|in:P_DEV_01'; evaluation_test (bila disetujui, lihat L1-b) 'required\|regex:/^S(0[1-9]\|1[0-8])$/'. Lookup embedding_id pada baris 139-146 dipertahankan. Kedua aturan ini juga menjaga split tetap disjoint (DATA_GOVERNANCE.md:17).
  - `attendance-web/tests/Feature/CalibrationDevSplitTest.php`: Tambah kasus: S05 ditolak pada calibration_dev, P_DEV_01 ditolak pada evaluation_test.
- **Pertanyaan keputusan:** ID subjek resmi untuk naskah: S01..S18 (embedding_id/galeri/telemetry), atau pseudonim P01..P18/SUBJ-001 yang hanya dipetakan saat ekspor? Pilihan aman: S01..S18 tetap di sistem, pseudonim hanya di berkas ekspor anonim.
- **Catatan verifier:** Bukti cocok di semua baris yang dikutip. Koreksi dan tambahan: (1) Skema ID yang bersaing lebih dari tiga. Selain S01, P01, dan SUBJ-001 ada juga awalan emb_ (akun admin uji emb_TEST-QALWANI-001 dan emb_1 di AdminQalwaniSeeder), serta 'TEST-QALWANI-001' di ResearchDatasetController:74. Awalan emb_ dibuang sebelum dikirim ke mesin (PresensiController:239). (2) Split 'evaluation_test' tidak ada di kode. dataset_split hanya menerima calibration_dev (baris 108), dan jalur TEST menyimpan dataset_split null. Usulan aturan evaluation_test berarti menambah split baru, bukan sekadar mengubah validasi. (3) Saat ini calibration_dev menerima participant_id apa pun yang punya akun dengan embedding_id sama, misalnya S05. Disjoint split (DATA_GOVERNANCE.md:17) belum ditegakkan di server.

### L1-b: dataset_split wajib: calibration_dev \| evaluation_test

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Hanya calibration_dev yang diterima. Presensi TEST tercatat dengan dataset_split null. Data TEST berpasangan untuk naskah dinyatakan bersumber tunggal dari telemetry.db yang ditulis capture_session.py, bukan dari Laravel.
- **Konflik dan dampak:** Bila evaluation_test ditambah di Laravel, data TEST punya sumber kedua di samping telemetry.db. Keduanya bisa terhitung ganda dan keputusan S2-nya berbeda: Laravel memakai liveness dari browser (lihat X3), telemetry memakai mesin. Naskah lalu bisa melaporkan dua angka APCER/BPCER untuk sistem yang sama. Mewajibkan split pada semua request juga akan mematahkan jalur kiosk operasional yang tidak mengirim split.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:108`: `'dataset_split' => 'nullable\|string\|in:'.self::CALIBRATION_DEV_SPLIT,`
  - `attendance-web/tests/Feature/CalibrationDevSplitTest.php:192`: `->and($meta['dataset_split'])->toBeNull()`
  - `attendance-web/config/biometrics.php:77`: `\| Sumber tunggal ekspor presentasi berpasangan S1/S2/S3.`
  - `docs/specs/DATA_GOVERNANCE.md:14`: `TEST: Hanya dieksekusi setelah model dan threshold dibekukan`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:108`: Hanya bila disetujui: 'in:calibration_dev,evaluation_test'. Untuk evaluation_test wajibkan session_type=TEST, participant S01..S18, serta sample_type/pai_species dengan aturan yang sama seperti baris 117-124. Split tetap opsional untuk kiosk operasional.
  - `attendance-web/app/Http/Controllers/PresensiController.php:623`: Tetapkan secara eksplisit apakah baris evaluation_test ikut ditulis ke Matriks/Bab5 CSV. Jangan diubah sebelum ada keputusan sumber TEST.
- **Pertanyaan keputusan:** Apakah data TEST naskah direkam lewat Laravel (Studio), lewat capture_session.py (telemetry.db), atau keduanya dengan satu sumber yang ditetapkan sebagai acuan? Kapan calibration freeze dinyatakan?

### L1-c: ground_truth_type: bona_fide\|print_attack\|screen_attack\|replay_attack\|cutout_attack

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Label kebenaran disimpan sebagai sample_type BONA_FIDE\|ATTACK ditambah pai_species print_attack\|screen_attack\|replay_video, sama dengan ATTACK_LABELS di parameter penelitian. Tidak ada replay_attack maupun cutout_attack.
- **Konflik dan dampak:** Mengganti replay_video menjadi replay_attack mematahkan scripts/analisis_kalibrasi_dev.py (mengimpor ATTACK_LABELS dan melempar ValueError untuk label tak dikenal), CochranExportService::LABELS, dan soloSession.ts. Menambah cutout_attack mengubah desain dari 3 menjadi 4 spesies, sehingga N_TOTAL naik dari 3240 menjadi 4050 dan berbeda dengan naskah.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:47`: `public const PAI_SPECIES = ['print_attack', 'screen_attack', 'replay_video'];`
  - `attendance-web/app/Http/Controllers/PresensiController.php:123`: `'sample_type' => 'required\|in:BONA_FIDE,ATTACK',`
  - `parameter_penelitian.py:100`: `ATTACK_LABELS = ("print_attack", "screen_attack", "replay_video")`
  - `parameter_penelitian.py:106`: `N_TOTAL = N_BONA_FIDE + N_ATTACK # 3.240`
  - `attendance-web/resources/js/Utils/soloSession.ts:25`: `['bona_fide', 'print_attack', 'screen_attack', 'replay_video']`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:109`: Pertahankan sample_type + pai_species. Bila PRD memerlukan nama ground_truth_type, terima sebagai alias yang dipetakan di server: bona_fide→(BONA_FIDE,null), *_attack→(ATTACK,spesies). replay_attack dipetakan ke replay_video. cutout_attack ditolak 422 sampai ada keputusan.
- **Pertanyaan keputusan:** Apakah cut-out attack menjadi spesies PAI keempat (desain berubah menjadi 4050 presentasi), atau tetap di luar desain?
- **Catatan verifier:** Klaim benar untuk calibration_dev, tetapi tidak lengkap. (1) sample_type 'required\|in:BONA_FIDE,ATTACK' (baris 123) hanya berlaku di calibration_dev. Di jalur TEST/kiosk aturannya 'nullable\|string' (baris 99), dan server mengisi 'BONA_FIDE' bila kosong (baris 188). Nilai itu ditulis ke Sample_Type di Matriks CSV, label_aktual di Bab5 CSV, dan evaluation_matrices.sample_type. (2) UI Studio jalur TEST tidak punya kontrol untuk menandai ATTACK atau pai_species. sampleType hanya diambil dari parameter URL dengan bawaan 'BONA_FIDE' (Index.tsx:570-571), Dashboard mengunci 'BONA_FIDE' (Dashboard.tsx:238), dan pai_species hanya dikirim oleh soloSession.ts:87. Akibatnya presentasi serangan di jalur TEST tidak bisa diberi label kebenaran dari UI. (3) Ada kosakata label keempat: ResearchDatasetController memakai BF/PP/PS/PR dan pai_species teks bebas (PRINT_A4_GLOSSY, REPLAY_VIDEO_MOBILE). Hitungan 4050 benar: 18x5x9x(1+4).

### L1-d: target_distance_cm wajib (30\|45\|60)

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Field bernama distance_target_cm, wajib numerik pada calibration_dev tetapi nilainya tidak dibatasi. Antrean solo hanya mengirim 30/45/60.
- **Konflik dan dampak:** Nama field PRD berbeda. Mengganti nama mematahkan kolom ekspor dan skrip analisis. Nilai di luar 30/45/60 saat ini masih lolos, dan baris seperti itu tidak bisa dikelompokkan ke 9 sel desain.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:122`: `'distance_target_cm' => 'required\|numeric',`
  - `attendance-web/resources/js/Utils/soloSession.ts:27`: `export const SOLO_DISTANCES: readonly SoloDistance[] = [30, 45, 60];`
  - `attendance-web/app/Services/CombinedHistoryExport.php:58`: `'Target Jarak Skenario (cm)' => 'distance_target',`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:122`: 'distance_target_cm' => 'required\|numeric\|in:30,45,60'. Nama field tetap.
  - `attendance-web/tests/Feature/CalibrationDevSplitTest.php`: Kasus: distance_target_cm=50 menghasilkan 422.

### L1-e: measured_distance_cm numeric wajib + camera_est_distance_cm

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Jarak terukur ditentukan di server setelah mesin memproses video. Urutannya: jarak mesin, lalu jarak browser atau sensor, lalu null beserta alasan di engine_distance_note. Estimasi kamera browser sudah disimpan sebagai browser_distance_cm. Preset 30 cm sengaja dihapus agar tidak tercatat sebagai ukuran.
- **Konflik dan dampak:** Bila measured_distance_cm wajib, klien harus mengirim angka walaupun sensor atau kalibrasi tidak ada. Angka itu tebakan (pelanggaran thesis-guard). Jarak mesin juga baru ada setelah validasi, jadi tidak bisa menjadi input wajib. Pada sampel serangan, jarak dari lebar wajah mengukur foto atau layar, bukan artefaknya (lihat docstring scripts/analisis_kalibrasi_dev.py baris 19-21).
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:179`: `Tanpa itu nilainya null: dulu 300 lux / 30 cm diisikan`
  - `attendance-web/app/Http/Controllers/PresensiController.php:1112`: `'browser_distance_cm' => $browserCm,`
  - `attendance-web/app/Http/Controllers/PresensiController.php:1120`: `'engine_distance_note' => $note,`
  - `.claude/agents/thesis-guard.md:24`: `A value that was not measured must stay empty/null.`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:122`: Jangan wajibkan jarak terukur. Tetap null beserta alasan. camera_est_distance_cm cukup menjadi alias ekspor untuk browser_distance_cm, tanpa kolom baru.
- **Pertanyaan keputusan:** Apakah presentasi bona fide tanpa jarak terukur dikeluarkan dari analisis (eksklusi terdokumentasi), atau tetap dianalisis menurut target skenario seperti di analisis_kalibrasi_dev.py?
- **Catatan verifier:** Urutan sumber jarak (mesin, lalu browser atau sensor, lalu null beserta engine_distance_note) terbukti. Koreksi atas usulan: browser_distance_cm tidak selalu estimasi kamera. Nilainya bisa bersumber 'sensor' (rangefinder), lihat browser_distance_source dan DISTANCE_SOURCES. Jadi alias camera_est_distance_cm hanya sah bila browser_distance_source ∈ {camera, camera_calibrated}. Tambahan: analisis_kalibrasi_dev.py mengelompokkan menurut target skenario, sehingga jarak terukur memang tidak diperlukan untuk tabel kalibrasi. Sisa preset 30 cm masih ada di config/biometrics.php:28 dan ModelSettingController:93 ('distance_cm' => 30), tetapi git grep tidak menemukan pembacaan biometrics.distance_cm untuk keputusan.

### L1-f: target_lux_category wajib (redup\|standar\|terang)

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Dikirim lux_target numerik (75/300/650). Kategori naskah memakai kunci 'normal'; 'Standar' hanya label tampilan di ekspor Cochran. LightingModel sudah bisa menurunkan kategori dari angka.
- **Konflik dan dampak:** 'standar' tidak sama dengan kunci 'normal' di parameter_penelitian.py dan LUX_ORDER skrip analisis. Mencampur keduanya memecah sel normal menjadi dua grup. Field kategori dari klien juga bisa bertentangan dengan lux_target.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:121`: `'lux_target' => 'required\|numeric',`
  - `attendance-web/resources/js/Utils/soloSession.ts:31`: `{ redup: 75, normal: 300, terang: 650 }`
  - `parameter_penelitian.py:55`: `"normal": (LUX_REDUP_MAX, LUX_NORMAL_MAX),`
  - `attendance-web/app/Services/LightingModel.php:62`: `'kategori_naskah' => $lux < 100 ? 'redup' : ($lux <= 300 ? 'normal' : 'terang'),`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:447`: Tambahkan 'lux_target_category' => LightingModel::classify($luxTarget)['kategori_naskah'] ke evaluationBab5 dan trialLabels (baris 461-467). Kategori diturunkan di server, bukan input klien. Bila klien tetap mengirim kategori, validasi in:redup,normal,terang dan harus cocok dengan lux_target.

### L1-g: measured_lux numeric wajib

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Lux hanya tercatat bila sumbernya pengukuran langsung (luxmeter, kamera, kamera berkalibrasi) atau lux mesin berkalibrasi. Selain itu null dengan sumber 'none'.
- **Konflik dan dampak:** Mewajibkan lux mendorong pengisian nilai tebakan saat luxmeter atau kalibrasi tidak ada, padahal metodologi melarang nilai tak terukur diisi. 31,7% lux kosong yang disebut PRD justru menandakan kejujuran pencatatan, bukan bug.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:35`: `private const LUX_SOURCES = ['luxmeter', 'camera', 'camera_calibrated'];`
  - `attendance-web/app/Http/Controllers/PresensiController.php:997`: `[$lux, $source, $calibrationId] = [null, 'none', null];`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:117`: Jangan tambahkan measured_lux required. Bila luxmeter fisik ditetapkan wajib untuk calibration_dev, wajibkan lux_source=luxmeter beserta nilainya, dan UI memblokir pengiriman sampai ada bacaan nyata (tanpa nilai bawaan).
- **Pertanyaan keputusan:** Apakah bacaan luxmeter fisik wajib per presentasi kalibrasi? Bila ya, presentasi diblokir sampai ada bacaan; nilainya tidak boleh diisi otomatis.
- **Catatan verifier:** Logika recordedLux terbukti (luxmeter, lalu mesin berkalibrasi, lalu klien, lalu null/'none'). Koreksi: (1) Lux yang terisi belum tentu hasil ukur. Sumber 'camera' adalah estimasi browser tanpa kalibrasi, tetapi tetap diterima (baris 35) dan ekspor menyebutnya 'perkiraan'. (2) Catatan lama berlabel unsourced_legacy berisi nilai bukan-null (300 lux) tanpa pengukuran (CombinedHistoryExport:360-361), jadi masalahnya bukan hanya 31,7% lux kosong. Angka 31,7% sendiri tidak bisa diverifikasi karena CSV Riwayat tidak ada di repo. (3) Mewajibkan lux_source=luxmeter belum menjamin bacaan fisik. POST /api/lux/update publik dan dikecualikan dari CSRF ('api/*'), dan LuxometerWidget membaca /api/lux/current lalu menandainya source 'luxmeter'. Perangkat mana pun bisa menyuntikkan nilai 'luxmeter'.

### L1-h: SelfTestTrialRequest sebagai FormRequest

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Validasi ditulis inline di store() dalam dua tahap: umum, lalu khusus calibration_dev. Belum ada FormRequest presensi.
- **Konflik dan dampak:** Hanya refaktor. Penolakan 'akun partisipan tidak ditemukan' (baris 141-146) berupa lookup DB dan tetap di controller atau dijadikan aturan exists:users,embedding_id. Pesan galat bahasa Indonesia (125-129) harus ikut dipindah agar tes tetap lulus.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:79`: `$request->validate([`
  - `attendance-web/app/Http/Controllers/PresensiController.php:117`: `$request->validate([`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Requests/PresensiStoreRequest.php`: Berkas baru (nama nyata menyesuaikan konvensi; bukan SelfTestTrialRequest karena tabel itu tidak ada). Pindahkan rules baris 79-130 dengan aturan kondisional split.
  - `attendance-web/app/Http/Controllers/PresensiController.php:77`: store(PresensiStoreRequest $request)

### L2-a: Tabel baru self_test_trials & attendance_trials (vs metadata JSON yang ada)

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Semua field per presentasi sudah tersimpan di attendance_records.metadata (JSON), termasuk evaluation_bab5 bersarang, label uji, dan target. Ada juga evaluation_matrices, distance_logs, dan lighting_logs. Ambang aktif tidak ikut disimpan per baris, padahal bisa diubah saat runtime lewat biometrics_settings.json.
- **Konflik dan dampak:** Tabel baru membuat sumber kebenaran kedua. Baris historis hanya ada di metadata dan tidak boleh ditulis ulang, sehingga tabel baru kosong untuk data lama atau perlu backfill. Penulisan ganda bisa menyimpang. CombinedHistoryExport dan analisis_kalibrasi_dev.py sudah membaca metadata. Ambang tidak tersimpan per baris (hanya di respons, baris 759), jadi bila ambang diubah via UI, baris riset kehilangan jejak ambangnya.
- **Bukti:**
  - `attendance-web/database/migrations/2026_07_14_000003_create_attendance_records_table.php:22`: `$table->json('metadata')->nullable();`
  - `attendance-web/app/Http/Controllers/PresensiController.php:510`: `'evaluation_bab5' => $evaluationBab5,`
  - `attendance-web/app/Http/Controllers/Admin/ModelSettingController.php:34`: `$path = storage_path('app/biometrics_settings.json');`
  - `attendance-web/app/Http/Controllers/PresensiController.php:759`: `'facenet_threshold' => $thresholdDistance,`
  - `.claude/agents/thesis-guard.md:25`: `Logs (`activity_log`, `attendance_records`, ...) ... must not be rewritten or cleaned`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:430`: Tambahkan 'thresholds' => [facenet, ear, mar, alpha, s3, p_face_scale] ke evaluationBab5 (snapshot ambang aktif, nilai tidak diubah).
  - `attendance-web/database/migrations/(baru)_add_trial_columns_to_attendance_records_table.php`: Opsional dan aditif: kolom nullable terindeks dataset_split dan participant_id, diisi saat tulis. Tanpa tabel baru. Backfill dari metadata hanya dengan persetujuan.
- **Pertanyaan keputusan:** Pertahankan metadata JSON (disarankan) ditambah kolom terindeks, atau buat tabel trial terpisah dengan konsekuensi dua sumber data?

### L2-b: s1_decision, s2_decision, s3_decision, s3_final_score, pure_thesis_decision disimpan berdampingan

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** s1/s2/s3/s_final/p_face/p_live sudah ada di metadata.evaluation_bab5, dan final_decision (keputusan sistem) juga tersimpan. Ada tiga masalah. (1) S2 tanpa tantangan memakai ear_val/mar_val yang diisi tebakan bila klien tidak mengirim. (2) Rumus S3 Laravel (skala 1,5, alpha 0,6 hard-code, ambang 0,75) berbeda dari FusionEngine mesin (D_REF 1,20, FINAL_THRESHOLD 0,50); rumus Laravel sama dengan evaluate_trial/evaluation_bab5.py. (3) Alpha dan ambang S3 ditulis langsung di kode, tidak diambil dari config.
- **Konflik dan dampak:** Bila s3_final_score dijadikan kolom tanpa memutuskan definisi S3, salah satu dari dua rumus S3 yang berbeda di repo akan terbekukan. facenet_score dari mesin (1-d/1,20) dan p_face Laravel (1-d/1,5) juga tidak sebanding. EAR/MAR tebakan (0,18/0,28 dan 0,40/0,05) ikut tertulis ke kolom ear/mar Dataset_Eksperimen_Bab5.csv (baris 680-681) dan menentukan S2 bila tidak ada tantangan. Ini nilai tidak terukur yang diisi. pure_thesis_decision sudah sama dengan final_decision, jadi cukup alias di ekspor.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:411`: `$earVal = (float) ($request->input('ear_val') ?? ($earBlinks > 0 ? 0.18 : 0.28));`
  - `attendance-web/app/Http/Controllers/PresensiController.php:421`: `$pFace = $evaluated ? max(0.0, 1.0 - ($euclideanDistance / 1.5)) : null;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:424`: `$s3 = ($evaluated && $sFinal >= 0.75) ? 1 : 0;`
  - `facenet_emar_system.py:181`: `D_REF = 1.20`
  - `facenet_emar_system.py:202`: `FINAL_THRESHOLD = 0.50 # TAU_FUSION: ambang keputusan S3`
  - `evaluation_bab5.py:53`: `threshold_s3: float = 0.75`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:411`: ear_val/mar_val null bila tidak dikirim. livenessValid dan s2 null (bukan 0) bila tidak ada bukti liveness. Sel CSV dikosongkan. Tes ditambahkan.
  - `attendance-web/config/biometrics.php:28`: Tambah kunci s3_alpha (0.60), s3_threshold (0.75), p_face_scale (1.5) dengan nilai identik. PresensiController baris 421-424 membacanya (tanpa mengubah angka).
  - `attendance-web/app/Http/Controllers/PresensiController.php:437`: Ekspor s_final sebagai s3_final_score dan final_decision sebagai pure_thesis_decision (alias), tanpa kolom DB baru.
- **Pertanyaan keputusan:** Definisi S3 mana yang dilaporkan naskah: P_face=1-d/1,5 dengan ambang 0,75 (Laravel/evaluation_bab5.py), atau D_REF 1,20 dengan FINAL_THRESHOLD 0,50 (FusionEngine)? Bolehkah S2 menjadi null untuk presentasi tanpa bukti EAR/MAR terukur?
- **Catatan verifier:** Inti klaim terbukti, tetapi ada beberapa koreksi. (1) Kelas mesin bernama FusionModule (facenet_emar_system.py:1150), bukan FusionEngine. Perbedaannya juga lebih dari konstanta: S3 mesin memakai emar_score kontinu sebagai P_live (baris 1269) dan mensyaratkan facenet is_verified (baris 1285). (2) facenet_emar_system.py:1351 juga memuat evaluate_trial dengan 1,5/0,75, jadi berkas mesin sendiri memuat dua definisi. (3) Ekspor S1/S2/S3 yang dinyatakan 'sumber tunggal' (config/biometrics.php:77) berasal dari telemetry presentation_log yang ditulis capture_session.py lewat system.decide_all, yaitu definisi FusionModule (D_REF 1,20, ambang 0,50). Jadi dua pipeline data di repo menghasilkan S3 yang berbeda. (4) PR #2 menambah salinan hard-code ketiga: scripts/analisis_kalibrasi_dev.py:59-60 (S3_ACCEPT=0.75, P_FACE_SCALE=1.5). Usulan config Laravel tidak menjangkaunya. (5) Dalam praktik, scanner selalu mengirim active_challenge dan ear_val/mar_val. Fallback 0,18/0,28 hanya terpakai pada klien lain, dan S2 jalur Studio memakai challenge_status. Namun ear_val/mar_val dari scanner berangkat dari sentinel 0,30/0,05 (FaceScannerContainer.tsx:713-714), sehingga nilai itu terkirim seolah terukur bila wajah tidak terdeteksi. (6) Klaim 'pure_thesis_decision sudah sama dengan final_decision' berlebihan. final_decision juga mensyaratkan kestabilan ≥80% (baris 344) dan bisa ditolak jadwal untuk sesi selain TEST/ENROLLMENT/CALIBRATION (baris 359-366). s2 tidak memuat syarat kestabilan. (7) Terlewat: ambang facenet/EAR/MAR bisa diubah saat runtime lewat ModelSettingController::update (rentang 0,20-0,60 dan seterusnya), dan ambang yang dipakai tidak disimpan di metadata (hanya di respons JSON, baris 759).

### L2-c: browser_object_flag, minifasnet_score, app_hardened_decision

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak ditemukan di kode mana pun. Respons /verify mesin tidak memuat field ini. Metodologi PAD hanya EMAR berbasis landmark dlib, dan model CNN untuk liveness ditolak dalam decision log.
- **Konflik dan dampak:** MiniFASNet adalah komponen PAD berbasis CNN di luar desain. Bila ikut memengaruhi keputusan, sistem yang diuji tidak lagi FaceNet+EMAR murni. Laravel tidak bisa menghasilkan nilai ini sendiri, sehingga kolom ini akan selalu null atau diisi tebakan.
- **Bukti:**
  - `facenet_emar_system.py:2732`: `"liveness_passed": is_live,`
  - `docs/specs/DECISION_LOG.md:13`: `Tidak akan menggunakan model CNN 3D untuk liveness.`
  - `docs/specs/THESIS_METHODOLOGY.md:11`: `MTCNN untuk bounding box; dlib 68-point untuk landmark mata dan mulut.`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:266`: Tidak ada perubahan sampai mesin dan frontend menyediakan nilai DAN peneliti menyetujui. Bila disetujui, simpan di metadata.app_hardened.* (nullable) dan jangan pernah dipakai dalam final_decision maupun S1/S2/S3.
- **Pertanyaan keputusan:** Apakah lengan 'app hardened' (MiniFASNet + deteksi objek browser) masuk cakupan skripsi sebagai pembanding terpisah, atau di luar cakupan?
- **Catatan verifier:** Benar bahwa tidak ada field MiniFASNet, browser_object, atau app_hardened. git grep hanya menemukan kolom measured_lux di dataset/self_qalwani/manifests/MANIFEST_QALWANI_TEMPLATE.csv, yang bukan kode. Respons /verify juga tidak memuatnya. Koreksi: DECISION_LOG.md:13 secara eksplisit hanya menolak 'model CNN 3D'. MiniFASNet adalah CNN 2D dan tidak ditolak secara eksplisit. Alasan 'di luar cakupan' bertumpu pada fokus EMAR (DECISION_LOG:13, THESIS_METHODOLOGY:14), bukan larangan umum atas CNN.

### L2-d: latency_mtcnn/facenet/dlib/emar/fusion/total_ms, actual_fps

- **Verdict:** Belum layak sekarang (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** /verify tidak mengirim latensi per tahap. processing_ms hanya ada di dalam mesin dan telemetry. Laravel hanya menyimpan camera_fps yang dideklarasikan browser, bukan fps proses aktual. Latensi pulang-pergi diukur di browser tetapi tidak dikirim.
- **Konflik dan dampak:** Latensi per tahap hanya bisa diukur di mesin. Mengisinya di Laravel berarti menebak. Instrumentasi timer di mesin tidak mengubah input, tetapi tetap butuh bukti 'identik' dari agen mesin. camera_fps jangan dilabeli actual_fps.
- **Bukti:**
  - `facenet_emar_system.py:2735`: `"video_seconds": round(n_frames / fps, 3),`
  - `telemetry_logger.py:99`: `processing_ms REAL,`
  - `attendance-web/app/Http/Controllers/PresensiController.php:925`: `$fps = is_numeric($fps) && (float) $fps > 0 && (float) $fps <= 1000 ? round((float) $fps, 1) : null;`
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:868`: `setLatencyMs(Math.round(endTime - startTime));`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:253`: Bisa dikerjakan sekarang: ukur waktu dinding panggilan Http ($send) di server dan simpan metadata.engine_roundtrip_ms (ukuran nyata). Setelah mesin mengirim objek timing, simpan apa adanya di metadata.engine_timing (nullable).
- **Catatan verifier:** Terbukti. Rincian: mesin memang punya waktu proses, tetapi bukan per tahap MTCNN/FaceNet/dlib. Yang ada hanya FusionResult.processing_ms (langkah fusi dan total process_frame, facenet_emar_system.py:291, 2049) dan processing_ms per frame di telemetry dari capture_session.py:358. Tidak satu pun dikembalikan oleh /verify. Latensi browser diukur setelah respons diterima (Index.tsx:866-868), jadi memang tidak bisa ikut dalam request yang sama. camera_fps adalah fps yang dideklarasikan, bukan fps proses.

### L2-e: is_valid_setup

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak ada. Yang paling dekat adalah distance_target_met dan lux_target_met (tri-state, null bila tak terukur).
- **Konflik dan dampak:** Definisinya belum ada. Bila 'valid' berarti target terpenuhi, baris dengan lux atau jarak null dan semua sampel serangan (jarak mengukur artefak) akan terbuang diam-diam, sehingga sampel bias. FTA harus dilaporkan terpisah, bukan dihilangkan oleh filter.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:315`: `$distanceTargetMet = DistanceModel::targetMet($distanceTarget, $distanceCm);`
  - `docs/specs/THESIS_METHODOLOGY.md:24`: `FTA tidak dimasukkan dalam denominator saat menghitung Error Rates.`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:456`: Setelah definisi disetujui, hitung is_valid_setup tri-state (true/false/null) beserta setup_invalid_reason di evaluationBab5. Jangan dipakai menyaring data di server.
- **Pertanyaan keputusan:** Apa kriteria 'setup valid' (target lux terpenuhi? jarak hanya untuk bona fide? kalibrasi aktif?), dan apakah baris tidak valid dikecualikan atau hanya ditandai?

### L3: GET /presensi/export-research-csv?split=calibration_dev hanya dari tabel trial (is_valid_setup=true), tanpa baris activity_log, nama dianonimkan

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Ekspor gabungan butuh login dan sengaja menyertakan baris Aktivitas serta PII (Nama, Email, IP, Perangkat). Skrip analisis sudah menyaring Jenis=Presensi + split + partisipan dan menulis presentasi_anonim.csv tanpa PII. /presensi/export-bab5 berada di luar grup auth, sehingga CSV riset bisa diunduh tanpa login.
- **Konflik dan dampak:** Path PRD /presensi/... berada di blok rute publik web.php. Bila diikuti apa adanya, ekspor riset terbuka tanpa login. Filter 'hanya is_valid_setup=true' akan membuang FTA dan baris tak terukur, padahal FTA wajib dilaporkan terpisah (DECISION_LOG.md:21). 'Tabel trial' belum ada; sumbernya seharusnya attendance_records.metadata. Ada juga PII di evaluation_matrices.raw_metadata (user_name/user_email).
- **Bukti:**
  - `attendance-web/routes/web.php:15`: `Route::get('/presensi/export-bab5', [...PresensiController::class, 'exportBab5'])`
  - `attendance-web/routes/web.php:59`: `Route::get('/attendance/export/all', ...)->name('attendance.export.all');`
  - `attendance-web/app/Services/CombinedHistoryExport.php:17`: `Tiap verifikasi biometrik tercatat dua kali: baris attendance_records dan log`
  - `scripts/analisis_kalibrasi_dev.py:116`: `if row.get("Jenis") != "Presensi" or row.get("Split Dataset") != SPLIT:`
  - `attendance-web/app/Http/Controllers/PresensiController.php:587`: `'user_name' => $user->name,`
- **Usulan perubahan:**
  - `attendance-web/app/Services/ResearchTrialExport.php`: Berkas baru: stream attendance_records dengan metadata.dataset_split = split. Kolom setara ANON_COLUMNS analisis_kalibrasi_dev.py plus participant_id, biometric_source, dan flag validitas. Tanpa nama/email/IP/user_agent, tanpa activity_log. Semua baris disertakan dan FTA ditandai, tidak dibuang.
  - `attendance-web/routes/web.php:59`: Tambah rute di dalam grup middleware('auth'), misalnya /attendance/export/research-trials, dengan cek peran admin\|researcher di AttendanceHistoryController.
  - `attendance-web/routes/web.php:15`: Pindahkan /presensi/export-bab5 ke grup auth (salinan terautentikasi sudah ada di baris 54).
  - `attendance-web/tests/Feature/ResearchTrialExportTest.php`: Tes: wajib login dan peran, tidak ada kolom PII, tidak ada baris Aktivitas, baris FTA ikut dengan flag.
- **Pertanyaan keputusan:** Apakah ekspor riset menyertakan semua baris dengan flag validitas (disarankan), atau hanya baris valid? Bolehkah /presensi/export-bab5 publik ditutup?

### L4: Masalah dikutip: 71,8% missing target jarak/lux, 31,7% missing lux, 45 baris duplikat 'Aktivitas'

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Angka tidak bisa diverifikasi karena tidak ada CSV Riwayat di repo (exports/ hanya berisi Dataset_Cochran_Q_ISO30107_6480.csv). Menurut kode: target null untuk presensi non-skenario adalah perilaku yang disengaja, dan calibration_dev kini mewajibkan target sejak PR #2. Lux null berarti tidak terukur. Baris Aktivitas memang disengaja (login, penghapusan, log verifikasi yatim). Log yang catatannya masih ada digabung ke baris Presensi dan tidak diulang. Dataset_Eksperimen_Bab5.csv berisi 43 baris dari akun uji emb_TEST-QALWANI-001 dan 4 baris sintetis P01-P04.
- **Konflik dan dampak:** 'Duplikat' tidak sesuai kode: baris Aktivitas adalah log non-presensi atau log verifikasi yang catatannya sudah dihapus. 'Missing' adalah null yang jujur. Menganggapnya cacat lalu 'memperbaikinya' dengan mengisi nilai atau menghapus activity_log melanggar thesis-guard.md:24-25. Masalah data yang nyata justru lain: pai_species di activity log tercemar prediksi (lihat X1), dan CSV Bab5 berisi baris akun uji dan sintetis yang harus disaring di analisis, bukan dihapus.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:185`: `$luxTarget = $request->filled('lux_target') ? round(...) : null;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:116`: `3 lux x 3 jarak; dulu baris seperti itu tercatat dengan target kosong.`
  - `attendance-web/app/Services/CombinedHistoryExport.php:209`: `if (! isset($mergedLogIds[$activity->id])) {`
  - `attendance-web/tests/Feature/CombinedHistoryExportTest.php:108`: `expect(collect($rows)->where('ID Log Aktivitas', (string) $log->id))->toHaveCount(1);`
  - `Dataset_Eksperimen_Bab5.csv:2`: `P01,30,300,Bona_Fide,0.25,0.17,0.42,1,1,1`
- **Usulan perubahan:**
  - `(analisis/naskah)`: Laporkan proporsi null per sumber (none / unsourced_legacy) sebagai 'tidak terukur'. Saring Jenis=Presensi (sudah ada). Saring akun uji dan baris sintetis P01-P04 di skrip analisis. Jangan menulis ulang CSV atau log.
- **Catatan verifier:** Terbukti. CSV Riwayat tidak ada di repo, dan Bab5 CSV berisi 43 baris emb_TEST-QALWANI-001, P01-P04, 67 baris S01, dan 3 baris S02. Koreksi istilah: unsourced_legacy bukan null, melainkan nilai terisi tanpa sumber (isian lama 300/30). Kategori ini harus dilaporkan sebagai 'nilai tanpa sumber, diperlakukan tidak terukur', bukan dihitung dalam 'proporsi null'. Tambahan: (1) Matriks_Evaluasi_Bab4.csv ada di dataset/video_singkat/ (config biometrics.php:93), dengan PAI_Species 28 ATTACK/CUT_OUT dan 39 ATTACK/PHOTO, yang mendukung X1. (2) Baris S01 di Bab5 CSV bisa mencakup presentasi yang diatribusikan lewat fallback 'S01' (PresensiController:177). Ini tidak dapat dibedakan dari CSV.

### X1: (Temuan tambahan) Label PAI tercemar prediksi di activity log dan Matriks_Evaluasi_Bab4.csv

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** $paiSpecies (label kebenaran dari klien) ditimpa di dalam blok penulisan CSV dengan nilai turunan prediksi sistem (NONE/CUT_OUT/PHOTO). Activity log lalu mencatat nilai yang sudah ditimpa itu. Ekspor riwayat membaca pai_species dari log untuk baris Aktivitas.
- **Konflik dan dampak:** Pada jalur TEST yang diukur mesin, activity_log.pai_species dan kolom PAI_Species di Matriks_Evaluasi_Bab4.csv berisi spesies yang ditebak dari prediksi liveness, bukan label kebenaran. APCER per spesies yang dihitung dari kolom ini menjadi sirkular. Metadata attendance_records tidak terkena karena trialLabels disusun sebelum penimpaan (baris 461-467).
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:175`: `$paiSpecies = $request->input('pai_species') ?: null;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:635`: `$paiSpecies = ($sampleType === 'BONA_FIDE') ? 'NONE' : ((! $isMouthValid && $isBlinkValid) ? 'CUT_OUT' : 'PHOTO');`
  - `attendance-web/app/Http/Controllers/PresensiController.php:716`: `'pai_species' => $paiSpecies,`
  - `attendance-web/app/Services/CombinedHistoryExport.php:347`: `'pai_species' => $props['pai_species'] ?? null,`
  - `docs/specs/THESIS_METHODOLOGY.md:25`: `Evaluasi serangan (APCER) dilaporkan terpisah berdasarkan PAI Species`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:635`: Ganti nama variabel lokal menjadi $matriksPaiSpecies agar baris 716 mencatat label kebenaran. Untuk kolom CSV Matriks, tulis label kebenaran (kosong bila tidak dikirim) menggantikan turunan prediksi. Baris lama dibiarkan.
  - `attendance-web/tests/Feature/CalibrationDevSplitTest.php`: Tes: activity log jalur TEST menyimpan pai_species dari request.
- **Pertanyaan keputusan:** Bolehkah semantik kolom PAI_Species pada Matriks_Evaluasi_Bab4.csv diubah dari 'tebakan prediksi' menjadi 'label kebenaran' untuk baris baru?
- **Catatan verifier:** Terbukti. Penimpaan hanya terjadi pada cabang biometric_source=engine, bukan akun uji, dan bukan calibration_dev (baris 623). Metadata attendance_records aman karena trialLabels disusun di baris 461. Matriks CSV di repo sudah tercemar (28 CUT_OUT, 39 PHOTO). Tambahan: (1) Kolom Properti Log (JSON) pada baris Presensi yang digabung ikut membawa pai_species tercemar dari log. (2) Kolom Sample_Type di Matriks juga memakai $sampleType dengan fallback 'BONA_FIDE' (baris 188). (3) Usulan perbaikan tidak akan menghasilkan label kebenaran di jalur TEST, karena UI TEST tidak pernah mengirim pai_species (hanya soloSession.ts:87). Setelah diperbaiki kolom itu akan selalu kosong sampai UI diberi kontrol label.

### X2: (Diminta diperiksa) /api/presensi dan /presensi/verify tanpa auth: dampak ke data riset

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Kedua rute publik dan dikecualikan dari CSRF. Pada calibration_dev, identitas diambil dari participant_id tanpa memeriksa login atau peran. Pada jalur kiosk, klaim yang tidak dikenal dialihkan ke akun admin atau user pertama. Klaim juga dicocokkan dengan LIKE email, dan user tanpa embedding_id diverifikasi sebagai S01.
- **Konflik dan dampak:** Perangkat mana pun di jaringan bisa mengirim baris calibration_dev atas nama P_DEV_01 dan menambah frame_series sembarang ke log_raw_frames_dev.csv tanpa login. Klaim yang tidak dikenal diverifikasi terhadap templat admin atau S01, bukan ditolak INVALID_CLAIM, sehingga baris riset bisa salah atribusi subjek. Kiosk operasional memang butuh rute tanpa login, jadi pembatasan cukup untuk split riset.
- **Bukti:**
  - `attendance-web/routes/web.php:14`: `Route::post('/presensi/verify', [...PresensiController::class, 'store'])->name('presensi.verify');`
  - `attendance-web/bootstrap/app.php:25`: `'presensi/verify',`
  - `attendance-web/app/Http/Controllers/PresensiController.php:151`: `->orWhere('email', 'like', "%{$targetSubjectId}%")`
  - `attendance-web/app/Http/Controllers/PresensiController.php:169`: `$user = User::where('role', 'admin')->first() ?: User::first();`
  - `attendance-web/app/Http/Controllers/PresensiController.php:177`: `($targetSubjectId ?: 'S01')`
  - `docs/specs/ACCEPTANCE_CRITERIA.md:8`: `claimed_subject_id yang tidak terdaftar harus membuahkan exception / INVALID_CLAIM`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:113`: Bila dataset_split diisi, wajibkan $request->user() berperan admin\|researcher. Tanpa itu, tolak dengan 403/422 sebelum memanggil mesin.
  - `attendance-web/app/Http/Controllers/PresensiController.php:151`: Hapus pencocokan LIKE email; klaim hanya lewat embedding_id persis.
  - `attendance-web/app/Http/Controllers/PresensiController.php:169`: Ganti fallback admin/User::first() dan 'S01' (baris 177) dengan 422 INVALID_CLAIM. Ini mengubah perilaku kiosk, jadi perlu keputusan.
  - `attendance-web/tests/Feature/CalibrationDevSplitTest.php`: Tes: POST calibration_dev tanpa login menghasilkan 403 dan tidak ada baris maupun CSV yang ditulis.
- **Pertanyaan keputusan:** Bolehkah kiosk menolak klaim tidak dikenal (INVALID_CLAIM) alih-alih mengalihkannya ke akun admin? Apakah split riset wajib login peneliti?
- **Catatan verifier:** Terbukti: rute publik, CSRF dikecualikan, LIKE email, fallback admin/User::first(), dan 'S01'. Nuansa: (1) Admin hasil seeder adalah akun uji (embedding_id emb_TEST-QALWANI-001, is_test_data true). Bila admin itu yang terpilih, penulisan Bab5/Matriks CSV dilewati (! $isTestAccount, baris 623), tetapi attendance_records tetap tercatat. (2) Bila akun fallback tidak punya embedding_id, subjectId menjadi klaim itu sendiri (baris 177) dan mesin menjawab SUBJECT_NOT_ENROLLED (FTA). Jadi 'diverifikasi terhadap templat admin atau S01' hanya berlaku bila admin punya embedding_id atau klaim kosong. Terlewat: GET /presensi/export-bab5 juga publik dan mengunduh Dataset_Eksperimen_Bab5.csv tanpa login. /api/lux/update dan /api/distance/update publik, sehingga bacaan 'luxmeter'/sensor bisa disuntik. challenge_status tidak divalidasi, sehingga klien bisa mengirim PASS_LIVENESS (lihat X3).

### X3: (Terkait L2 s2_decision) Liveness keputusan berasal dari klien, bukan mesin

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** isLivenessValid dan S2 memakai challenge_status atau ear_blinks/mar_mouths dari browser (MediaPipe). Laravel tidak membaca liveness_passed, blink_cycles, maupun mouth_cycles yang dikirim mesin (grep tanpa hasil di PresensiController.php). Scanner selalu mengirim activeChallenge (bawaan 'BLINK').
- **Konflik dan dampak:** s2_decision dan final_decision di attendance_records dan CSV Bab5 mencerminkan liveness browser, bukan EMAR dlib di mesin seperti yang dijelaskan naskah. Klien juga bisa mengirim PASS_LIVENESS sendiri. Menyimpan s2 'berdampingan' tanpa menyimpan hasil liveness mesin membuat perbandingan tidak mungkin dilakukan.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:329`: `$isLivenessValid = ($challengeStatus === 'PASS_LIVENESS');`
  - `facenet_emar_system.py:2733`: `"blink_cycles": res_emar.blink_cycles,`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:996`: `activeChallenge: activeChallengeRef.current \|\| 'BLINK',`
  - `docs/specs/THESIS_METHODOLOGY.md:11`: `dlib 68-point untuk landmark mata dan mulut.`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:270`: Simpan apa adanya engine_liveness_passed, engine_blink_cycles, dan engine_mouth_cycles dari $result ke metadata dan evaluationBab5. Aditif, keputusan tidak berubah.
  - `attendance-web/app/Http/Controllers/PresensiController.php:328`: Mengganti sumber keputusan liveness ke mesin hanya dengan persetujuan peneliti, disertai tes.
- **Pertanyaan keputusan:** Liveness mana yang menjadi keputusan S2 untuk naskah: tantangan browser (MediaPipe) atau EMAR mesin (dlib)?
- **Catatan verifier:** Inti klaim terbukti: S2 dan final_decision memakai challenge_status dari browser, Laravel tidak membaca liveness_passed/blink_cycles/mouth_cycles, dan scanner selalu mengirim activeChallenge. Koreksi: pernyataan bahwa perbandingan 'tidak mungkin' berlebihan. Laravel menyimpan emar_score mesin di metadata (baris 270, 490) dan di evaluation_matrices, sedangkan mesin menetapkan is_live = emar_score >= 1,0 (facenet_emar_system.py:1081, EMAR_LIVENESS_THRESHOLD baris 195). Liveness mesin bisa direkonstruksi tanpa kolom baru. Yang hilang hanya jumlah siklus kedip dan mulut. Pipeline telemetry (capture_session.py) juga sudah mencatat S2 berbasis mesin. THESIS_METHODOLOGY:15 mengizinkan 'tantangan acak', tetapi deteksinya berjalan di MediaPipe browser, bukan dlib (baris 11).

### X4: (Terkait 'nilai tak terukur tidak boleh diisi') Fallback tebakan yang masih ada

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** face_pct bawaannya 100, scan_duration bawaannya 8,0, dan ear_val/mar_val bawaannya 0,18/0,28 dan 0,40/0,05. exportOperational mengisi BONA_FIDE/MATCH/0/100/8,0 untuk metadata yang kosong. Frontend juga mengirim facePct 100 bila total frame 0.
- **Konflik dan dampak:** Klien lama atau klien yang tidak mengirim face_pct lolos syarat kestabilan 80% dengan nilai 100 yang tidak diukur. Ekspor operasional menampilkan BONA_FIDE/MATCH untuk baris tanpa prediksi. Bila kolom PRD disalin dari nilai ini, tebakan ikut terbekukan ke tabel riset.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:193`: `?? $request->input('face_detected_pct') ?? 100.0);`
  - `attendance-web/app/Http/Controllers/PresensiController.php:194`: `$scanDuration = (float) ($request->input('scan_duration_s') ?: 8.0);`
  - `attendance-web/app/Http/Controllers/AttendanceHistoryController.php:444`: `$meta['pad_pred'] ?? 'BONA_FIDE',`
  - `attendance-web/app/Http/Controllers/AttendanceHistoryController.php:445`: `$meta['id_pred'] ?? 'MATCH',`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:976`: `: 100.0;`
  - `.claude/agents/thesis-guard.md:24`: `Flag fallbacks that fabricate data, e.g. `?? 'BONA_FIDE'`, `?? 'MATCH'`, `?? 100`, `?? 8.0``
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:193`: face_pct null bila tidak dikirim, dan isStabilityValid menjadi fail-closed (THESIS_METHODOLOGY.md:16). scan_duration null bila tidak dikirim.
  - `attendance-web/app/Http/Controllers/AttendanceHistoryController.php:444`: Ganti fallback baris 439-454 dengan sel kosong.
- **Pertanyaan keputusan:** Setujukah presentasi tanpa face_pct terukur ditolak (fail-closed), bukan diterima dengan 100%?
- **Catatan verifier:** Semua fallback yang dikutip terbukti. Ada beberapa yang terlewat: (1) PresensiController:188 $sampleType ?: 'BONA_FIDE'. Nilai ini ditulis ke Sample_Type Matriks, label_aktual Bab5, dan evaluation_matrices. Tes 'label sampel yang tidak dikirim klien tidak diisi tebakan' (CalibrationDevSplitTest:198-210) hanya memeriksa metadata, sehingga memberi rasa aman yang keliru. (2) Frontend mengunci durationS: 8.0 (FaceScannerContainer.tsx:993), jadi scan_duration_s tidak pernah terukur walaupun dikirim. (3) Sentinel EAR/MAR 0,30/0,05 (baris 713-714) terkirim bila wajah tidak terdeteksi. (4) Fallback lain di AttendanceHistoryController: baris 628 (?? 8.0) dan 724 (?? 'BONA_FIDE', ?? 0). (5) Usulan face_pct null di server tidak cukup, karena frontend mengirim 100.0 secara eksplisit bila total frame 0 (baris 976). Frontend juga harus diubah.

### X5: (Kebersihan) Komentar basi tentang kolom NOT NULL evaluation_matrices

- **Verdict:** Bisa sesuai PRD; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Komentar mengatakan distance_cm/lux_value masih NOT NULL default 30/300, padahal migrasi 2026_09_27 sudah membuatnya nullable. Perilaku kode sudah benar (nilai tak terukur tidak dikirim, jadi tersimpan NULL).
- **Konflik dan dampak:** Tidak berdampak ke data, tetapi bisa menyesatkan agen yang mengira kolom ini masih berisi default 30/300.
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:595`: `Kolom distance_cm/lux_value masih integer NOT NULL (default 30/300)`
  - `attendance-web/database/migrations/2026_09_27_000001_make_evaluation_matrices_sensor_nullable.php:17`: `$table->integer('distance_cm')->nullable()->default(null)->change();`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:595`: Perbarui komentar: kolom nullable sejak 2026_09_27; null berarti tidak terukur.

## engine (Agen 3 vision-preproc + Agen 4 facenet-identity)

**Path PRD yang tidak ada di repo:**

- biometric-api/services/preproc_service.py
- biometric-api/schemas/biometric_schema.py
- biometric-api/services/facenet_service.py (yang ada hanya biometric-api/app/services/facenet_service.py, kode mock berbasis cosine yang tidak dipakai /verify)
- biometric-api/models/embeddings_store.py
- biometric-api/services/ (direktori)
- biometric-api/schemas/ (direktori)
- biometric-api/models/ (direktori)

**Berkas nyata wilayah agen:**

- `facenet_emar_system.py`: Inti mesin. FaceNetModule (baris 358-785: MTCNN, ekstraksi embedding, D_L2, s_embed), konstanta FACENET_* dan D_REF (178-184), serta jalur verifikasi web verify_video_file/_verify_video_file beserta kandidat FaceNet (2348-2740). Semua butir E1-E6 bermuara di sini.
- `biometric-api/main.py`: Entry FastAPI (uvicorn port 5000). Hanya memasang routers/ dan tidak memakai app/.
- `biometric-api/routers/attendance.py`: Endpoint /verify dan /api/verify, skema respons AttendanceResponse (tempat field baru seperti latensi, n_frames, dan jarak kandidat harus dideklarasikan), get_engine, serta penghapusan video sementara.
- `biometric-api/routers/enrollment.py`: Pendaftaran dan pratinjau template (build_template/persist_template) yang memakai MTCNN dan normalisasi yang sama dengan probe. Setiap perubahan preprocessing juga berdampak di sini.
- `biometric-api/routers/measure.py`: Pengukuran (kecerahan dan lebar wajah) yang berbagi get_engine.
- `parameter_penelitian.py`: Hanya dibaca dan diimpor: sumber ambang terkunci (FACENET_DISTANCE_THRESHOLD, OBSERVATION_WINDOW_S). Konstanta baru seperti margin MTCNN atau ambang FTA hanya boleh masuk ke sini setelah peneliti menyetujui.
- `tests/test_verifikasi_video_paralel.py`: Mengunci kandidat FaceNet, early exit 0,35, dan kesetaraan dengan algoritma lama (baris 268-284, 359-376, 427, 477).
- `tests/test_percepatan_deteksi.py`: Mengunci bahwa crop MTCNN yang masuk InceptionResnetV1 identik dengan MTCNN.forward.
- `tests/test_parameter_naskah.py`: Mengunci parameter naskah dan rumus s_embed (memakai D_REF).
- `tests/test_template_galeri.py`: Template galeri: rata-rata embedding lalu normalisasi L2.
- `biometric-api/tests/test_attendance_router.py`: Memastikan hasil mesin diteruskan /verify tanpa diubah, termasuk FTA tanpa jarak karangan.
- `biometric-api/tests/test_enroll_verify_real_engine.py`: Uji enroll lalu verify dengan model sungguhan pada galeri sementara.
- `biometric-api/tests/test_enroll_preview_real_engine.py`: Uji pratinjau pendaftaran dengan mesin sungguhan.
- `biometric-api/app/services/facenet_service.py`: Kode mati terhadap /verify: FaceNetService berbasis cosine dengan ambang injeksi, hanya dipakai tes. Perlu keputusan: arsipkan atau tandai mock.
- `biometric-api/app/services/alignment_service.py`: Kode mati terhadap /verify: hanya validasi anchor dan crop bounds tanpa warpAffine, hanya dipakai tes.
- `biometric-api/app/api/verify.py`: Endpoint mock /api/v1/verify dengan skor 0,85 tetap. Tidak dipasang oleh biometric-api/main.py.

### E0: Klaim platform FastAPI Python 3.11+, port 5000, dan struktur berkas PRD (services/, schemas/, models/)

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** FastAPI ada di biometric-api/main.py dan berjalan di port 5000, dengan requires-python >=3.11. Endpoint /verify-nya memanggil facenet_emar_system.verify_video_file. Ada dua server lain. Dockerfile menjalankan Flask (facenet_emar_system.py api) di port 5000 yang sama. biometric-api/app/main.py adalah aplikasi FastAPI ketiga berisi mock /api/v1/verify (skor 0,85 tetap) yang tidak dipasang main.py dan hanya dipakai tes. Dari path PRD, hanya biometric-api/main.py yang ada.
- **Konflik dan dampak:** Klaim runtime sebagian benar, tetapi peta berkas PRD fiktif. Agen yang membuat services/facenet_service.py baru, atau membangun di atas app/services (cosine, ambang injeksi, skor mock), akan menghasilkan logika kedua yang terpisah dari verify_video_file, sehingga angka penelitian tidak lagi berasal dari satu jalur. Dockerfile yang menjalankan Flask bertentangan dengan DECISION_LOG.md:16. Saat ini tidak berdampak ke angka karena Flask /verify juga memanggil verify_video_file (facenet_emar_system.py:2829), tetapi naskah yang menyebut FastAPI tidak sesuai dengan cara kontainer dijalankan.
- **Bukti:**
  - `biometric-api/main.py:75`: `uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)`
  - `biometric-api/main.py:65`: `from routers import enrollment, attendance, measure`
  - `biometric-api/pyproject.toml:9`: `requires-python = ">=3.11"`
  - `Dockerfile:50`: `CMD ["python", "facenet_emar_system.py", "api", "--host", "0.0.0.0", "--port", "5000"]`
  - `docs/specs/DECISION_LOG.md:16`: `Biometric API:** FastAPI (Python). ... (Menolak Flask).`
  - `biometric-api/app/api/verify.py:18`: `# TODO: Implement actual MTCNN face detection and EMAR liveness`
  - `biometric-api/app/api/verify.py:33`: `score = 0.85`
  - `biometric-api/routers/attendance.py:84`: `result = verify_video_file(system, file_path, target_id)`
  - `attendance-web/app/Http/Controllers/PresensiController.php:253`: `$response = $send($baseUrl.'/verify');`
- **Usulan perubahan:**
  - `facenet_emar_system.py`: Tetapkan berkas ini (FaceNetModule dan _verify_video_file) sebagai wilayah nyata Agen 3/4. Jangan membuat biometric-api/services\|schemas\|models.
  - `biometric-api/routers/attendance.py:10`: Jadikan AttendanceResponse satu-satunya skema respons /verify (pengganti biometric_schema.py dari PRD).
  - `biometric-api/app/api/verify.py`: Keputusan peneliti: arsipkan atau hapus aplikasi mock app/ beserta tesnya, atau beri tanda jelas bahwa itu mock. Bukan untuk dikembangkan.
  - `Dockerfile:50`: (Wilayah infra) Opsional: ganti CMD ke uvicorn biometric-api/main.py agar sesuai DECISION_LOG. Angka tidak berubah karena logikanya sama.
- **Pertanyaan keputusan:** Apakah aplikasi mock biometric-api/app/ diarsipkan atau dihapus, dan apakah kontainer harus menjalankan FastAPI alih-alih Flask?
- **Catatan verifier:** Inti klaim terbukti. FastAPI ada di biometric-api/main.py dengan port 5000 dan requires-python >=3.11. /verify dipasang lewat routers/attendance.py dan memanggil facenet_emar_system.verify_video_file (attendance.py:54, 84). Dockerfile menjalankan Flask di port 5000, bertentangan dengan DECISION_LOG.md:16. Flask /verify juga memanggil verify_video_file (facenet_emar_system.py:2829). Koreksi: (1) Klaim bahwa biometric-api/app/main.py dan app/api/verify.py (mock skor 0,85) 'hanya dipakai tes' keliru. Tidak ada tes yang mengimpor app.main atau app.api. Tes hanya mengimpor app.services.* dan app.evaluation.* (mis. test_adaptive_verification.py:6, test_e2e_mock_pipeline.py:23-26), jadi app/main.py dan app/api/verify.py adalah kode mati total. (2) Dampak Docker/Flask yang terlewat: Flask hanya punya /health, /enroll, /verify, /subjects, /attendance/*, /metrics, dan /tune-alpha. Flask tidak punya /enroll/preview, /enroll/commit, /gallery/status, /measure/face-width, atau /measure/brightness, padahal semuanya dipanggil Laravel (ManualEnrollmentController:104,241; DistanceCalibrationController:259; EngineBrightness:52; TemplateReadiness:33). Di kontainer, pratinjau pendaftaran, kalibrasi jarak, dan pengukuran kecerahan akan 404. Angka /verify memang sama, tetapi data kondisi (lux/jarak) dan alur pendaftaran tidak setara. (3) Usulan 'ganti CMD ke uvicorn' tidak cukup. requirements.txt yang dipasang Dockerfile hanya memuat flask/flask-cors (baris 26-27), tanpa fastapi/uvicorn/python-multipart. FastAPI main.py juga tidak punya route /health, padahal HEALTHCHECK Dockerfile:47 dan docker-compose memakainya. (4) docker-compose.yml:23,26 mengisi FACENET_THRESHOLD=0.40 dan ALPHA=0.60, tetapi tidak ada kode Python yang membacanya. Satu-satunya env yang dibaca mesin adalah FACENET_GALLERY_PATH (facenet_emar_system.py:183), jadi variabel tersebut hanya ilusi konfigurasi. (5) main.py:55 memuat kelas AttendanceResponse kedua yang tidak dipakai dan berbeda field-nya dari routers/attendance.py:10. Kelas ini perlu dihapus atau ditandai bila AttendanceResponse router dijadikan skema tunggal. (6) Path PRD tidak ada di repo ini, sehingga tidak bisa diverifikasi. Berkas bernama serupa ada di bawah app/ (app/services/facenet_service.py, app/schemas.py), jadi 'peta PRD fiktif' lebih tepat dibaca sebagai 'menunjuk ke kode mati di app/'.

### E1: Time-Window Enforcer: potong frame tepat 8,0 s sejak instruksi tantangan dimulai

- **Verdict:** Bisa dengan perubahan; ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Browser merekam dengan MediaRecorder sejak t=0 dan berhenti 8000 ms kemudian. Tantangan acak baru muncul saat elapsed >= 1,0 s (interval 50 ms, jadi 1,00-1,05 s), sehingga hanya sekitar 7,0 s rekaman yang berada setelah instruksi. Offset instruksi tidak dikirim ke server, dan scan_duration_s dikirim sebagai konstanta 8.0, bukan hasil ukur. Mesin memproses seluruh video. EMAR memakai jendela geser 8,0 s dengan timestamp idx/fps (fps dari CAP_PROP_FPS, fallback 30), dan hasilnya diambil dari frame berlandmark terakhir. Kandidat FaceNet berada di 10%-90% seluruh video, sehingga kandidat 10% (sekitar 0,8 s) jatuh sebelum instruksi. Tidak ada pemotongan berbasis instruksi di mana pun.
- **Konflik dan dampak:** Nilai OBSERVATION_WINDOW_S=8,0 terkunci, tetapi titik awalnya tidak didefinisikan di sumber terkunci (parameter_penelitian.py:35-38 hanya menyebut 'jendela observasi 8,0 s'). Implementasi sekarang menafsirkannya sejak rekaman dimulai. Agar 'tepat 8,0 s sejak instruksi' terpenuhi, rekaman perlu sekitar 9,05 s (1,0-1,05 s ditambah 8,0 s), atau tantangan dipindah ke t=0. Keduanya mengubah input mesin: panjang video berubah, dan posisi kandidat FaceNet ikut bergeser karena dihitung dari n_frames. Akibatnya distance dan field EMAR tidak identik dengan presentasi yang sudah direkam, termasuk calibration_dev dari PR #2 (aturan identik di thesis-guard.md:87). 'Tepat' juga belum terjamin: timestamp diturunkan dari idx/fps dengan fallback 30, padahal rekaman MediaRecorder tidak menyimpan durasi (2532-2535). Pemotongan presisi butuh PTS frame. Catatan: keputusan S2 di Laravel memakai status tantangan dari browser (PresensiController.php:328-329), bukan jendela EMAR mesin. Jadi enforcer di mesin tidak otomatis mengubah S2 web. scan_duration_s=8.0 adalah nilai tidak terukur yang tercatat sebagai ukuran ('?? 8.0' di thesis-guard.md:85).
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:144`: `const SCAN_DURATION_MS = 8000; // Jendela observasi pasif 8,0 s (Tabel 5.2)`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:949`: `if (elapsedSec >= 1.0 && !activeChallengeRef.current) {`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1007`: `}, SCAN_DURATION_MS);`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:993`: `durationS: 8.0,`
  - `attendance-web/app/Http/Controllers/PresensiController.php:194`: `$scanDuration = (float) ($request->input('scan_duration_s') ?: 8.0);`
  - `facenet_emar_system.py:2611`: `fps = video_fps if 1.0 <= video_fps <= 240.0 else 30.0`
  - `facenet_emar_system.py:2637`: `res = system.emar.push_measurement(m, timestamp=idx / fps)`
  - `facenet_emar_system.py:976`: `now - self._ts_buffer[0] > OBSERVATION_WINDOW_S`
  - `facenet_emar_system.py:2515`: `FACENET_CANDIDATE_RATIOS = (0.10, 0.20, ... 0.90)`
  - `facenet_emar_system.py:2535`: `CAP_PROP_FRAME_COUNT-nya tidak bermakna (terukur 7903 untuk 154 frame).`
  - `parameter_penelitian.py:35`: `OBSERVATION_WINDOW_S = 8.0 # batas jendela pengamatan`
  - `attendance-web/app/Http/Controllers/PresensiController.php:329`: `$isLivenessValid = ($challengeStatus === 'PASS_LIVENESS');`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:949`: (Wilayah frontend) Catat challenge_onset_ms = performance.now() - startTime saat tantangan muncul dan kirim sebagai hasil ukur.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:993`: (Wilayah frontend) Isi durationS dengan selisih waktu nyata di onstop, bukan konstanta 8.0.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:1004`: Hanya bila peneliti menyetujui: hentikan rekaman pada onset+8000 ms, bukan 8000 ms sejak recorder.start().
  - `attendance-web/resources/js/Pages/Presensi/Index.tsx:829`: Tambahkan formData.append('challenge_onset_ms', ...).
  - `attendance-web/app/Http/Controllers/PresensiController.php:240`: (Wilayah Laravel) Teruskan challenge_onset_ms ke payload mesin dan simpan di metadata.
  - `biometric-api/routers/attendance.py:57`: Tambahkan Form opsional window_start_ms dan teruskan ke verify_video_file.
  - `facenet_emar_system.py:2599`: Tambahkan parameter opsional window_start_s. Ambil timestamp dari CAP_PROP_POS_MSEC, lewati frame di luar [start, start+OBSERVATION_WINDOW_S] untuk EMAR dan kandidat FaceNet, lalu laporkan window_start_s, window_end_s, dan n_frames_window. Tanpa parameter, perilaku harus identik dengan sekarang.
  - `tests/test_verifikasi_video_paralel.py`: Tambahkan tes: tanpa window, hasil identik dengan versi sekarang. Dengan window, frame di luar jendela tidak dievaluasi EMAR maupun FaceNet.
- **Pertanyaan keputusan:** Apakah jendela 8,0 s dihitung sejak instruksi tantangan (rekaman diperpanjang menjadi sekitar 9,05 s, sehingga data lama tidak sebanding), atau tetap sejak rekaman dimulai seperti sekarang?

### E2: MTCNN(image_size=160, margin=14, thresholds=[0.6,0.7,0.9], keep_all=False) dan latency_mtcnn_ms via time.perf_counter()

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Satu-satunya MTCNN di repo adalah MTCNN(image_size=160, margin=20, min_face_size=40, thresholds=[0.6,0.7,0.7], factor=0.709, post_process=True, keep_all=False). Setelah deteksi, kotak pertama disaring dengan FACENET_MIN_CONFIDENCE=0,90. Latensi MTCNN tidak diukur di jalur mana pun. MTCNN yang sama dipakai untuk probe dan pembuatan template galeri.
- **Konflik dan dampak:** Mengubah margin 20 menjadi 14 dan ambang stage-3 0,7 menjadi 0,9 mengubah potongan wajah dan kotak yang masuk InceptionResnetV1. Akibatnya seluruh embedding, distance, s_embed, dan S1/S2/S3 berubah, dan hasilnya tidak identik. Template galeri dibangun dengan MTCNN yang sama (enrollment.py:158, 223). Bila margin diubah, template lama (margin 20) tidak sebanding dengan probe baru: ke-18 subjek wajib didaftar ulang, dan data kalibrasi atau uji yang sudah ada tidak bisa digabung. Nilai margin dan threshold MTCNN tidak tercantum di sumber terkunci, jadi angka PRD adalah nilai baru yang butuh persetujuan. PRD tidak menyebut min_face_size=40; bila konstruktor PRD disalin apa adanya, default pustaka (20) terpakai dan deteksi berubah. Ambang ONet 0,9 tidak setara dengan filter 0,90 yang sekarang. Filter sekarang hanya memeriksa probs[0] setelah pemilihan kotak, sedangkan ambang ONet membuang kotak sebelum pemilihan, sehingga kasus multi-wajah bisa berpindah dari FTA ke terukur. Ini perilaku pustaka facenet-pytorch yang tidak bisa diverifikasi dari repo karena pustakanya tidak terpasang di checkout. Pengukuran latency_mtcnn_ms dengan perf_counter bersifat aditif dan tidak mengubah angka.
- **Bukti:**
  - `facenet_emar_system.py:381`: `margin = 20,`
  - `facenet_emar_system.py:382`: `min_face_size = FACENET_MIN_FACE_SIZE,`
  - `facenet_emar_system.py:383`: `thresholds = [0.6, 0.7, 0.7],`
  - `facenet_emar_system.py:386`: `keep_all = False,`
  - `facenet_emar_system.py:180`: `FACENET_MIN_CONFIDENCE = 0.90`
  - `facenet_emar_system.py:668`: `or float(probs[0]) < FACENET_MIN_CONFIDENCE):`
  - `biometric-api/routers/enrollment.py:158`: `await run_in_threadpool(facenet.build_template, images, actual_id)`
  - `.claude/agents/thesis-guard.md:87`: `Flag changes that alter inputs (resolution, frame skipping, detector pyramid, ...) as not identical.`
- **Usulan perubahan:**
  - `facenet_emar_system.py:379`: Jangan ubah margin atau thresholds tanpa persetujuan peneliti. Bila disetujui, pindahkan ke parameter_penelitian.py (mis. MTCNN_MARGIN, MTCNN_THRESHOLDS), pin di tests/test_parameter_naskah.py, daftar ulang seluruh galeri, dan sertakan versi preprocessing di respons agar data lama dan baru bisa dipisahkan.
  - `facenet_emar_system.py:665`: Bungkus detect, select_boxes, dan extract dengan time.perf_counter() (ditambah torch.cuda.synchronize() bila DEVICE cuda) menjadi latency_mtcnn_ms. Simpan di field baru FaceNetResult (baris 272-279).
  - `facenet_emar_system.py:2668`: Agregasikan latency_mtcnn_ms per kandidat (daftar dan jumlah) ke dict hasil _verify_video_file (2721-2738).
  - `biometric-api/routers/attendance.py:10`: Deklarasikan field latensi di AttendanceResponse. Pydantic membuang kunci yang tidak dideklarasikan.
- **Pertanyaan keputusan:** Apakah margin MTCNN tetap 20 dan thresholds [0.6,0.7,0.7] (hasil identik), atau diganti ke 14 dan [0.6,0.7,0.9] dengan konsekuensi daftar ulang galeri dan data lama tidak sebanding?
- **Catatan verifier:** Inti klaim terbukti. Satu-satunya konstruktor MTCNN di repo ada di facenet_emar_system.py:379-388 dengan margin=20, min_face_size=40, thresholds=[0.6,0.7,0.7], factor=0.709, post_process=True, dan keep_all=False. Filter confidence 0,90 ada di baris 666-668. MTCNN yang sama dipakai untuk probe dan template (build_template → _extract_embedding, baris 510; enrollment.py:158, 223; juga daftar_ulang_wajah.py:229 dan Flask /enroll 2802). Koreksi: (1) conflictDetail bertentangan dengan currentState dan kode. Filter TIDAK memeriksa probs[0] 'setelah pemilihan kotak'. Filter memeriksa probs[0] hasil detect() (baris 665-668) SEBELUM select_boxes (baris 672-673). Apakah probs[0] = kotak yang akhirnya dipilih bergantung pada urutan keluaran detect() dan selection_method di pustaka. facenet-pytorch tidak terpasang di checkout (pip show: not found), jadi hal ini tidak terverifikasi dari repo. Substansinya tetap berlaku: ambang ONet 0,9 membuang kotak sebelum pemilihan, sedangkan filter sekarang menolak seluruh frame (None → FTA) bila kotak pertama < 0,90. (2) Rujukan '.claude/agents/thesis-guard.md:87' salah baris karena berkas hanya 31 baris. Aturan input-identik ada di baris 26. (3) 'Latensi MTCNN tidak diukur' benar untuk MTCNN secara terpisah. Yang sudah ada adalah processing_ms gabungan FaceNet+EMAR di jalur realtime (2033/2049, 2100-2103), frame_ms di capture_session.py:335, dan latencyMs round-trip di browser (Index.tsx:868). Tidak satu pun masuk respons /verify. (4) tests/test_percepatan_deteksi.py mengunci bahwa crop masuk ResNet identik dengan MTCNN.forward. Mengubah margin/thresholds tidak merusak tes ini (pembandingnya MTCNN yang sama), jadi tes ini bukan pengaman parameter. Pin baru memang diperlukan.

### E3: FTA bila wajah terdeteksi < 30% frame dalam 8 s, dilaporkan terpisah dari BPCER

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** FTA mesin hanya ada dua jenis. FACE_NOT_DETECTED terjadi bila tidak satu pun kandidat yang dievaluasi (maksimal 9) memberi embedding MTCNN dengan probabilitas >= 0,90. SUBJECT_NOT_ENROLLED terjadi bila subjek tidak ada di galeri. Laravel menandainya sebagai biometric_source 'fta'. Gerbang 'Kestabilan Wajah >= 80%' memakai face_pct dari browser, tetapi counter total dan terdeteksi sama-sama hanya naik setelah 'if (!hasFace) return;'. Akibatnya face_pct selalu 100, termasuk lewat fallback 100.0 saat 0 frame. Aturan '<30% frame' tidak ada di mana pun, dan ACCEPTANCE_CRITERIA hanya menyebut 'lebih dari X detik'. FTA sudah dipisahkan dari APCER/BPCER.
- **Konflik dan dampak:** Angka 30% adalah ambang baru yang tidak ada di parameter_penelitian.py, DECISION_LOG, maupun THESIS_METHODOLOGY, sedangkan .cursor/rules/thesis-methodology.mdc:58 melarang ambang baru tanpa persetujuan. Bila diterapkan, sebagian presentasi yang kini terukur akan menjadi FTA, sehingga FTA rate serta penyebut APCER dan BPCER berubah. Presentasi lama tidak bisa diklasifikasi ulang: video dihapus setelah verifikasi (attendance.py:87-89), dan Laravel hanya menyimpan engine_face_width_frames (PresensiController.php:1117) tanpa total frame. Pilihan detektor juga perlu diputuskan. MTCNN di semua frame mahal (lihat E5), sedangkan hitungan wajah dlib per frame sudah tersedia tanpa biaya tambahan (face_width_frames), tetapi itu detektor HOG dlib, bukan MTCNN. Temuan terkait: gerbang stabilitas 80% sekarang tidak bermakna karena face_pct selalu 100, dan fallback 100.0 mengisi nilai yang tidak terukur (melanggar thesis-guard.md:85 '?? 100').
- **Bukti:**
  - `facenet_emar_system.py:2701`: `fta_reason = "FACE_NOT_DETECTED"`
  - `facenet_emar_system.py:2703`: `fta_reason = "SUBJECT_NOT_ENROLLED"`
  - `attendance-web/app/Http/Controllers/PresensiController.php:323`: `$isStabilityValid = ($facePct >= $minStability);`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:725`: `if (!hasFace) return;`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:739`: `totalFramesRef.current++; detectedFramesRef.current++;`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:976`: `: 100.0;`
  - `docs/specs/ACCEPTANCE_CRITERIA.md:20`: `gagal deteksi wajah lebih dari X detik menghasilkan FTA.`
  - `docs/specs/DECISION_LOG.md:21`: `FTA dilaporkan terpisah, bukan digabung dalam klasifikasi.`
  - `scripts/analisis_kalibrasi_dev.py:17`: `FTA (mesin tidak menghasilkan jarak L2) dilaporkan terpisah`
  - `facenet_emar_system.py:2438`: `"face_width_frames": len(self.ratios),`
  - `biometric-api/routers/attendance.py:89`: `os.remove(file_path)`
- **Usulan perubahan:**
  - `facenet_emar_system.py:2721`: Tambahkan field aditif n_frames, face_frames_dlib (=len(face_width.ratios)), dan face_frame_ratio ke dict hasil. Keputusan dan field lama tidak berubah.
  - `biometric-api/routers/attendance.py:10`: Deklarasikan n_frames, face_frames_dlib, dan face_frame_ratio di AttendanceResponse.
  - `attendance-web/app/Http/Controllers/PresensiController.php:1117`: (Wilayah Laravel) Simpan engine_n_frames dan engine_face_frame_ratio di metadata agar aturan FTA bisa dianalisis tanpa tebakan.
  - `parameter_penelitian.py`: Hanya setelah persetujuan: tambahkan FTA_MIN_FACE_FRAME_RATIO = 0.30 beserta definisi detektor (dlib atau MTCNN) dan jendela waktunya, plus tes di tests/test_parameter_naskah.py.
  - `facenet_emar_system.py:2700`: Hanya setelah persetujuan: tambahkan fta_reason 'LOW_FACE_PRESENCE' bila rasio < ambang. Distance tetap dilaporkan terpisah agar analisis sensitivitas bisa dilakukan.
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:725`: (Wilayah frontend) Naikkan totalFramesRef sebelum 'if (!hasFace) return'. Fallback di baris 974-976 diganti null, bukan 100.0.
- **Pertanyaan keputusan:** Apakah aturan FTA baru '<30% frame berwajah' disetujui, dengan detektor apa (dlib yang sudah dihitung, atau MTCNN yang mahal), dan jendela mana (seluruh video atau 8 s sejak instruksi)?

### E4: Affine alignment 5 titik MTCNN ke 160x160, normalisasi (x-127.5)/128, crop 80x80 skala 2.7x dan 4.0x untuk MiniFASNet, crop grayscale untuk dlib

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak ada alignment affine. _extract_embedding memanggil mtcnn.detect(landmarks=True) lalu mtcnn.extract(img_rgb, boxes, None), yaitu potong kotak ditambah margin lalu resize ke 160. Titik 'points' dihitung tetapi tidak dipakai untuk warp. Normalisasi (x-127.5)/128 sudah dilakukan pustaka lewat post_process=True (fixed_image_standardization). Keduanya perilaku pustaka facenet-pytorch: dikonfirmasi dari dokumentasi pustaka, tidak bisa dibuktikan dari kode repo. alignment_service.py di biometric-api/app hanya memvalidasi anchor dan menghitung crop bounds tanpa warpAffine, dan hanya diimpor tes. MiniFASNet tidak ditemukan di repo. dlib dijalankan pada frame penuh yang dikonversi grayscale, bukan pada crop.
- **Konflik dan dampak:** (a) Alignment affine 5 titik mengubah piksel masukan FaceNet, sehingga embedding dan distance berubah, galeri harus dibangun ulang, dan data lama tidak sebanding (aturan identik). (b) MiniFASNet adalah PAD CNN baru, padahal DECISION_LOG.md:10-13 dan THESIS_METHODOLOGY.md:35 menetapkan PAD = EMAR. Menambahkannya mengubah objek penelitian (skenario S1/S2/S3 FaceNet+EMAR) dan butuh bobot model yang tidak ada di repo. (c) Crop grayscale untuk dlib mengubah input detektor dlib, sehingga EAR, MAR, dan siklus kedip/mulut bisa berubah. face_width_ratio dihitung terhadap lebar frame penuh (1026), jadi crop akan merusak kalibrasi jarak d = a/r + b kecuali dikoreksi. (d) Normalisasi (x-127.5)/128 sudah ada, jadi tidak perlu perubahan.
- **Bukti:**
  - `facenet_emar_system.py:665`: `boxes, probs, points = self.mtcnn.detect(img_rgb, landmarks=True)`
  - `facenet_emar_system.py:674`: `face_tensor = self.mtcnn.extract(img_rgb, boxes, None)`
  - `facenet_emar_system.py:385`: `post_process = True,`
  - `biometric-api/app/services/alignment_service.py:105`: `def calculate_crop_bounds(`
  - `biometric-api/tests/test_adaptive_verification.py:6`: `from app.services.alignment_service import AlignmentService, FacialAnchors`
  - `facenet_emar_system.py:1013`: `gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)`
  - `facenet_emar_system.py:1026`: `frame_width=int(img_bgr.shape[1]),`
  - `docs/specs/DECISION_LOG.md:13`: `Temporal EMAR pasif dan challenge (blink/smile) adalah fokus skripsi ini.`
  - `docs/specs/THESIS_METHODOLOGY.md:35`: `Metode Liveness:** EMAR (Eye & Mouth Aspect Ratio)`
- **Usulan perubahan:**
  - `facenet_emar_system.py:654`: Tanpa perubahan perilaku: dokumentasikan di docstring _extract_embedding bahwa standardisasi berasal dari post_process=True dan bahwa tidak ada alignment affine (crop kotak + margin + resize).
  - `facenet_emar_system.py:665`: Jangan tambahkan warpAffine, crop MiniFASNet, atau crop dlib tanpa persetujuan peneliti. Bila alignment disetujui, implementasikan sebagai mode berversi dan bangun ulang galeri.
  - `biometric-api/app/services/alignment_service.py`: Keputusan: tandai tidak dipakai /verify, atau hapus bersama app/ mock (lihat E0).
- **Pertanyaan keputusan:** Apakah alignment affine, PAD MiniFASNet, dan crop dlib termasuk lingkup skripsi? Ketiganya mengubah input atau menambah komponen PAD di luar EMAR.
- **Catatan verifier:** Inti klaim terbukti. Tidak ada warpAffine di jalur mesin: extract dipanggil dengan (img_rgb, boxes, None), dan points tidak dipakai untuk warp. alignment_service.py hanya diimpor tes. MiniFASNet tidak ditemukan di repo (git grep kosong; models/ hanya berisi shape_predictor dlib). dlib berjalan pada frame penuh grayscale tanpa resize (_iter_video_frames 2351-2370 membaca frame apa adanya). face_width_ratio = lebar rahang / lebar frame penuh (2397-2407). Koreksi: (1) Rujukan THESIS_METHODOLOGY.md:35 salah karena berkas hanya 25 baris. 'Metode Liveness: EMAR' ada di baris 14. (2) Dampak crop dlib terhadap angka penelitian perlu dipersempit. Di jalur web, keputusan S2/S3 Laravel memakai ear_blinks/mar_mouths/ear_val/mar_val dari browser (MediaPipe), bukan blink_cycles/mouth_cycles/liveness_passed dari mesin (PresensiController:189-190, 411-418; komentar 828-831). Perubahan input dlib mengubah emar_score mesin (disimpan dan diekspor sebagai metadata, PresensiController:270) dan face_width_ratio (dipakai untuk jarak, engineFaceWidth 902-913), tetapi tidak langsung mengubah S2 yang tercatat. (3) Docstring dan log mesin menyebut 'alignment' padahal tidak ada alignment: baris 362 'MTCNN (deteksi+alignment)', 378, dan 389. Ini perlu dibetulkan bersama usulan dokumentasi di baris 654. (4) Normalisasi (x-127.5)/128 lewat post_process=True adalah perilaku pustaka. Pustaka itu tidak terpasang di checkout, jadi tidak terverifikasi dari repo.

### E5: InceptionResnetV1(pretrained='vggface2') 512-D, F.normalize p=2, D_L2 per frame valid, min_l2_dist dan median_l2_dist per sesi, TAU_L2=0,40, S_FaceNet kontinu [0,1] monoton terhadap D_L2, latency_facenet_ms

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Model InceptionResnetV1(pretrained='vggface2', classify=False) dalam mode eval, embedding 512-D. Normalisasi L2 memakai numpy emb/(norm+1e-10) untuk probe, sedangkan template galeri dirata-rata lalu dibagi norm. D_L2 = np.linalg.norm(probe-gallery), dan is_verified bila d <= 0,40. Per presentasi web, FaceNet hanya dievaluasi pada maksimal 9 frame kandidat (10%-90% panjang video), urut naik, dan berhenti begitu d <= 0,35 (early exit). Yang dilaporkan adalah d terkecil di antara kandidat yang sempat dievaluasi. Bila tidak ada kandidat berwajah, dipakai frame tengah. Jumlah evaluasi minimal 1 dan maksimal 9, dari sekitar 154-240 frame yang didekode. D_L2 per frame, min_l2_dist, dan median_l2_dist tidak ada di respons, dan Laravel menyimpan satu jarak per presentasi. S_FaceNet = s_embed = max(0, 1 - d/1,20): kontinu, monoton tidak naik, dan bernilai 0 untuk d >= 1,2. TAU_L2 sudah ada sebagai FACENET_DISTANCE_THRESHOLD. latency_facenet_ms tidak ada.
- **Konflik dan dampak:** (1) Karena early exit 0,35, 'distance' bukan minimum 9 kandidat. Bila kandidat awal ber-d 0,34, evaluasi berhenti dan kandidat lain yang mungkin 0,28 tidak pernah terlihat. Keputusan pada tau >= 0,35 tidak terpengaruh, tetapi sapuan ambang di scripts/analisis_kalibrasi_dev.py:62 (L2_GRID memuat 0,30) menjadi bias: FNMR pada 0,30 terlalu tinggi dan IAPMR pada 0,30 terlalu rendah. (2) Mengganti aturan pemilihan (minimum semua frame atau median) mengubah 'distance', sehingga S1/S2/S3 berubah dan tidak identik dengan data yang sudah ada. Early exit 0,35 juga dijaga thesis-guard.md:84 dan tes test_verifikasi_video_paralel.py:268-284. (3) Biaya D_L2 untuk semua frame: MTCNN sekitar 0,3 s per frame 1080p (671) dikali 154-240 frame per video 8 s (2535, 212) memberi sekitar 46-72 s untuk MTCNN saja per presentasi, belum termasuk ResNet. Ini estimasi dari komentar kode, bukan hasil ukur. Bandingkan dengan sekitar 15 s sekarang dan batas 90 s, sementara _VERIFY_LOCK membuat verifikasi berjalan satu per satu, sehingga presensi berisiko timeout UNAVAILABLE. Data lama juga tidak bisa dihitung ulang karena videonya dihapus (attendance.py:87-89). (4) Skala S_FaceNet tidak konsisten: mesin memakai D_REF=1,20, sedangkan evaluate_trial, evaluation_bab5.py:95, dan analisis memakai 1,5. Komentar di baris 279 juga basi. Monotonisitas terpenuhi, tetapi nilai S3 bergantung pada skala mana yang dipakai. (5) THESIS_METHODOLOGY.md:31 menyebut cosine, sedangkan mesin memakai Euclidean. Keduanya setara lewat cos = 1 - d²/2 (d=0,40 setara cos 0,92), asalkan naskah menyatakannya. app/services/facenet_service.py (cosine) adalah kode mati. (6) F.normalize(p=2) membagi dengan max(norm, 1e-12), berbeda dari norm+1e-10, sehingga hasilnya beda di bit terakhir dan tidak bit-identik. Secara matematis sama, jadi tidak perlu diubah.
- **Bukti:**
  - `facenet_emar_system.py:394`: `pretrained = "vggface2",`
  - `facenet_emar_system.py:178`: `FACENET_EMBEDDING_SIZE = 512`
  - `facenet_emar_system.py:680`: `emb = emb / (np.linalg.norm(emb) + 1e-10)`
  - `facenet_emar_system.py:520`: `mean_emb = mean_emb / np.linalg.norm(mean_emb) # L2-normalize`
  - `facenet_emar_system.py:745`: `dist = float(np.linalg.norm(probe_emb - gallery_emb))`
  - `facenet_emar_system.py:751`: `result.s_embed = float(max(0.0, 1.0 - dist / D_REF))`
  - `facenet_emar_system.py:181`: `D_REF = 1.20`
  - `facenet_emar_system.py:2518`: `FACENET_EARLY_EXIT_DISTANCE = 0.35`
  - `facenet_emar_system.py:2678`: `if min_dist <= FACENET_EARLY_EXIT_DISTANCE:`
  - `tests/test_verifikasi_video_paralel.py:277`: `assert len(seen) == 1`
  - `attendance-web/app/Http/Controllers/PresensiController.php:832`: `Jarak L2 hanya ada per presentasi (frame kandidat terbaik mesin)`
  - `scripts/analisis_kalibrasi_dev.py:62`: `L2_GRID = (0.30, 0.35, 0.40, 0.45, 0.50)`
  - `facenet_emar_system.py:671`: `deteksi kedua pada frame 1080p makan ~0,3 s.`
  - `facenet_emar_system.py:212`: `video presensi 8 s (240 frame)`
  - `attendance-web/config/biometrics.php:63`: `Video 1080p 8 s diproses ~15 s di CPU, ~24 s bila model baru dimuat;`
  - `attendance-web/config/biometrics.php:66`: `'verify_timeout' => (int) env('BIOMETRICS_VERIFY_TIMEOUT', 90),`
  - `facenet_emar_system.py:2348`: `_VERIFY_LOCK = threading.Lock()`
  - `facenet_emar_system.py:1378`: `p_face = max(0.0, 1.0 - (euclidean_dist / 1.5))`
  - `scripts/analisis_kalibrasi_dev.py:60`: `P_FACE_SCALE = 1.5`
  - `facenet_emar_system.py:279`: `s_embed: float = 0.0 # Skor kemiripan normal: 1 - (dist / threshold)`
  - `docs/specs/THESIS_METHODOLOGY.md:31`: `Scoring Identity:** Cosine Similarity.`
  - `parameter_penelitian.py:29`: `Embedding dinormalisasi L2, sehingga cosine = 1 - d^2 / 2.`
- **Usulan perubahan:**
  - `facenet_emar_system.py:2668`: Opsi aditif (butuh persetujuan karena tes 268-277 mengunci 1 panggilan): evaluasi semua kandidat (maksimal 9), lalu turunkan 'distance' dengan aturan lama (urut naik, berhenti pada d <= 0,35 pertama, selain itu minimum) sehingga 'distance' tetap identik. Tambahkan candidate_distances (None bila tanpa wajah), min_l2_dist_candidates, median_l2_dist_candidates, dan n_candidates_face. Biaya tambahan maksimal 8 panggilan verify (sekitar 0,3 s MTCNN + ResNet per panggilan, belum diukur).
  - `facenet_emar_system.py:676`: Ukur latency_facenet_ms di sekitar forward self.resnet dengan perf_counter (ditambah synchronize bila cuda). Simpan di FaceNetResult dan agregasikan per presentasi.
  - `facenet_emar_system.py:279`: Perbaiki komentar menjadi '1 - dist / D_REF'.
  - `biometric-api/routers/attendance.py:10`: Deklarasikan candidate_distances, min_l2_dist_candidates, median_l2_dist_candidates, dan latency_facenet_ms di AttendanceResponse.
  - `scripts/analisis_kalibrasi_dev.py:62`: (Wilayah analisis) Tandai baris tau < 0,35 sebagai bias early exit sampai minimum sejati tersedia.
  - `facenet_emar_system.py:181`: (Keputusan dengan agen fusion) Satukan skala P_face, 1,20 atau 1,5, di parameter_penelitian.py. Jangan diubah sepihak.
- **Pertanyaan keputusan:** Apakah min/median L2 didefinisikan atas 9 kandidat (murah, distance tetap identik) atau atas semua frame (sekitar 46-72 s per presentasi, berisiko timeout), dan apakah early exit 0,35 boleh dilonggarkan untuk mode riset?
- **Catatan verifier:** Inti klaim terbukti. Model InceptionResnetV1 vggface2 512-D. Probe dinormalisasi dengan emb/(norm+1e-10). Template = rata-rata lalu dibagi norm. d = norm(probe - gallery), is_verified bila d <= 0,40. s_embed = max(0, 1 - d/1,20). Maksimal 9 kandidat (rasio 0,10-0,90), early exit pada d <= 0,35, dan fallback ke frame tengah. Respons tidak memuat min/median/per-frame, dan tidak ada latency_facenet_ms. Bias early exit pada L2_GRID 0,30 terbukti dari table_l2: FNMR menghitung l2 > tau, IAPMR menghitung l2 <= tau (analisis_kalibrasi_dev.py:186-197). Video dihapus (attendance.py:87-89; Flask 2833-2834), dan Laravel tidak menyimpan video. Koreksi: (1) Rujukan salah baris: THESIS_METHODOLOGY.md 'Scoring Identity: Cosine Similarity' ada di baris 10, bukan 31. Kunci tes early exit 'assert len(seen) == 1' ada di test_verifikasi_video_paralel.py:276, bukan 277 (konstanta 0,35 dikunci di baris 281). Penjagaan D_REF dan early exit 0,35 ada di thesis-guard.md:23, bukan :84. (2) Terlewat: jalur yang menulis S3 ke dataset adalah Laravel, bukan evaluate_trial. PresensiController:421-424 memakai P_face = 1 - d/1,5 dan S3 = 0,6*P_face + 0,4*P_live >= 0,75 TANPA syarat isIdMatch. Mesin decide_s3 memakai D_REF 1,20, FINAL_THRESHOLD 0,50, dan WAJIB is_verified (baris 1285). AttendanceHistoryController:86-89 juga 1,5/0,75. Inkonsistensinya mencakup skala, ambang S3, dan aturan gerbang, bukan hanya skala P_face. (3) Terlewat: THESIS_METHODOLOGY.md:9 dan .cursor/rules/thesis-methodology.mdc:9 mewajibkan rutin normalisasi L2 yang identik untuk probe dan galeri. Probe memakai norm+1e-10 (680), sedangkan template akhir dibagi norm tanpa epsilon (520). Secara numerik perbedaannya dapat diabaikan, tetapi secara harfiah tidak satu rutin. Ini bisa diperbaiki dengan helper bersama tanpa mengubah angka secara bermakna (tetap butuh bukti bit-level bila diklaim identik). (4) Bias early exit juga memengaruhi skor kontinu (facenet_score, P_face, s_final), tidak hanya keputusan pada tau < 0,35. Pada parameter sekarang, keputusan S3 Laravel tidak berubah (P_live=1 butuh d <= 0,625; P_live=0 tidak pernah lolos). (5) Estimasi 46-72 s adalah hasil perkalian komentar kode (671: ~0,3 s; 212: 240 frame; 2535: 154 frame), bukan hasil ukur. Label 'estimasi' dari auditor sudah benar. (6) Perilaku F.normalize adalah perilaku pustaka PyTorch dan tidak terverifikasi dari repo.

### E6: S1 = 1 iff D_L2 <= 0,40

- **Verdict:** Sudah ada (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Sudah sesuai. Mesin menetapkan is_verified = d <= FACENET_DISTANCE_THRESHOLD (0,40), dan decide_s1 menerima bila is_verified. evaluate_trial memakai aturan yang sama. Laravel menghitung isIdMatch = d <= thresholdDistance dengan default 0,40 dari config/biometrics.php. Tes sudah mengunci batas 0,40 diterima dan 0,401 ditolak.
- **Konflik dan dampak:** Tidak ada konflik di mesin. Satu risiko di Laravel: ambang diambil dari ModelSettingController::getActiveSettings yang bisa ditimpa storage/app/biometrics_settings.json, sedangkan mesin memakai konstanta. Bila admin mengubah ambang, is_verified mesin dan ID_Pred Laravel bisa berbeda. Berkas itu tidak ada di checkout ini. Catatan: 'D_L2' di sini adalah jarak terpilih per presentasi (lihat E5).
- **Bukti:**
  - `facenet_emar_system.py:747`: `result.is_verified = dist <= FACENET_DISTANCE_THRESHOLD`
  - `parameter_penelitian.py:31`: `FACENET_DISTANCE_THRESHOLD = 0.40 # cocok jika d(x1, x2) <= 0,40`
  - `facenet_emar_system.py:1356`: `if euclidean_dist <= FACENET_DISTANCE_THRESHOLD:`
  - `attendance-web/app/Http/Controllers/PresensiController.php:320`: `$isIdMatch = ($euclideanDistance !== null && $euclideanDistance <= $thresholdDistance);`
  - `attendance-web/app/Http/Controllers/PresensiController.php:220`: `$thresholdDistance = (float) ($modelSettings['facenet_threshold'] ?? 0.40);`
  - `attendance-web/app/Http/Controllers/Admin/ModelSettingController.php:34`: `$path = storage_path('app/biometrics_settings.json');`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:220`: (Wilayah Laravel, opsional) Catat atau tolak presentasi bila facenet_threshold aktif berbeda dari 0,40. Tidak ada perubahan di mesin.
- **Catatan verifier:** Inti klaim terbukti. Mesin menetapkan is_verified = d <= 0,40 (747), dan decide_s1 menerima bila is_verified (1199). evaluate_trial memakai aturan yang sama (1356). Laravel isIdMatch (320) dan S1 dataset (410) memakai <= thresholdDistance. Tes mengunci 0,40 lolos dan 0,401 gagal (test_evaluation_bab5.py:67-72). Tes verify mesin memakai 0,399/0,401 (test_parameter_naskah.py:177-181). Tes Laravel memakai 0,40/0,41 (BiometricDecisionGateTest.php:255-256). Koreksi: (1) currentState keliru menyebut default 0,40 Laravel berasal dari config/biometrics.php. PresensiController:219-220 mengambilnya dari ModelSettingController::getActiveSettings(): default hardcoded 0,40 (ModelSettingController.php:25) yang ditimpa storage/app/biometrics_settings.json, dan admin boleh menyetel 0,20-0,60 (baris 79). config('biometrics.facenet_threshold') (env FACENET_THRESHOLD) hanya dipakai AttendanceHistoryController:80,281 saat menghitung ulang S1 untuk rekaman tanpa evaluation_bab5. Akibatnya ada DUA sumber ambang Laravel yang bisa berbeda satu sama lain, selain konstanta mesin. Ada juga sumber ketiga, research_settings.json milik SettingsController (min 0, max 2), yang tidak dibaca keputusan. (2) 'Berkas itu tidak ada di checkout ini' bukan bukti tidak ada saat runtime. attendance-web/storage/app/.gitignore mengabaikan semua berkas ('*'), sehingga biometrics_settings.json tidak akan pernah masuk git. Tes EvaluationThresholdResponseTest.php:64-69 justru membuktikan override 0,35 mengubah ambang presensi. Mitigasinya: PresensiController:759 mencatat facenet_threshold aktif di metadata per presentasi, sehingga penyimpangan bisa dideteksi saat analisis.

### E-LAT: Latensi per komponen (latency_mtcnn_ms, latency_facenet_ms): apakah sudah dicatat

- **Verdict:** Bisa sesuai PRD; ukuran kerja M; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** processing_ms hanya ada di jalur realtime dan offline. FaceEMARSystem.verify_frame mencatat total per frame. FusionModule.decide_s1/s2/s3 hanya mencatat waktu fusi. capture_session.py mencatat waktu per frame gabungan FaceNet+EMAR+fusi (FaceNet tiap 10 frame) ke telemetry. AttendanceDatabase punya kolom processing_ms. Jalur web /verify (verify_video_file) sama sekali tidak mengukur waktu. AttendanceResponse tidak punya field waktu, dan Laravel tidak punya kolom latensi (grep 'latency_' dan 'processing_ms' di attendance-web/app tidak menemukan apa pun).
- **Konflik dan dampak:** Tidak ada konflik angka karena pengukuran waktu tidak mengubah keluaran. Catatan: latensi CPU dipengaruhi beban dan EMAR_WORKERS. FaceNet berjalan setelah pass EMAR selesai, jadi keduanya tidak tumpang tindih. Di GPU perlu torch.cuda.synchronize agar waktu benar. Presentasi lama harus dibiarkan kosong untuk field ini, bukan diisi tebakan.
- **Bukti:**
  - `facenet_emar_system.py:2049`: `fusion_result.processing_ms = (time.perf_counter() - t_start) * 1000`
  - `facenet_emar_system.py:1572`: `processing_ms REAL,`
  - `capture_session.py:335`: `frame_ms = (time.perf_counter() - t_frame) * 1000`
  - `telemetry_logger.py:99`: `processing_ms REAL,`
  - `biometric-api/routers/attendance.py:10`: `class AttendanceResponse(BaseModel):`
- **Usulan perubahan:**
  - `facenet_emar_system.py:2627`: Ukur latency_emar_ms untuk seluruh pass EMAR, latency_total_ms untuk _verify_video_file, serta latensi MTCNN dan FaceNet per kandidat (lihat E2 dan E5). Masukkan ke dict hasil.
  - `biometric-api/routers/attendance.py:10`: Deklarasikan field latensi di AttendanceResponse.
  - `attendance-web/app/Http/Controllers/PresensiController.php`: (Wilayah Laravel) Simpan field latensi di metadata dan ekspor riwayat. Nilai null bila mesin tidak mengirimnya.
  - `biometric-api/tests/test_attendance_router.py:41`: Tambahkan tes bahwa field latensi diteruskan dan bernilai None bila tidak ada.

## emar (Agen 5 emar-pad-fusion): EAR/MAR dlib, siklus kedip/mulut, keputusan PAD, fusi S2/S3, log per frame

**Path PRD yang tidak ada di repo:**

- biometric-api/services/ (foldernya sendiri tidak ada; layanan berada di biometric-api/app/services/)
- biometric-api/services/emar_liveness_service.py
- biometric-api/services/fusion_decision_service.py
- biometric-api/services/raw_telemetry_logger.py (tidak ada raw_telemetry_logger.py di mana pun; padanannya telemetry_logger.py di root)
- storage/logs/log_raw_frames.csv (root tidak punya folder storage/. PR #2 menulis ke logs/log_raw_frames_dev.csv; attendance-web/storage/logs/ ada tetapi hanya berisi laravel.log)
- Field minifasnet_score (tidak ada di kode, skema, maupun model)

**Berkas nyata wilayah agen:**

- `facenet_emar_system.py`: Mesin produksi. count_full_cycles (:787), EMARModule dlib 68 titik (:810-1147), FusionModule decide_s1/s2/s3 (:1150-1345), evaluate_trial lama (:1351-1391), verify_video_file yang dipanggil FastAPI dan Flask (:2582-2740). Pengganti nyata untuk emar_liveness_service.py dan fusion_decision_service.py dari PRD.
- `parameter_penelitian.py`: Sumber ambang terkunci (:31-40, ATTACK_LABELS :100). Agen hanya membaca. Konstanta baru (delta EAR/MAR, TAU_FUSION) baru boleh masuk setelah peneliti menyetujui.
- `attendance-web/app/Http/Controllers/PresensiController.php`: Bagian EMAR/fusi: gerbang PAD (:319-331), S1/S2/S3 Bab 5 (:404-445), penimpaan pai_species (:635), appendRawFrames log per frame (:828-893). Wilayah bersama dengan agen Laravel.
- `attendance-web/resources/js/Utils/emarGeometry.ts`: EAR/MAR MediaPipe di browser, CycleCounter, ChallengeTracker (sumber challenge_status).
- `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx`: Akumulasi EAR/MAR 8 detik (:706-790) dan muatan yang dikirim (:970-998): earVal/marVal/challengeStatus/frameSeries.
- `attendance-web/app/Http/Controllers/AttendanceHistoryController.php`: Menghitung ulang S1/S2/S3 untuk rekaman lama (:78-95, :277-295) dengan rumus 1,5/0,75 yang sama.
- `attendance-web/resources/js/Components/Presensi/Bab5ScenarioCard.tsx`: Menghitung ulang S1/S2/S3 di UI (:85-98).
- `evaluation_bab5.py`: Penilaian S1/S2/S3 offline (P_face 1,5, ambang S3 0,75).
- `scripts/analisis_kalibrasi_dev.py`: Tabel kalibrasi PR #2: passive_live (:228), s3_accept/implied_l2 (:269-279).
- `tests/test_analisis_kalibrasi_dev.py`: Mengunci S3 == S2 bila gerbang identitas dipasang (:61-71).
- `telemetry_logger.py`: Logger per frame (dlib) untuk jalur desktop. Padanan nyata raw_telemetry_logger.py dari PRD.
- `capture_session.py`: Jalur pengambilan desktop yang mengisi telemetry.db melalui decide_all (:334-361).
- `active_liveness.py`: Challenge-response EMAR untuk desktop.
- `live_inference_pad.py`: PAD real-time desktop (EAR_CONSEC_FRAMES = 3, :68).
- `biometric-api/routers/attendance.py`: Skema respons /verify: liveness_passed, blink_cycles, mouth_cycles, emar_score (:11-30).
- `biometric-api/app/services/emar_service.py`: Layanan EMAR domain yang hanya dipakai mock app/api/verify.py dan tes, tidak dipakai jalur produksi. Rumus MAR-nya berbeda dari mesin.
- `biometric-api/app/services/fusion_service.py`: fuse_predictions (identitas AND PAD), hanya dipakai mock app/api/verify.py.
- `tests/test_parameter_naskah.py`: Mengunci perilaku siklus penuh count_full_cycles (:77-92) dan ambang naskah.
- `attendance-web/tests/Feature/BiometricDecisionGateTest.php`: Tes cut-out (:93-117) lewat jalur tanpa tantangan, jalur yang tidak pernah dipakai UI.
- `attendance-web/config/biometrics.php`: ear_threshold/mar_threshold (:22-25) dan path raw_frames_dev (:96).

### EMAR-01: P1a: EAR dari titik dlib 37-48 dan MAR dari titik 49-68 / mulut dalam 61-68, dihitung per frame

- **Verdict:** Sudah ada (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Sudah ada di mesin. Indeks dlib 0-based 36-47 (= 1-based 37-48) dan mulut dalam 60-67 (= 61-68). MAR memakai tiga pasang titik dibagi 3*D, dihitung per frame di measure(), lalu push_measurement dipanggil per frame dengan cap waktu video. Docstring kelas masih menyebut MediaPipe. Layanan biometric-api/app/services/emar_service.py memakai penyebut MAR 2*D, padahal mesin memakai 3*D, dan layanan itu tidak dipakai jalur produksi.
- **Konflik dan dampak:** Rumus dan indeks sudah sesuai. Risiko muncul bila agen membangun 'emar_liveness_service.py' di atas biometric-api/app/services/emar_service.py: MAR di sana 1,5 kali MAR mesin untuk landmark yang sama, sehingga ambang 0,10 berarti hal lain dan hasilnya tidak bisa dibandingkan dengan data mesin. Docstring yang menyebut MediaPipe menyesatkan pembaca naskah dan kode.
- **Bukti:**
  - `facenet_emar_system.py:839`: `LEFT_EYE = [36, 37, 38, 39, 40, 41]`
  - `facenet_emar_system.py:841`: `INNER_MOUTH = [60, 61, 62, 63, 64, 65, 66, 67]`
  - `facenet_emar_system.py:930`: `return (A + B + C) / (3.0 * D + 1e-6)`
  - `facenet_emar_system.py:812`: `Kalkulasi EMAR menggunakan MediaPipe FaceMesh (478 landmark).`
  - `facenet_emar_system.py:2637`: `res = system.emar.push_measurement(m, timestamp=idx / fps)`
  - `biometric-api/app/services/emar_service.py:194`: `denominator = 2.0 * _distance(points[0], points[4])`
  - `biometric-api/app/api/verify.py:30`: `# MOCK LOGIC (To be replaced with real ML services)`
- **Usulan perubahan:**
  - `facenet_emar_system.py:812`: Perbaiki docstring menjadi 'dlib 68 titik', dan komentar di :837 juga. Hanya komentar, perilaku tidak berubah.
  - `biometric-api/app/services/emar_service.py:194`: Jangan jadikan modul ini dasar agen. Bila diselaraskan, ubah penyebut ke 3*D dan perbarui ekspektasi tes biometric-api/tests/test_emar_service_domain.py:38 (0,75 -> 0,5). Rumus metrik berubah, jadi wajib disertai tes.
- **Catatan verifier:** Klaim inti benar. Indeks dlib 0-based 36-47 dan 60-67, MAR dengan penyebut 3*D, measure() per frame, dan push_measurement dengan cap waktu idx/fps semuanya terbukti. Docstring :812 dan komentar :837 masih menyebut MediaPipe. emar_service.py:194 memakai 2*D dan hanya diimpor oleh tes; jalur produksi biometric-api/main.py -> routers/attendance.py memanggil facenet_emar_system.verify_video_file. Hitungan tes juga benar: (2+2+2)/(2*4) = 0,75, sedangkan dengan 3*D hasilnya 0,5. Ada tiga koreksi. (1) 'already_done' hanya berlaku untuk mesin. Keputusan PAD/S2 yang dipakai Laravel berasal dari browser, yang memakai landmark MediaPipe 478 titik dengan indeks lain (mata 33/160/158/133/153/144, mulut dalam 78/81/13/311/308/402/14/178), bukan dlib 37-48/61-68. Rumusnya sama (3*D), tetapi titiknya berbeda. (2) Frame tanpa wajah tidak masuk buffer, karena push_measurement langsung return bila m None. Deret aktif/tidak-aktif melompati frame itu, sehingga 'per frame' artinya per frame yang berwajah. (3) biometric-api/app/main.py dengan api/verify.py adalah aplikasi mock terpisah dan bukan biometric-api/main.py yang berjalan; kutipan MOCK LOGIC benar tetapi bukan jalur produksi.

### EMAR-02: P1b: kedip bila EAR <= 0,20 dengan max_ear - min_ear >= 0,05; mulut bila MAR >= 0,10 dengan max_mar - min_mar >= 0,05 (aturan min/max per jendela)

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Mesin menghitung siklus transisi penuh: tidak-aktif, lalu aktif selama minimal N frame, lalu tidak-aktif lagi. N = 2 frame untuk kedip dan 3 frame untuk mulut. Mata dianggap tertutup bila EAR < 0,20 (ketat). Tidak ada syarat amplitudo delta. CycleCounter di browser memakai urutan yang sama tetapi tanpa minimum frame, dan live_inference_pad.py memakai 3 frame. Nilai 0,05 sebagai delta tidak ditemukan di parameter_penelitian.py maupun di kode lain. 0,05 hanya muncul sebagai nilai pengganti MAR dan sebagai kandidat grid MAR.
- **Konflik dan dampak:** (c) Aturan min/max PRD tidak memeriksa urutan. Penurunan EAR yang monoton (misalnya foto cetak dimiringkan pelan-pelan, atau video yang berakhir dengan mata tertutup) memenuhi min <= 0,20 dan rentang >= 0,05 tanpa pernah kembali terbuka. Aturan itu juga tidak punya durasi minimum, sehingga satu frame derau sudah cukup. Untuk syarat urutan, aturan PRD lebih lemah daripada 'siklus transisi penuh' dalam naskah (parameter_penelitian.py:37). Syarat amplitudo menambah pembatas yang tidak ada di naskah, jadi kedua aturan ini tidak bisa diurutkan begitu saja. Mengganti aturan berarti S2 berbeda dari data calibration_dev dan Dataset_Eksperimen_Bab5.csv yang sudah terkumpul, juga dari teks Subbab 5.3. (d) Delta 0,05 untuk EAR dan MAR adalah parameter baru yang tidak diukur maupun ditetapkan naskah. Mengubah 'EAR < 0,20' menjadi 'EAR <= 0,20' juga mengubah batas ambang terkunci. Jumlah frame minimum berbeda di tiga tempat (browser 0, mesin 2/3, desktop 3), sehingga hitungan siklus browser dan mesin tidak sebanding.
- **Bukti:**
  - `parameter_penelitian.py:32`: `EAR_BLINK_THRESHOLD = 0.20 # mata tertutup jika EAR < 0,20`
  - `parameter_penelitian.py:37`: `# "masing-masing wajib tervalidasi minimal satu siklus transisi penuh di dalam`
  - `facenet_emar_system.py:787`: `def count_full_cycles(active: List[bool], min_frames: int) -> int:`
  - `facenet_emar_system.py:207`: `BLINK_CONSEC_FRAMES = 2`
  - `facenet_emar_system.py:208`: `MOUTH_OPEN_FRAMES = 3`
  - `live_inference_pad.py:68`: `EAR_CONSEC_FRAMES = 3`
  - `tests/test_parameter_naskah.py:84`: `assert fes.count_full_cycles(flags, min_frames=3) == 1`
  - `scripts/analisis_kalibrasi_dev.py:62`: `MAR_GRID = (0.05, 0.10, 0.15, 0.20)`
- **Usulan perubahan:**
  - `scripts/analisis_kalibrasi_dev.py:228`: Tanpa mengubah keputusan sistem, delta EAR/MAR per presentasi bisa dihitung dari frame_series dan dilaporkan sebagai kolom deskriptif atau aturan eksploratif yang berlabel jelas. passive_live tetap memakai siklus penuh.
  - `parameter_penelitian.py:40`: Hanya bila peneliti menyetujui delta sebagai syarat tambahan yang di-AND-kan dengan siklus penuh (bukan pengganti): tambahkan konstanta EAR_DELTA_MIN dan MAR_DELTA_MIN beserta rujukan keputusan, lalu tes di tests/test_parameter_naskah.py. Operator '<' untuk EAR tetap.
  - `attendance-web/resources/js/Utils/emarGeometry.ts:65`: Bila disetujui, beri CycleCounter minimum frame yang sama dengan BLINK_CONSEC_FRAMES/MOUTH_OPEN_FRAMES agar hitungan browser sebanding dengan mesin. Ini mengubah perilaku dan perlu persetujuan.
- **Pertanyaan keputusan:** Apakah definisi kedipan/mulut tetap 'siklus transisi penuh' (naskah Subbab 5.3), dan apakah delta 0,05 boleh ditambahkan sebagai syarat tambahan (AND) atau hanya dilaporkan sebagai analisis eksploratif? Berapa jumlah frame minimum yang berlaku di semua jalur?
- **Catatan verifier:** Klaim inti benar: count_full_cycles, BLINK_CONSEC_FRAMES=2 dan MOUTH_OPEN_FRAMES=3, operator EAR < 0,20, CycleCounter browser tanpa minimum frame, dan delta 0,05 tidak ada di parameter_penelitian.py maupun dokumen terkunci. Ada empat koreksi. (1) Kutipan MAR_GRID ada di scripts/analisis_kalibrasi_dev.py:64, bukan :62 (baris 62 adalah L2_GRID). (2) live_inference_pad.py bukan sekadar 'memakai 3 frame'. Kedipan dihitung saat frame tertutup ke-3 tercapai, tanpa syarat mata terbuka lagi, dan mulut dihitung pada tepi naik tanpa syarat menutup atau minimum frame. Jadi jalur desktop juga bukan siklus penuh. (3) Ada jalur keempat: count_cycles di analisis_kalibrasi_dev.py:202-214 (Tabel 2b) juga tanpa minimum frame, dan deret per frame yang dihitungnya berasal dari MediaPipe browser (landmark_source 'browser_mediapipe'), bukan dlib. Usulan menghitung delta dari frame_series akan menghasilkan delta versi MediaPipe yang tidak sebanding dengan mesin dlib, dan hanya tersedia untuk split calibration_dev. (4) 0,05 juga muncul sebagai nilai awal dan reset maxMarRef di browser (FaceScannerContainer.tsx:714, :904), tidak hanya sebagai nilai pengganti controller dan grid. Tambahan: aturan bergaya min/max tanpa urutan sudah ada di kode, yaitu S2 fallback Laravel (PresensiController.php:415-419) dan AttendanceHistoryController (:83-84), yang memakai min EAR < 0,20 dan max MAR >= 0,10 tanpa siklus maupun delta.

### EMAR-03: P2: S2 = I(D_L2 <= 0,40 AND min EAR <= 0,20 AND max MAR >= 0,10 AND dMAR >= 0,05)

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Ada tiga definisi S2 yang berbeda. (1) decide_s2 di mesin: is_verified AND P_live >= 1,0, artinya siklus penuh kedip DAN mulut, dihitung dari dlib. (2) S2 di Laravel, yang masuk ke riwayat dan Dataset_Eksperimen_Bab5.csv: bila active_challenge atau challenge_status dikirim, S2 = challenge_status == 'PASS_LIVENESS'. Browser selalu mengirimnya, dengan fallback 'BLINK'. ChallengeTracker meluluskan SATU aksi acak dengan setengah transisi (terbuka lalu tertutup) dalam 4,0 detik. (3) evaluate_trial lama memakai satu nilai EAR dan satu nilai MAR. Hasil dlib dari mesin (liveness_passed, blink_cycles, mouth_cycles) dikirim ke Laravel tetapi tidak dibaca; hanya emar_score yang disimpan.
- **Konflik dan dampak:** S2 dalam PRD tidak memuat syarat kedipan berbasis siklus, tidak memuat dEAR (tidak konsisten dengan P1 milik PRD sendiri), dan memakai min/max yang tidak memeriksa urutan. Akibatnya S2 PRD bertentangan dengan 'kedipan DAN mulut, masing-masing satu siklus penuh'. S2 Laravel yang sedang berjalan juga bertentangan dengan naskah: cukup satu aksi acak, setengah transisi, dalam 4 detik, bukan 8 detik. Selain itu sumber PAD-nya MediaPipe di browser, bukan dlib (THESIS_METHODOLOGY.md:11 menyebut dlib). Dokumen terkunci juga saling bertentangan: THESIS_METHODOLOGY.md:15 menyebut 'atau', sedangkan parameter_penelitian.py:38 menyebut 'DAN'. Dampaknya, S2 di Dataset_Eksperimen_Bab5.csv dan di riwayat tidak sama dengan S2 yang ditulis di naskah. Mengganti sumber PAD ke dlib juga mengubah keputusan untuk data yang sudah terkumpul.
- **Bukti:**
  - `facenet_emar_system.py:1237`: `elif emar_result.emar_score < self.emar_threshold:`
  - `facenet_emar_system.py:195`: `EMAR_LIVENESS_THRESHOLD = 1.0 # TAU_LIVE`
  - `attendance-web/app/Http/Controllers/PresensiController.php:413`: `if ($activeChallenge \|\| $challengeStatus) {`
  - `attendance-web/app/Http/Controllers/PresensiController.php:414`: `$livenessValid = ($challengeStatus === 'PASS_LIVENESS');`
  - `attendance-web/app/Http/Controllers/PresensiController.php:329`: `$isLivenessValid = ($challengeStatus === 'PASS_LIVENESS');`
  - `attendance-web/app/Http/Controllers/PresensiController.php:270`: `$emarScore = isset($result['emar_score']) ? (float) $result['emar_score'] : null;`
  - `facenet_emar_system.py:2732`: `"liveness_passed": is_live,`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:996`: `activeChallenge: activeChallengeRef.current \|\| 'BLINK',`
  - `attendance-web/resources/js/Utils/emarGeometry.ts:137`: `else if (this.seenEyesOpen) {`
  - `attendance-web/resources/js/Utils/emarGeometry.ts:96`: `export const CHALLENGE_TIMEOUT_S = 4.0;`
  - `docs/specs/THESIS_METHODOLOGY.md:15`: `untuk mendeteksi kedipan (blink) atau bukaan mulut yang valid.`
  - `parameter_penelitian.py:38`: `Kedipan DAN gerakan mulut keduanya wajib.`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:328`: Setelah keputusan peneliti: tentukan satu sumber PAD. Bila dlib mesin: $isLivenessValid dan $livenessValid (:413-420) diambil dari $result['liveness_passed'], dan blink_cycles/mouth_cycles disimpan di metadata. challenge_status tetap dicatat sebagai kolom terpisah. Bila tidak ada hasil mesin, nilainya null, bukan fallback.
  - `attendance-web/app/Http/Controllers/PresensiController.php:270`: Simpan liveness_passed, blink_cycles, dan mouth_cycles dari mesin ke metadata walau belum dipakai untuk keputusan, supaya kedua jalur bisa dibandingkan pada presentasi yang sama.
  - `attendance-web/tests/Feature/BiometricDecisionGateTest.php:93`: Tambah kasus yang mengirim active_challenge/challenge_status, karena tes yang ada hanya menguji jalur fallback yang tidak dipakai UI.
  - `docs/specs/THESIS_METHODOLOGY.md:15`: Selaraskan 'atau' dengan 'DAN' sesuai keputusan peneliti (perubahan dokumen hanya setelah keputusan).
- **Pertanyaan keputusan:** Mana definisi PAD/S2 yang dilaporkan di naskah: (a) dlib pasif, kedipan DAN mulut siklus penuh dalam 8,0 detik (mesin, decide_s2), (b) tantangan acak satu aksi di browser (yang sekarang berjalan), atau (c) aturan min/max PRD? Bagaimana memperlakukan data yang sudah terkumpul dengan definisi (b)?
- **Catatan verifier:** Klaim tentang tiga definisi S2 terbukti: decide_s2 mesin, S2 Laravel dari challenge_status, dan evaluate_trial. ChallengeTracker cukup setengah transisi untuk satu aksi dalam 4,0 detik, dan karena tantangan baru muncul pada T >= 1 s, jendela efektifnya 1-5 s. liveness_passed, blink_cycles, dan mouth_cycles tidak dibaca di attendance-web/app. Ada empat koreksi. (1) Usulan perubahan untuk BiometricDecisionGateTest.php:93 salah fakta: tes jalur tantangan sudah ada di :276-358 (PASS_LIVENESS, REJECT_WRONG_ACTION, REJECT_TIMEOUT), juga CalibrationDevSplitTest.php:37-38. (2) Di dalam controller sendiri ada dua definisi liveness pada jalur fallback. PAD_Pred/ACCEPT (:330-331) memakai jumlah siklus ear_blinks/mar_mouths >= 1, sedangkan S2/S3 (:415-419) memakai min EAR < 0,20 dan max MAR >= 0,10. Satu rekaman bisa punya PAD_Pred dan S2 yang tidak konsisten. (3) Dokumen terkunci DECISION_LOG.md:13 secara eksplisit mengadopsi 'challenge (blink/smile)' di samping EMAR pasif. Jadi tantangan acak bukan sekadar penyimpangan; konfliknya terletak antara DECISION_LOG/THESIS_METHODOLOGY ('atau', challenge) dan parameter_penelitian.py:37-38 ('DAN', siklus penuh 8,0 s). (4) Bukti data: Dataset_Eksperimen_Bab5.csv memuat baris dengan ear 0,202 dan mar 0,05 tetapi S2 = 1. Itu mustahil menurut aturan EAR/MAR apa pun, jadi S2 di CSV memang berasal dari challenge_status.

### EMAR-04: P3: S_final = 0,60*S_FaceNet + 0,40*S_EMAR; S3 = 1 bila D <= 0,40 AND S_final >= tau_fusion AND S_EMAR >= tau_emar_min (gerbang identitas keras untuk 35 baris NON_MATCH dengan S3 = 1)

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** S3 di Laravel: P_face = max(0, 1 - d/1,5), P_live biner, S_final = 0,6*P_face + 0,4*P_live, diterima bila S_final >= 0,75, tanpa gerbang identitas. Nilai 0,75 dan 1,5 ditulis langsung di 6 tempat. tau_emar_min tidak ditemukan di mana pun. TAU_FUSION mesin = 0,50, dengan komentar 'tidak ditetapkan naskah'. PR #2 sudah punya tes yang membuktikan gerbang membuat S3 == S2 dan bahwa S3 tanpa gerbang menerima non-match yang live (d = 0,52).
- **Konflik dan dampak:** (a) Ya. Dengan rumus Laravel, bila P_live = 0 maka S_final paling besar 0,6 < 0,75, sehingga tidak pernah diterima. Bila P_live = 1, diterima bila 0,6*(1 - d/1,5) >= 0,35, yaitu d <= 0,625. Jadi S3 = live AND d <= 0,625, sedangkan S2 = live AND d <= 0,40. Menambah gerbang d <= 0,40 menghasilkan S3 = S2 persis, berlaku untuk setiap alpha < 0,75 (tests/test_analisis_kalibrasi_dev.py:61-67, alpha 0,30-0,70). Akibatnya, uji McNemar S2 lawan S3 menjadi degeneratif (b = c = 0), Cochran's Q praktis hanya membandingkan dua skenario, dan klaim naskah bahwa S3 adalah skenario fusi yang berbeda tidak bisa dipertahankan. Bila S_EMAR bertingkat seperti P_live mesin {0; 0,5; 1} dan tau_emar_min = 0,5, S3 menerima satu sinyal saja, sehingga lebih lemah dari S2 dan meloloskan cut-out. Bila tau_emar_min = 1,0, hasilnya kembali S3 = S2. S3 baru bisa berbeda secara bermakna kalau S_EMAR kontinu. (b) tau_fusion hanya ada sebagai 0,75 tertulis langsung (Laravel/analisis/evaluation_bab5/evaluate_trial) dan 0,50 (FINAL_THRESHOLD mesin). Tidak ada di parameter_penelitian.py, dan menurut komentar kode tidak ditetapkan naskah. tau_emar_min tidak ditemukan. Angka '35 baris NON_MATCH dengan S3 = 1' tidak bisa diverifikasi dari repo: Dataset_Eksperimen_Bab5.csv memuat 17 baris dengan d > 0,40 dan tidak satu pun ber-S3 = 1. Mekanismenya sendiri terbukti (d dalam rentang 0,40-0,625 dan live).
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:421`: `$pFace = $evaluated ? max(0.0, 1.0 - ($euclideanDistance / 1.5)) : null;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:422`: `$pLive = $livenessValid ? 1.0 : 0.0;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:424`: `$s3 = ($evaluated && $sFinal >= 0.75) ? 1 : 0;`
  - `attendance-web/app/Http/Controllers/AttendanceHistoryController.php:89`: `$s3 = ($sFinal >= 0.75) ? 1 : 0;`
  - `attendance-web/resources/js/Components/Presensi/Bab5ScenarioCard.tsx:98`: `(sFinal >= 0.75 ? 1 : 0)`
  - `evaluation_bab5.py:53`: `threshold_s3: float = 0.75`
  - `scripts/analisis_kalibrasi_dev.py:59`: `S3_ACCEPT = 0.75`
  - `facenet_emar_system.py:200`: `# TAU_FUSION tidak ditetapkan naskah.`
  - `facenet_emar_system.py:202`: `FINAL_THRESHOLD = 0.50 # TAU_FUSION: ambang keputusan S3`
  - `tests/test_analisis_kalibrasi_dev.py:63`: `# yaitu keputusan S2. Inilah alasan gerbang tidak dipasang ke S3.`
  - `tests/test_analisis_kalibrasi_dev.py:70`: `self.assertTrue(ak.s3_accept(0.52, True, 0.60))`
- **Usulan perubahan:**
  - `parameter_penelitian.py:35`: Setelah keputusan peneliti, tambahkan TAU_FUSION (dan P_FACE_SCALE bila tetap 1,5) sebagai satu sumber dengan rujukan keputusan. Jangan menebak nilainya.
  - `attendance-web/app/Http/Controllers/PresensiController.php:424`: Bila gerbang disetujui: $s3 = ($s1 === 1 && $sFinal >= TAU). Ganti 0,75/1,5 yang tertulis langsung dengan konfigurasi, termasuk AttendanceHistoryController.php:86-89 dan :287-290 serta Bab5ScenarioCard.tsx:95-98. Catat di naskah bahwa S3 = S2 untuk P_live biner.
  - `tests/test_analisis_kalibrasi_dev.py:61`: Pertahankan tes ini sebagai bukti matematis. Bila gerbang dipasang, ubah komentar :62-63 dan tambahkan tes Laravel bahwa d = 0,52 yang live menghasilkan S3 = 0.
- **Pertanyaan keputusan:** Pilih satu: (i) S3 tanpa gerbang, dan penerimaan non-match 0,40 < d <= 0,625 dilaporkan sebagai temuan; (ii) S3 dengan gerbang, sambil menerima bahwa S3 = S2 untuk P_live biner (S3 dihapus atau digabung dalam uji statistik); atau (iii) S_EMAR didefinisikan kontinu (berapa rumusnya, dan berapa tau_fusion serta tau_emar_min?). Nilai tau mana yang tercantum di naskah?
- **Catatan verifier:** Rumus S3 Laravel, d <= 0,625 saat live, S3 == S2 bila ada gerbang untuk alpha < 0,75, tau_emar_min yang tidak ada, TAU_FUSION mesin 0,50, serta 17 baris d > 0,40 tanpa satu pun S3 = 1 di CSV semuanya terbukti. Ada empat koreksi. (1) Kesimpulan bahwa McNemar S2-S3 menjadi degeneratif dan Cochran's Q praktis hanya membandingkan dua skenario hanya berlaku bila uji dihitung dari S3 Laravel. Ekspor Cochran (CochranExportService) dan analisis tingkat subjek (SubjectLevelAnalysisService) membaca logs/telemetry.db, yang disebut 'Sumber tunggal ekspor presentasi berpasangan S1/S2/S3' (config/biometrics.php:76-79). Di sana S3 berasal dari decide_s3 mesin: sudah bergerbang is_verified, P_live bertingkat {0; 0,5; 1}, tau 0,50, sehingga S3 tidak sama dengan S2. (2) '6 tempat' kurang tepat: 0,75 dan 1,5 tertulis di 8 lokasi dalam 6 berkas (PresensiController :421/:424, AttendanceHistoryController :86/:89 dan :287/:290, Bab5ScenarioCard :95/:98, evaluation_bab5.py :53/:95 dan :176/:212, facenet_emar_system.evaluate_trial :1351/:1378, analisis_kalibrasi_dev.py :59-60). (3) Dokumen terkunci THESIS_METHODOLOGY.md:20 dan METRIC_DICTIONARY.md:14 menyatakan ACCEPT hanya bila MATCH DAN BONA_FIDE. Ini menjadi argumen untuk gerbang identitas yang tidak dikutip auditor. (4) Seluruh 17 baris d > 0,40 di CSV adalah fixture tes atau data simulasi (lihat EMAR-10), jadi absennya S3 = 1 tidak bisa dijadikan bukti empiris.

### EMAR-05: P3 (lanjutan): definisi S_FaceNet dan S_EMAR yang dipakai untuk fusi

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Mesin dan Laravel memakai S3 yang tidak kompatibel. Mesin: P_face = 1 - d/D_REF dengan D_REF = 1,20, P_live dari siklus {0; 0,5; 1}, tau 0,50, dan gerbang is_verified sudah ada. S3 mesin setara dengan verified AND (P_live >= 0,5 OR d <= 0,20). Jalur ini mengisi telemetry.db lewat capture_session.decide_all. Laravel: skala 1,5, tau 0,75, tanpa gerbang, P_live biner. Jalur ini mengisi Dataset_Eksperimen_Bab5.csv dan riwayat. facenet_score yang disimpan Laravel adalah s_embed mesin (skala 1,2), sedangkan p_face Laravel memakai skala 1,5.
- **Konflik dan dampak:** Dua sumber data riset (telemetry.db desktop dan CSV/riwayat web) memberi keputusan S3 yang berbeda untuk presentasi yang sama. Contohnya, serangan statis dengan d <= 0,20 diterima S3 mesin (komentar :200-201) tetapi ditolak S3 Laravel. Cut-out yang hanya berkedip (P_live = 0,5) diterima S3 mesin. Bila naskah menggabungkan atau membandingkan kedua sumber, angka APCER/BPCER S3 tidak konsisten. Kolom s_facenet dalam P5 juga ambigu, karena ada dua skala.
- **Bukti:**
  - `facenet_emar_system.py:181`: `D_REF = 1.20`
  - `facenet_emar_system.py:954`: `p_live = round(min(self.w1 * blink_ev + self.w2 * mouth_ev, 1.0), 6)`
  - `facenet_emar_system.py:1285`: `elif s_final >= self.final_threshold and facenet_result.is_verified:`
  - `capture_session.py:334`: `results = system.decide_all(facenet_result, emar_result)`
  - `facenet_emar_system.py:1378`: `p_face = max(0.0, 1.0 - (euclidean_dist / 1.5))`
- **Usulan perubahan:**
  - `facenet_emar_system.py:1248`: Setelah keputusan EMAR-04: samakan rumus S3 mesin dengan definisi naskah (skala, tau, P_live) atau beri label jelas bahwa telemetry.db memakai S3 versi lain. Perubahan rumus wajib disertai tes yang membandingkan dengan rumus lama.
  - `scripts/analisis_kalibrasi_dev.py:57`: Dokumentasikan bahwa S3 analisis mengikuti Laravel, bukan FusionModule, sampai keduanya diselaraskan.
- **Pertanyaan keputusan:** Rumus S3 mana yang resmi (D_REF 1,20 dan tau 0,50 di mesin, atau 1,5 dan 0,75 di Laravel), dan apakah data telemetry.db ikut dilaporkan di naskah?
- **Catatan verifier:** Terbukti: mesin memakai D_REF 1,20, P_live {0; 0,5; 1} (BLINK_REF = MOUTH_REF = 1), tau 0,50, dan gerbang is_verified, sehingga S3 mesin setara dengan verified AND (P_live >= 0,5 OR d <= 0,20). Laravel menyimpan facenet_score = s_embed mesin, sedangkan p_face Laravel memakai skala 1,5. Ada tiga koreksi yang memperkuat klaim ini. (1) Keputusan per presentasi di telemetry.db adalah 'ada satu frame ACCEPT berarti diterima' (telemetry_logger.presentation_decision). Satu frame dengan d <= 0,20 sudah membuat serangan statis diterima S3, sehingga S3 mesin lebih longgar dari analisis per presentasi. (2) capture_session memanggil FaceNet setiap 10 frame kamera langsung dengan cap waktu jam dinding (time.monotonic). Jalur /verify memakai paling banyak 9 kandidat dengan early exit dan waktu video. Jadi S1 pun berbeda antara kedua jalur mesin, bukan hanya S3. (3) Pertanyaannya bukan lagi 'apakah telemetry.db ikut dilaporkan': config sudah menetapkan telemetry.db sebagai sumber ekspor berpasangan S1/S2/S3 untuk uji Cochran.

### EMAR-06: P4a: serangan cut-out (EAR aktif, dMAR < 0,05) ditolak S2 dan S3

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Klaim PRD tidak berlaku di kode sekarang. UI selalu mengirim tantangan acak 50/50 BLINK atau OPEN_MOUTH. Pada tantangan BLINK, cut-out dengan mata asli di balik lubang lolos PASS_LIVENESS, dan mulut statis tidak memicu REJECT_WRONG_ACTION. PAD, S2, dan S3 Laravel memakai challenge_status. S3 mesin menerima P_live = 0,5 (kedip saja). Hanya S2 mesin yang menolak cut-out. Tes cut-out Laravel memakai jalur tanpa tantangan. Label pai_species asli ditimpa dengan nilai turunan prediksi pada baris :635. Cut-out juga tidak termasuk ATTACK_LABELS dalam desain 3.240 presentasi.
- **Konflik dan dampak:** Dengan alur yang berjalan sekarang, APCER cut-out sekitar 50% menurut rancangan (setiap tantangan BLINK lolos). Pernyataan bahwa 'S2 dan S3 menolak cut-out' hanya benar untuk S2 mesin (dlib, dua siklus), yang keputusannya tidak dipakai Laravel. Penimpaan $paiSpecies pada :635 membuat Matriks_Evaluasi_Bab4.csv (kolom PAI_Species) dan activity_log (:716) memuat spesies yang diturunkan dari prediksi sistem, bukan label kebenaran. APCER per spesies dari sumber itu menjadi melingkar (DECISION_LOG.md:21 mewajibkan APCER per jenis PAI). Menambah cut-out sebagai spesies berarti mengubah N_ATTACK/N_TOTAL (3.240).
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:950`: `Math.random() < 0.5 ? 'BLINK' : 'OPEN_MOUTH'`
  - `attendance-web/resources/js/Utils/emarGeometry.ts:137`: `else if (this.seenEyesOpen) {`
  - `attendance-web/app/Http/Controllers/PresensiController.php:635`: `$paiSpecies = ($sampleType === 'BONA_FIDE') ? 'NONE' : ((! $isMouthValid && $isBlinkValid) ? 'CUT_OUT' : 'PHOTO');`
  - `attendance-web/app/Http/Controllers/PresensiController.php:716`: `'pai_species' => $paiSpecies,`
  - `attendance-web/tests/Feature/BiometricDecisionGateTest.php:101`: `'mar_mouths' => 0, // Cut-out: mulut foto tidak bergerak`
  - `parameter_penelitian.py:100`: `ATTACK_LABELS = ("print_attack", "screen_attack", "replay_video")`
- **Usulan perubahan:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:635`: Ganti nama variabel lokal (misalnya $paiSpeciesMatriks) agar $paiSpecies dari label (:175) tidak tertimpa. Pertimbangkan menulis label asli ke PAI_Species. Baris CSV lama tidak ditulis ulang, cukup ditandai dalam analisis.
  - `attendance-web/tests/Feature/BiometricDecisionGateTest.php:93`: Tambah kasus cut-out yang mengirim active_challenge = BLINK dan challenge_status = PASS_LIVENESS untuk mendokumentasikan perilaku nyata, serta tes bahwa pai_species di activity log sama dengan input.
- **Pertanyaan keputusan:** Apakah cut-out termasuk spesies PAI dalam desain uji (mengubah N_TOTAL 3.240)? Apakah PAD harus menolak cut-out pada semua jalur, yang berarti tantangan satu aksi diganti atau ditambah syarat mulut?
- **Catatan verifier:** Terbukti: tantangan acak 50/50 (:950), ChallengeTracker BLINK lolos pada frame tertutup pertama setelah mata terbuka, dan REJECT_WRONG_ACTION hanya terpicu bila mulut terbuka >= 0,6 s, sehingga mulut statis tidak pernah memicunya. Cut-out tidak ada di ATTACK_LABELS maupun METRIC_DICTIONARY (print, screen, replay). Ada tiga koreksi. (1) Penimpaan $paiSpecies di :635 hanya terjadi di dalam blok engine, bukan akun uji, dan bukan calibration_dev (:622). Metadata attendance_records tetap memuat label asli, karena $trialLabels dibangun di :461-466 sebelum penimpaan. Ekspor riwayat Presensi (CombinedHistoryExport :302) dan scripts/analisis_kalibrasi_dev.py membaca label asli, sehingga data calibration_dev PR #2 tidak terdampak. Yang melingkar adalah Matriks_Evaluasi_Bab4.csv (PAI_Species) dan baris Aktivitas di activity_log (:716, diekspor di CombinedHistoryExport :347). Turunan :635 juga memberi label 'PHOTO' pada serangan screen/replay. (2) Usulan tes cut-out sebagian sudah tercakup: test_active_challenge_response_pass_accepted (BiometricDecisionGateTest.php:276-300) mengirim BLINK + PASS_LIVENESS tanpa ear_blinks/mar_mouths (dibaca 0) dan diterima ACCEPT, jadi perilaku 'mulut 0x tetap lolos' sudah terdokumentasi. (3) Angka 'APCER cut-out sekitar 50%' adalah analisis desain dengan asumsi penyerang berkedip dalam 4 s dan MediaPipe melacak foto; belum ada data terukur untuk itu.

### EMAR-07: P4b: MiniFASNetV1SE + MiniFASNetV2 ke field minifasnet_score terpisah

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak ditemukan sama sekali. git grep 'minifas' tidak menemukan apa pun. models/ hanya berisi shape_predictor_68_face_landmarks.dat. requirements.txt tidak memuat dependensi atau bobot Silent-Face. DECISION_LOG mengunci EMAR sebagai fokus liveness, dan THESIS_METHODOLOGY menyebut metode liveness adalah EMAR.
- **Konflik dan dampak:** (e) MiniFASNet adalah CNN 2D, jadi secara harfiah tidak terkena larangan 'CNN 3D'. Namun ia adalah metode PAD berbasis model terlatih di luar EMAR, padahal DECISION_LOG dan THESIS_METHODOLOGY hanya mengadopsi EMAR. Memasangnya memerlukan ADR baru, bobot pralatih dari pihak luar (data latih dan lisensi harus dicatat), dan potongan wajah terpisah. Bila hanya dicatat, keputusan S1/S2/S3 tidak berubah, tetapi latensi /verify bertambah (batas 90 detik). Bila nantinya dipakai dalam keputusan, metode PAD naskah berubah dan data yang sudah terkumpul tidak sebanding.
- **Bukti:**
  - `docs/specs/DECISION_LOG.md:13`: `Temporal EMAR pasif dan challenge (blink/smile) adalah fokus skripsi ini. Tidak akan menggunakan model CNN 3D untuk liveness.`
  - `docs/specs/THESIS_METHODOLOGY.md:14`: `**Metode Liveness:** EMAR (Eye & Mouth Aspect Ratio)`
  - `requirements.txt:10`: `facenet-pytorch>=2.6.0 # MTCNN + InceptionResnetV1`
- **Usulan perubahan:**
  - `docs/specs/DECISION_LOG.md:13`: Tidak ada perubahan kode sebelum ada ADR baru yang disetujui peneliti. Bila disetujui, field hanya untuk pencatatan (minifasnet_score) dan tidak masuk S1/S2/S3.
- **Pertanyaan keputusan:** Apakah MiniFASNet boleh ditambahkan sebagai pembanding yang hanya dicatat (ADR baru, sumber bobot dan lisensi tercatat), atau ditolak karena di luar cakupan EMAR?
- **Catatan verifier:** Terbukti tidak ada: git grep -i 'minifas', 'silent.face', dan 'tau_emar' tidak menemukan apa pun di kode, dan requirements.txt tidak memuat dependensinya. Satu koreksi kecil: models/ berisi shape_predictor_68_face_landmarks.dat dan juga .dat.bz2. Batas 90 detik yang disebut auditor sesuai dengan config biometrics.verify_timeout. DECISION_LOG.md:16 juga mencatat FastAPI sebagai API biometrik; penambahan model PAD kedua memerlukan ADR seperti yang diusulkan.

### EMAR-08: P5: append log_raw_frames.csv per sesi berisi session_id, participant_id, ground_truth_type, target_distance_cm, measured_lux, frame_index, timestamp_ms, raw_ear, raw_mar, raw_l2_dist, s_facenet, s_emar

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Sebagian sudah ada dari PR #2. appendRawFrames menulis logs/log_raw_frames_dev.csv, hanya untuk split calibration_dev, dengan kolom attendance_id, request_id, recorded_at, participant_id, dataset_split, sample_type, pai_species, lux_target, distance_target_cm, biometric_source, frame_idx, t_ms, raw_ear, raw_mar, trial_l2_dist, landmark_source. EAR/MAR berasal dari MediaPipe browser, bukan dlib. Kolom measured_lux, s_facenet, dan s_emar belum ada. Jalur desktop telemetry_logger.py sudah mencatat dlib per frame (ear_raw, mar_raw, emar_score, face_distance, s_embed, facenet_fresh). Mesin menghitung EAR/MAR dlib per frame tetapi tidak mengembalikan deretnya. Folder logs/ dilacak git (logs/attendance.db, telemetry.db) dan log_raw_frames_dev.csv tidak diabaikan .gitignore.
- **Konflik dan dampak:** PRD meminta EAR/MAR dari dlib (P1), sedangkan log PR #2 berisi MediaPipe browser. Kalau keduanya dicampur dalam satu kolom raw_ear, kalibrasi ambang dlib akan salah. s_facenet ambigu karena ada skala 1,2 dan 1,5 (EMAR-05). Bila log dibuat untuk 'tiap sesi' termasuk TEST, cakupannya melebar dari keputusan PR #2 (yang hanya calibration_dev); menambah baris diperbolehkan, tetapi ini perlu persetujuan. Karena logs/ dilacak git dan repo publik, CSV per frame berisi participant_id berisiko ter-commit. attendance-web/storage/logs/ sudah diabaikan ('*').
- **Bukti:**
  - `attendance-web/app/Http/Controllers/PresensiController.php:615`: `if ($isCalibrationDev) {`
  - `attendance-web/app/Http/Controllers/PresensiController.php:878`: `'frame_idx', 't_ms', 'raw_ear', 'raw_mar', 'trial_l2_dist', 'landmark_source',`
  - `attendance-web/app/Http/Controllers/PresensiController.php:887`: `'browser_mediapipe',`
  - `attendance-web/config/biometrics.php:96`: `base_path('../logs/log_raw_frames_dev.csv')`
  - `telemetry_logger.py:72`: `"frame_number", "timestamp", "ear_raw", "mar_raw", "emar_score",`
  - `facenet_emar_system.py:2637`: `res = system.emar.push_measurement(m, timestamp=idx / fps)`
- **Usulan perubahan:**
  - `facenet_emar_system.py:2722`: Tambahkan field 'frame_series_dlib' berisi [t_s, ear_avg, mar, p_live] per frame dari loop :2636-2641 (pengukuran yang sudah ada). Keputusan dan input mesin tidak berubah, jadi hasil tetap identik; buktikan dengan tes yang membandingkan field lain.
  - `biometric-api/routers/attendance.py:30`: Tambahkan field opsional frame_series_dlib ke AttendanceResponse.
  - `attendance-web/app/Http/Controllers/PresensiController.php:878`: Tambah kolom measured_lux ($luxValue), s_facenet (facenet_score mesin, dengan nama skala yang jelas), dan s_emar (p_live dlib per frame). Isi landmark_source 'dlib_engine' untuk deret mesin dan tetap pisahkan deret browser. Pertahankan nama trial_l2_dist.
  - `attendance-web/config/biometrics.php:96`: Pindahkan ke attendance-web/storage/logs/ yang sudah diabaikan git, atau tambahkan logs/log_raw_frames*.csv ke .gitignore. Berkas yang sudah ada tidak dipindah atau ditulis ulang tanpa izin.
- **Pertanyaan keputusan:** Log per frame berlaku untuk calibration_dev saja atau juga TEST? Sumber raw_ear/raw_mar yang dipakai dlib mesin, browser, atau keduanya di kolom terpisah? Di mana berkas disimpan agar tidak masuk repo publik?

### EMAR-09: P5 (f): raw_l2_dist per frame

- **Verdict:** Belum layak sekarang (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Tidak tersedia. FaceNet hanya dijalankan pada paling banyak 9 frame kandidat (10%, 20%, ..., 90% video), berhenti lebih awal bila d <= 0,35, dan hanya jarak terbaik yang dikembalikan. Log PR #2 sengaja menamai kolomnya trial_l2_dist dan mengisi nilai yang sama di semua frame.
- **Konflik dan dampak:** Mengisi raw_l2_dist untuk sekitar 240 frame berarti menjalankan MTCNN dan InceptionResnetV1 pada semua frame. Itu jauh lebih lambat (batas 90 detik), dan bila dipakai untuk memilih jarak, pemilihan frame berubah sehingga hasil tidak lagi identik (aturan thesis-guard butir 4). Mengisi kolom per frame dengan jarak presentasi berarti mengisi nilai yang tidak diukur.
- **Bukti:**
  - `facenet_emar_system.py:2515`: `FACENET_CANDIDATE_RATIOS = (0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90)`
  - `facenet_emar_system.py:2678`: `if min_dist <= FACENET_EARLY_EXIT_DISTANCE:`
  - `facenet_emar_system.py:2726`: `"distance": distance,`
  - `attendance-web/app/Http/Controllers/PresensiController.php:832`: `Jarak L2 hanya ada per presentasi (frame kandidat terbaik mesin), jadi`
- **Usulan perubahan:**
  - `facenet_emar_system.py:2672`: Opsi yang tidak mengubah hasil: kembalikan daftar [indeks_frame, jarak] untuk kandidat yang benar-benar dievaluasi (paling banyak 9, termasuk yang berhenti lebih awal) sebagai 'facenet_candidates'. Kolom per frame lain tetap kosong.
  - `attendance-web/app/Http/Controllers/PresensiController.php:887`: Isi l2 per frame hanya pada frame_idx kandidat yang dievaluasi; frame lain dibiarkan kosong, bukan disalin.
- **Pertanyaan keputusan:** Cukupkah jarak dari kandidat yang dievaluasi (paling banyak 9 per presentasi), atau peneliti bersedia menjalankan FaceNet di semua frame secara terpisah (hanya dicatat, tidak dipakai dalam keputusan, dan lebih lambat)?
- **Catatan verifier:** Terbukti: FaceNet dijalankan pada paling banyak 9 kandidat, berhenti bila d <= 0,35 atau subjek belum terdaftar, dan hanya 'distance' terbaik yang dikembalikan. PR #2 menulis trial_l2_dist yang sama di semua frame. Ada dua koreksi. (1) Usulan PresensiController.php:887 untuk mengisi l2 'pada frame_idx kandidat' tidak bisa dipetakan langsung. frame_idx di log_raw_frames_dev.csv adalah indeks larik frameSeries browser, yang hanya berisi frame berwajah selama SCANNING_8S dengan waktu performance.now(). Indeks kandidat mesin adalah indeks frame video webm hasil dekode. Penyelarasan butuh pemetaan waktu (idx/fps lawan t_ms) yang belum ada, dan hasilnya hanya perkiraan. (2) Kolom trial_l2_dist diberi label tingkat presentasi dan berasal dari jarak terukur, jadi bukan nilai rekaan; yang tidak tersedia adalah jarak per frame.

### EMAR-10: P1/P2 (input min EAR, max MAR, dMAR): asal nilai ear_val/mar_val dan kolom ear/mar di CSV Bab 5

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Browser menginisialisasi minEar = 0,30 dan maxMar = 0,05, sehingga nilai yang dikirim dipotong ke nilai awal itu bila wajah tidak pernah melewatinya. Max EAR dan min MAR tidak dilacak sama sekali, jadi dEAR/dMAR PRD tidak bisa dihitung dari scanMetrics (hanya dari frame_series calibration_dev). Bila tidak ada frame, facePct menjadi 100 dan activeChallenge menjadi 'BLINK'. Controller mengisi nilai pengganti 0,18/0,28 dan 0,40/0,05 bila ear_val/mar_val kosong; AttendanceHistoryController dan Bab5ScenarioCard melakukan hal yang sama. Dataset_Eksperimen_Bab5.csv memuat 27 baris dengan ear = 0,18 dan mar = 0,4 persis, pola yang sama dengan nilai pengganti itu.
- **Konflik dan dampak:** Nilai EAR/MAR yang tidak diukur ditulis sebagai angka seolah hasil ukur, melanggar aturan 'nilai yang tidak diukur tidak boleh diisi tebakan'. Aturan S2 versi PRD (min EAR, max MAR, dMAR) yang dibangun di atas ear_val/mar_val akan memakai nilai pengganti atau nilai terpotong. Baris Bab 5 yang sudah ada mengandung pola nilai pengganti; baris-baris itu tidak boleh ditulis ulang, tetapi harus ditandai dalam analisis. Baris yang sama juga menunjukkan d = 0,85 dengan S1 = 1, artinya S1 saat itu tidak memakai 0,40 (ranah agen FaceNet/data, dilaporkan untuk konteks).
- **Bukti:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:713`: `const minEarRef = useRef<number>(0.30);`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:714`: `const maxMarRef = useRef<number>(0.05);`
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:976`: `: 100.0;`
  - `attendance-web/app/Http/Controllers/PresensiController.php:411`: `$earVal = (float) ($request->input('ear_val') ?? ($earBlinks > 0 ? 0.18 : 0.28));`
  - `attendance-web/app/Http/Controllers/PresensiController.php:412`: `$marVal = (float) ($request->input('mar_val') ?? ($marMouths > 0 ? 0.40 : 0.05));`
  - `Dataset_Eksperimen_Bab5.csv:9`: `S01,30,350,BONA_FIDE,0.85,0.18,0.4,1,1,0`
- **Usulan perubahan:**
  - `attendance-web/resources/js/Components/Presensi/FaceScannerContainer.tsx:713`: Inisialisasi minEar/maxMar ke null (atau +/-Infinity) dan tambahkan maxEar/minMar. Kirim nilai hanya bila terukur. Di :976 dan :996 jangan kirim 100 atau 'BLINK' bila tidak ada frame atau tantangan.
  - `attendance-web/app/Http/Controllers/PresensiController.php:411`: Hapus nilai pengganti 0,18/0,28/0,40/0,05. Bila ear_val/mar_val kosong, simpan null dan buat S2/S3 null (tidak terukur). Lakukan hal yang sama di AttendanceHistoryController.php:80-81, :282-283 dan Bab5ScenarioCard.tsx:90-91. Ini mengubah perilaku dan perlu tes.
  - `scripts/analisis_kalibrasi_dev.py:112`: Saat memuat data lama, tandai baris dengan pasangan ear/mar yang persis sama dengan nilai pengganti sebagai 'tidak terukur'. CSV sumber tidak diubah.
- **Pertanyaan keputusan:** Bagaimana baris Dataset_Eksperimen_Bab5.csv yang memuat nilai pengganti 0,18/0,40 diperlakukan dalam naskah (dikeluarkan atau ditandai), dan bolehkah perilaku fallback diganti menjadi null?
- **Catatan verifier:** Terbukti: minEar dimulai dari 0,30 dan maxMar dari 0,05 (:713-714, direset di :903-904), max EAR dan min MAR tidak dilacak, controller memakai nilai pengganti di :411-412, dan ada 27 baris dengan pasangan 0,18/0,4 persis. Ada empat koreksi. (1) facePct bukan hanya bernilai 100 saat tidak ada frame. totalFramesRef dan detectedFramesRef selalu dinaikkan bersama (:739-740), dan hanya pada frame yang berwajah, jadi face_pct dari UI SELALU 100,0. Syarat kestabilan >= 80% di controller selalu lolos dan kolom 'Wajah Stabil (%)' tidak bermakna. (2) Ke-27 baris 0,18/0,4 cocok persis dengan fixture BiometricDecisionGateTest (S01, 30 cm, lux 320/350, d 0,08/0,85; satu baris dari akun emb_TEST-QALWANI-001 dengan d 0,08). Ini artefak tes atau skor simulasi yang tertulis ke CSV asli, bukan presentasi nyata yang terkena fallback. Hampir semua baris CSV memiliki d 0,08/0,15/0,85 persis (simulasi); hanya 3 baris S02 yang tampak terukur. (3) Untuk baris baru, CSV hanya ditulis bila biometricSource === 'engine' (:622), dan UI selalu mengirim ear_val dan mar_val (Index.tsx:830-835). Fallback 0,18/0,40 tidak tercapai dari UI utama; yang terjadi adalah pemotongan pada nilai awal 0,30/0,05. Banyak baris emb_TEST ber-mar 0,05 persis, sesuai dengan pemotongan ini. (4) Nomor baris AttendanceHistoryController untuk nilai pengganti adalah :81-82, bukan :80-81.

## qa_orchestration (Agen 6 qa-stat-evaluator + konfigurasi orkestrasi CLAUDE.md/.claude). Ringkasan: tes (a) bertentangan dengan rumus S3 jalur evaluasi/web yang dipakai merekam data, karena ada dua definisi S3 di repo. Angka 6.480 hanya berasal dari generator sintetis CRC32 dan bertentangan dengan N_TOTAL=3240. Bootstrap dilarang thesis-guard. Cochran's Q/McNemar tingkat percobaan melanggar asumsi independensi. Enam dari sembilan butir "parameter dikunci" PRD keliru atau bertentangan dengan kode: EAR <=, Delta_MAR, timeout 6-8 s, ±2 cm, replay_attack/cutout_attack, n=6.480, Laravel 12/11 + MiniFASNet. Daftar perintah baca yang dipakai: git grep, grep, sed -n, cat, ls, wc, git log, serta cut/sort/uniq untuk menghitung isi CSV. Telemetry.db dan database Laravel tidak dibuka.

**Path PRD yang tidak ada di repo:**

- scripts/generate_bab5_evaluation.py
- log_raw_frames.csv (yang nyata hanya path konfigurasi logs/log_raw_frames_dev.csv di attendance-web/config/biometrics.php:96, khusus calibration_dev, dan belum ada berkasnya di logs/)
- log_session_summary.csv (tidak ada di mana pun; ringkasan sesi ada di tabel presentation_log logs/telemetry.db dan ekspor Riwayat CSV)
- CLAUDE.md (root)
- attendance-web/CLAUDE.md
- ".claude/agents/01..06" (hanya ada .claude/agents/thesis-guard.md)
- .claude/commands/ (direktori belum ada; repo memakai format skill .claude/skills/<nama>/SKILL.md)
- .claude/commands/fix-pad-testbench.md
- .claude/commands/generate-bab5-tables.md

**Berkas nyata wilayah agen:**

- `tests/test_evaluation_bab5.py`: Tes S1/S2/S3 jalur evaluasi titik (evaluation_bab5.evaluate_trial); tempat tes (a)/(b)/(c) versi nilai titik
- `tests/test_parameter_naskah.py`: Kunci parameter naskah + TestKeputusanFusi mesin (FusionModule); tempat tes (a)/(b)/(c) versi deret EAR/MAR
- `tests/test_analisis_kalibrasi_dev.py`: Tes tabel kalibrasi calibration_dev (5.B/5.C/5.D)
- `tests/test_evaluation_bab5_sensor.py`: Tes pembacaan sensor evaluator Bab 5
- `tests/conftest.py`: Fixture tes root (galeri sandbox)
- `biometric-api/tests/evaluation/test_evaluate_iso30107.py`: Tes metrik ISO 30107-3 di API
- `biometric-api/app/evaluation/evaluate_iso30107.py`: Implementasi APCER/BPCER/ACER (ACER memakai APCER gabungan); perlu diseragamkan
- `scripts/analisis_kalibrasi_dev.py`: Basis nyata generator Tabel 5.B/5.C/5.D dari split calibration_dev (P_DEV_01)
- `analisis_tingkat_subjek.py`: Friedman/Wilcoxon tingkat subjek; saat ini membaca data sintetis, wajib diarahkan ke data terekam
- `evaluation_bab5.py`: Evaluator S1/S2/S3 nilai titik (dipakai bersama agen mesin; rumus S3 berbeda dari mesin)
- `scripts/export_cochran_dataset.py`: Generator 6.480 baris sintetis CRC32; kandidat ditandai/dinonaktifkan, bukan sumber Bab 5
- `exports/`: Folder keluaran tabel analisis (kalibrasi_dev/ dan Bab 5)
- `attendance-web/app/Services/SubjectLevelAnalysisService.php`: Analisis tingkat subjek di web (FTA dihitung sebagai galat); ditinjau QA, diubah bersama agen web
- `attendance-web/app/Services/CochranExportService.php`: Sumber ekspor presentasi berpasangan dari telemetry.db (baca saja)
- `attendance-web/tests/Feature/CochranDatasetExportTest.php`: Tes kontrak ekspor nyata + kunci 3240 (tinjau)
- `attendance-web/tests/Feature/CalibrationDevSplitTest.php`: Tes kontrak split calibration_dev P_DEV_01 (tinjau)
- `.claude/agents/thesis-guard.md`: Reviewer metodologi read-only; aturan statistik (tanpa GEE/mixed-effects/bootstrap)
- `.claude/settings.json`: Pengaturan Claude Code proyek (saat ini hanya menonaktifkan plugin laravel-boost)
- `.claude/skills/cek-semua/SKILL.md`: Runner semua tes + cek md5 galeri; dipakai ulang oleh perintah QA
- `.claude/skills/cek-semua/scripts/cek-semua.sh`: Skrip runner tes berurutan
- `AGENTS.md`: Instruksi proyek (antislop) yang wajib tetap dimuat; diimpor dari CLAUDE.md baru
- `parameter_penelitian.py`: Sumber tunggal parameter terkunci (baca saja, rujukan CLAUDE.md)
- `.cursor/rules/thesis-methodology.mdc`: Aturan metodologi (baca saja; tidak otomatis dibaca Claude Code)
- `docs/specs/METRIC_DICTIONARY.md`: Definisi APCER/BPCER/FTA (baca saja)
- `CLAUDE.md`: BERKAS BARU di root yang diusulkan PRD; belum ada

### QA-01: Tes (a): NON_MATCH D=0.55 dengan S_EMAR=1.0 -> S1=0, S2=0, S3=0

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Repo punya dua definisi S3. (1) Mesin FusionModule.decide_s3 punya gerbang identitas, D_REF=1.20 dan ambang 0.50, jadi S3=0 untuk D=0.55. (2) Jalur evaluasi/web/kalibrasi (evaluation_bab5.evaluate_trial, salinannya facenet_emar_system.evaluate_trial, PresensiController, analisis_kalibrasi_dev) tidak punya gerbang identitas: P_face=1-d/1.5 dan ambang 0.75. Untuk D=0.55 dan P_live=1, s_final=0.6*0.6333+0.4=0.78, jadi S3=1. Tes yang sudah ada malah mengunci perilaku sebaliknya: d=0.60 dengan liveness lolos menghasilkan S3=1.
- **Konflik dan dampak:** Tes (a) cocok dengan S3 mesin, tetapi gagal pada S3 jalur evaluasi/web. Pada jalur itu wajah non-match yang lolos liveness diterima S3 sampai d=0.625 (L2 tersirat pada alpha 0.60). Dampaknya ke data: S3 di Dataset_Eksperimen_Bab5.csv (ditulis PresensiController) dan S3 di presentation_log telemetry.db (ditulis capture_session lewat decide_all) memakai rumus berbeda. Akibatnya Tabel 5.C/5.F untuk S3 akan berbeda tergantung sumber, dan tabel 2c kalibrasi_dev memakai rumus web. Menyeragamkan rumus mengubah keputusan S3 yang sudah terekam, dan .cursor/rules melarang mengubah rumus metrik tanpa tes dan persetujuan.
- **Bukti:**
  - `facenet_emar_system.py:1285`: `elif s_final >= self.final_threshold and facenet_result.is_verified:`
  - `facenet_emar_system.py:181`: `D_REF = 1.20`
  - `facenet_emar_system.py:202`: `FINAL_THRESHOLD = 0.50`
  - `evaluation_bab5.py:95`: `p_face = max(0.0, 1.0 - (euclidean_dist / 1.5))`
  - `evaluation_bab5.py:103`: `if s_final >= threshold_s3:`
  - `tests/test_evaluation_bab5.py:92`: `_, _, s3 = evaluate_trial(euclidean_dist=0.60, ear=0.18, mar=0.40) self.assertEqual(s3, 1)`
  - `attendance-web/app/Http/Controllers/PresensiController.php:424`: `$s3 = ($evaluated && $sFinal >= 0.75) ? 1 : 0;`
  - `scripts/analisis_kalibrasi_dev.py:58`: `# Bobot dan ambang S3 sama dengan PresensiController: S = a*P_face + (1-a)*P_live >= 0,75.`
  - `facenet_emar_system.py:1378`: `p_face = max(0.0, 1.0 - (euclidean_dist / 1.5))`
- **Usulan perubahan:**
  - `tests/test_parameter_naskah.py:165`: Tambah tes di TestKeputusanFusi: _facenet(fes, 0.55) dan EMARResult(emar_score=1.0, landmark_count=68), lalu decide_s1/s2/s3 diharapkan REJECTED_IDENTITY (lulus dengan kode sekarang).
  - `tests/test_evaluation_bab5.py:90`: JANGAN diubah sebelum ada keputusan. Bila peneliti memilih S3 dengan gerbang identitas, ganti Kasus C (d=0.60 -> S3=1) menjadi S3=0 dan tambah kasus D=0.55 -> (0,0,0).
  - `evaluation_bab5.py:101`: Hanya setelah keputusan: tambahkan syarat s1_decision == 1 pada S3 (atau samakan dengan FusionModule). Ubahan yang sama berlaku untuk facenet_emar_system.py:1384, PresensiController.php:424 dan analisis_kalibrasi_dev.py:277-279.
- **Pertanyaan keputusan:** Definisi S3 mana yang sah untuk Bab 5: (1) mesin, dengan gerbang identitas, D_REF 1.20 dan ambang 0.50, atau (2) jalur web/evaluasi tanpa gerbang identitas, dengan skala 1.5 dan ambang 0.75? Data S3 yang sudah terekam dengan definisi lain diperlakukan bagaimana?
- **Catatan verifier:** Klaim inti benar. Untuk NON_MATCH D=0,55 dengan P_live=1, mesin menghasilkan S1=S2=S3=0 (REJECTED_IDENTITY). Jalur web/evaluasi menghasilkan S3=1 karena 0,6*(1-0,55/1,5)+0,4=0,78 >= 0,75, dengan L2 tersirat 0,625. Tambahan yang terlewat auditor: (1) Rumus web juga disalin di AttendanceHistoryController.php:86-89 dan :287-290 (menghitung ulang S3 untuk rekaman tanpa evaluation_bab5, termasuk ekspor riwayat yang dibaca analisis_kalibrasi_dev) dan di Bab5ScenarioCard.tsx:95-98. (2) Ada tes kedua yang mengunci S3 tanpa gerbang: tests/test_analisis_kalibrasi_dev.py:69-71 (0,52 & live diterima). (3) PENTING: tests/test_analisis_kalibrasi_dev.py:61-67 menunjukkan bahwa dengan P_live biner, menambah syarat L2<=0,40 pada S3 web membuat S3 identik dengan S2. Usulan auditor 'tambahkan s1_decision==1' akan meruntuhkan S3 menjadi S2, sehingga uji S2 vs S3 (McNemar/Cochran) kehilangan makna. Pada mesin hal ini tidak terjadi karena P_live kontinu (0/0,5/1) dan ambang 0,50: serangan statis dengan d<=0,20 tetap diterima S3 (facenet_emar_system.py:199-201). (4) docs/specs/THESIS_METHODOLOGY.md:20 dan METRIC_DICTIONARY.md:14 mendefinisikan ACCEPT final = MATCH AND BONA_FIDE, mendukung gerbang identitas sebagai keputusan akhir. (5) Generator sintetis memakai definisi S3 keempat: p_face=1-d/0,80, p_live kontinu, ambang 0,50 (export_cochran_dataset.py:84-87). Dampak data terkonfirmasi: SubjectLevelAnalysisService/CochranExportService membaca presentation_log (S3 mesin via decide_all), sedangkan Dataset_Eksperimen_Bab5.csv ditulis PresensiController (S3 web).

### QA-02: Tes (b): bona fide D=0.32, min EAR 0.15, max MAR 0.28 -> 1,1,1

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Pada jalur titik, evaluate_trial(0.32, 0.15, 0.28) menghasilkan (1,1,1) dengan s_final=0.6*(1-0.32/1.5)+0.4=0.872. Mesin tidak menilai min EAR/maks MAR. Mesin menghitung siklus penuh: mata harus tertutup minimal 2 frame berturut-turut dan mulut terbuka minimal 3 frame, dalam jendela 8 s. Satu frame EAR 0.15 tidak menghasilkan kedipan.
- **Konflik dan dampak:** Spesifikasi "min EAR / max MAR" tidak cukup untuk mesin berbasis siklus. Tes mesin harus memakai deret frame lengkap. Tidak ada konflik dengan parameter.
- **Bukti:**
  - `evaluation_bab5.py:82`: `liveness_valid = (ear < EAR_BLINK_THRESHOLD) and (mar >= MAR_OPEN_THRESHOLD)`
  - `facenet_emar_system.py:942`: `blink_count = count_full_cycles(`
  - `facenet_emar_system.py:207`: `BLINK_CONSEC_FRAMES = 2`
  - `facenet_emar_system.py:208`: `MOUTH_OPEN_FRAMES = 3`
- **Usulan perubahan:**
  - `tests/test_evaluation_bab5.py:78`: Tambah kasus titik evaluate_trial(0.32, 0.15, 0.28) == (1,1,1).
  - `tests/test_parameter_naskah.py:113`: Tambah kasus deret: ears=[0.28]*3+[0.15]*2+[0.28]*3, mars=[0.05]*3+[0.28]*3+[0.05]*2, lalu liveness_from_sequence diharapkan p_live=1.0 dan decide_all dengan d=0.32 menghasilkan ACCEPTED pada S1/S2/S3.

### QA-03: Tes (c): print/screen D=0.35, dEAR=0.01, dMAR=0.01 -> S1=1, S2=0, S3=0

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Kode tidak punya kriteria Delta (git grep delta_mar/delta_ear tidak menemukan apa pun). S2 bergantung pada persilangan ambang absolut, bukan amplitudo. Deret EAR 0.195-0.205 (Delta 0.01) yang 2 frame di bawah 0.20 tetap dihitung kedipan. Dengan D=0.35 dan P_live=0: mesin s_final=0.6*(1-0.35/1.2)=0.425<0.50, jadi S3=0. Jalur web 0.46<0.75, juga S3=0. Catatan: di mesin, serangan statis diterima S3 bila d<=0.20.
- **Konflik dan dampak:** Tes yang hanya menyebut Delta tidak deterministik terhadap kode saat ini. Tes harus menyebut level absolut, misalnya EAR 0.28-0.29 dan MAR 0.04-0.05. Kasus d<=0.20 (S3 menerima serangan statis di mesin) tidak tertangkap oleh D=0.35 dan perlu kasus batas tersendiri yang mendokumentasikan perilaku sekarang, tanpa mengubahnya.
- **Bukti:**
  - `facenet_emar_system.py:943`: `[e < self.ear_blink_thresh for e in ears], BLINK_CONSEC_FRAMES`
  - `facenet_emar_system.py:201`: `# (P_live = 0) tetap diterima S3 bila P_face >= 0,833, yaitu d <= 0,20.`
- **Usulan perubahan:**
  - `tests/test_parameter_naskah.py:155`: Tambah kasus deret statis (EAR 0.28/0.29 bergantian, MAR 0.04/0.05) dengan d=0.35: S1 ACCEPTED, S2 REJECTED_LIVENESS, S3 REJECTED_FUSION. Tambah kasus batas d=0.20 dengan P_live=0 untuk mendokumentasikan bahwa S3 menerima.
  - `tests/test_evaluation_bab5.py:78`: Tambah kasus titik evaluate_trial(0.35, 0.28, 0.05) == (1,0,0).

### QA-04: scripts/generate_bab5_evaluation.py membaca log_raw_frames.csv & log_session_summary.csv

- **Verdict:** Bisa dengan perubahan; ukuran kerja L; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Skrip dan kedua CSV tidak ada. Sumber nyata ada tiga. (1) Ekspor Riwayat CSV untuk calibration_dev (dibaca analisis_kalibrasi_dev.py --riwayat). (2) logs/log_raw_frames_dev.csv, deret EAR/MAR per frame khusus calibration_dev. (3) Dataset TEST: Dataset_Eksperimen_Bab5.csv (ditulis PresensiController, tanpa kolom split, S3 rumus web) dan presentation_log di telemetry.db (ditulis capture_session, S3 rumus mesin, ID subjek S01..S18).
- **Konflik dan dampak:** Bila generator Bab 5 dibuat dengan nama berkas fiktif PRD, ia tidak menemukan data. Bila ia menggabungkan Dataset_Eksperimen_Bab5.csv dan telemetry.db, S3 tercampur dua definisi (lihat QA-01) dan ID tercampur (P.. vs S..).
- **Bukti:**
  - `attendance-web/config/biometrics.php:96`: `'raw_frames_dev' => env('BIOMETRICS_RESEARCH_CSV_RAW_FRAMES_DEV', base_path('../logs/log_raw_frames_dev.csv')),`
  - `attendance-web/app/Http/Controllers/PresensiController.php:611`: `juga tidak: kedua CSV ini adalah dataset TEST dan tidak punya kolom split.`
  - `attendance-web/app/Services/CochranExportService.php:12`: `Sumber data: tabel presentation_log di logs/telemetry.db`
  - `capture_session.py:334`: `results = system.decide_all(facenet_result, emar_result)`
  - `attendance-web/app/Services/SubjectLevelAnalysisService.php:122`: `public static function embeddingToParticipant(string $embeddingId): string`
- **Usulan perubahan:**
  - `scripts/analisis_kalibrasi_dev.py:333`: Jadikan basis bersama. Generator Bab 5 baru (mis. scripts/generate_bab5_evaluation.py) mengimpor fungsi pad_errors/wilson/table_conditions alih-alih menyalin rumus.
  - `scripts/generate_bab5_evaluation.py`: BARU: masukan --riwayat (calibration_dev) dan --test-csv (ekspor CochranExportService atau Dataset_Eksperimen_Bab5.csv, satu sumber saja sesuai keputusan), --frames logs/log_raw_frames_dev.csv. Tolak campuran sumber dan ID.
- **Pertanyaan keputusan:** Sumber tunggal untuk data TEST P01-P18: presentation_log telemetry.db (capture_session, S3 mesin) atau Dataset_Eksperimen_Bab5.csv (web, S3 rumus web)?

### QA-05: Tabel 5.A split: P_DEV_01 n=360 vs 18 subjek n=6.480 (juga "parameter dikunci" CLAUDE.md)

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Angka 360 sesuai PR #2: 10 repetisi x 4 label x 3 lux x 3 jarak. Angka 6.480 bertentangan dengan desain terkunci: REPETITIONS=5, N_TOTAL=3240, N_PER_SUBJECT=180, juga dikunci di config dan tes Laravel. 6.480 berasal dari desain lama 10 repetisi, yang diturunkan ke 5 oleh keputusan peneliti 25 September 2026.
- **Konflik dan dampak:** Menulis n=6.480 di CLAUDE.md/tabel 5.A berarti mengklaim jumlah sampel yang tidak sesuai desain. Pemeriksaan kelengkapan SubjectLevelAnalysisService akan selalu melaporkan data belum lengkap terhadap 3240, dan naskah akan melaporkan N yang tidak diukur. Split juga harus disjoint per subjek. Bila P_DEV_01 (peneliti) juga salah satu P01-P18, terjadi kebocoran.
- **Bukti:**
  - `attendance-web/resources/js/Utils/soloSession.ts:19`: `export const SOLO_DEFAULT_REPETITIONS = 10;`
  - `parameter_penelitian.py:16`: `- repetisi diturunkan dari 10 menjadi 5 per kombinasi kondisi`
  - `parameter_penelitian.py:106`: `N_TOTAL = N_BONA_FIDE + N_ATTACK # 3.240`
  - `attendance-web/config/biometrics.php:104`: `'total_presentations' => 3240,`
  - `tests/test_parameter_naskah.py:48`: `assert P.N_TOTAL == 3240`
  - `attendance-web/tests/Feature/CochranDatasetExportTest.php:205`: `$this->assertStringContainsString('2 dari 3240', ...)`
  - `docs/specs/DATA_GOVERNANCE.md:17`: `Intersection / overlap antar split (DEV, CAL, TEST) baik dari *subject_id* atau *session_id* harus 0 (disjoint).`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: tulis "P01-P18: N_TOTAL dari parameter_penelitian.py (3.240; 180 per subjek)". P_DEV_01 n ditulis sesuai jumlah terekam, bukan target.
  - `scripts/generate_bab5_evaluation.py`: BARU: Tabel 5.A mengambil N rancangan dari parameter_penelitian (N_TOTAL, N_PER_SUBJECT), N terekam dari data, dan memeriksa irisan subject_id antar split = 0.
- **Pertanyaan keputusan:** Konfirmasi: desain TEST tetap 5 repetisi (3.240)? Apakah orang di balik P_DEV_01 bukan salah satu P01-P18?
- **Catatan verifier:** Benar: desain terkunci 5 repetisi (N_TOTAL=3240, 180 per subjek), dan 6.480 berasal dari desain lama 10 repetisi. Koreksi: (1) 360 untuk P_DEV_01 hanya target bawaan. Jumlah repetisi di panel solo bisa diubah 1-50 (useSoloBatch.ts:76), jadi n terekam bisa berbeda. (2) PENTING: ID subjek nyata di telemetry adalah S01..S18 (ID galeri), bukan P01..P18. Awalan P berasal dari data sintetis. Menulis 'P01-P18' di CLAUDE.md akan menyesatkan filter analisis. (3) Data calibration_dev tidak pernah ditulis ke Dataset_Eksperimen_Bab5.csv maupun Matriks_Evaluasi_Bab4.csv (PresensiController.php:623), sehingga di tingkat berkas sudah terpisah. Apakah P_DEV_01 orang yang sama dengan salah satu subjek tidak bisa ditentukan dari kode.

### QA-06: Tabel 5.B grid search TAU_L2 [0.35..0.50], TAU_EAR [0.15,0.18,0.20,0.22,0.25], TAU_MAR [0.05..0.20], alpha [0.30..0.70]

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Sebagian besar sudah ada di analisis_kalibrasi_dev.py (tabel 2a/2b/2c) untuk split calibration_dev. Grid EAR tidak memuat 0.22, grid alpha tidak memuat 0.40, dan grid L2 mulai dari 0.30. Tabel 2b memakai aturan pasif (>=1 kedip dan >=1 siklus mulut), padahal keputusan tercatat memakai tantangan aktif. Tabel 2c memakai S3 rumus web (1.5 / 0.75).
- **Konflik dan dampak:** Grid search hanya sah sebagai analisis sensitivitas pada calibration_dev. Bila dijalankan pada data P01-P18, itu adalah tuning pada TEST. Hasilnya juga tidak boleh menggeser nilai terkunci tanpa persetujuan. Hasil 2c bergantung pada definisi S3 (QA-01).
- **Bukti:**
  - `scripts/analisis_kalibrasi_dev.py:62`: `L2_GRID = (0.30, 0.35, 0.40, 0.45, 0.50)`
  - `scripts/analisis_kalibrasi_dev.py:63`: `EAR_GRID = (0.15, 0.18, 0.20, 0.25)`
  - `scripts/analisis_kalibrasi_dev.py:65`: `ALPHA_GRID = (0.30, 0.50, 0.60, 0.70)`
  - `scripts/analisis_kalibrasi_dev.py:25`: `sehingga 2b adalah analisis ambang, bukan ulangan keputusan sistem.`
  - `docs/specs/DATA_GOVERNANCE.md:14`: `Dilarang keras men-tuning model atau threshold berdasarkan hasil dari split TEST.`
  - `.cursor/rules/thesis-methodology.mdc:12`: `Do not introduce, replace, or tune FaceNet, EAR, MAR, blink, or timing thresholds without explicit approval.`
- **Usulan perubahan:**
  - `scripts/analisis_kalibrasi_dev.py:63`: Bila disetujui, tambah 0.22 ke EAR_GRID dan 0.40 ke ALPHA_GRID. L2_GRID boleh tetap memuat 0.30 sebagai titik tambahan.
  - `scripts/analisis_kalibrasi_dev.py:116`: Pertahankan filter SPLIT == calibration_dev. Tambah tes yang memastikan baris split lain (TEST) ditolak oleh tabel grid.
  - `tests/test_analisis_kalibrasi_dev.py`: Tambah asersi kolom grid baru.
- **Pertanyaan keputusan:** Nilai grid final (0.22 di EAR, 0.40 di alpha, apakah L2 0.30 tetap ada)? Tabel 5.B dinyatakan sebagai sensitivitas tanpa mengubah ambang terkunci?

### QA-07: Tabel 5.C APCER per spesies + APCER_max + APCER_aggregate + BPCER + ACER dengan CI 95% Wilson/Bootstrap

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** pad_errors sudah menghitung APCER per spesies, apcer_max, BPCER dan ACER=(APCER_max+BPCER)/2. APCER_aggregate belum ada di skrip ini. ACER di API memakai APCER gabungan, dan docstring mesin menulis (APCER+BPCER)/2, jadi ada tiga definisi ACER. Wilson sudah ada, tetapi hanya untuk BPCER dan APCER spesies terburuk di tabel 3. Bootstrap dilarang aturan repo.
- **Konflik dan dampak:** Bootstrap melanggar thesis-guard.md:27. Wilson tingkat percobaan mengasumsikan percobaan saling bebas, sehingga CI terlalu sempit untuk data berulang per subjek. Karena itu CI harus diberi label deskriptif. Tiga definisi ACER membuat angka ACER naskah bisa berbeda tergantung skrip yang dipakai.
- **Bukti:**
  - `scripts/analisis_kalibrasi_dev.py:249`: `out["acer"] = None if worst is None or out["bpcer"] is None else (worst + out["bpcer"]) / 2`
  - `biometric-api/app/evaluation/evaluate_iso30107.py:151`: `acer = None if apcer is None or bpcer is None else (apcer + bpcer) / 2`
  - `facenet_emar_system.py:38`: `ACER = (APCER + BPCER) / 2`
  - `.claude/agents/thesis-guard.md:27`: `No GEE, mixed-effects logistic regression, or bootstrap`
  - `scripts/analisis_kalibrasi_dev.py:30`: `Wilson di Tabel 3 hanya gambaran ketidakpastian dan terlalu sempit`
- **Usulan perubahan:**
  - `scripts/analisis_kalibrasi_dev.py:234`: Tambah apcer_aggregate (semua serangan digabung) dan kolom CI Wilson untuk setiap rate (per spesies, max, aggregate, BPCER). Jangan tambahkan bootstrap.
  - `biometric-api/app/evaluation/evaluate_iso30107.py:151`: Setelah keputusan, samakan definisi ACER dengan skrip Bab 5, atau ganti nama kolomnya (acer_aggregate vs acer_max).
  - `tests/test_analisis_kalibrasi_dev.py`: Tes nilai Wilson untuk kasus 0/n dan n/n serta apcer_aggregate.
- **Pertanyaan keputusan:** ACER naskah memakai APCER spesies terburuk (protokol OULU-NPU, sekarang di analisis_kalibrasi_dev) atau APCER gabungan (evaluate_iso30107)? Bootstrap dihapus dari PRD?
- **Catatan verifier:** Klaim pokok benar: pad_errors menghitung APCER per spesies, apcer_max, BPCER dan ACER=(APCER_max+BPCER)/2. Belum ada apcer_aggregate. Wilson hanya dipakai untuk BPCER dan APCER spesies terburuk di Tabel 3. Bootstrap dilarang thesis-guard.md:27. Koreksi: sebutan 'tiga definisi ACER' berlebihan. Yang ada dua rumus: (a) APCER gabungan, dipakai di kode mesin compute_iso_metrics (facenet_emar_system.py:1456-1459, bukan hanya docstring), API evaluate_iso30107.py:151, dan generator sintetis export_cochran_dataset.py:195; (b) APCER spesies terburuk di analisis_kalibrasi_dev.py:249. Temuan tambahan: compute_iso_metrics mengisi 0.0 bila penyebut kosong (APCER=0 tanpa serangan), sedangkan skrip lain memakai None. Itu nilai yang tidak diukur, dan fungsi itu juga tidak menangani FTA.

### QA-08: Tabel 5.D matriks 3 lux x 3 jarak + FTA

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** table_conditions sudah membuat 9 sel plus baris 'semua' dengan APCER per spesies, BPCER, IAPMR dan CI Wilson. FTA dikeluarkan dari penyebut, sesuai aturan, tetapi hanya dilaporkan sebagai satu angka global di stdout. Belum ada kolom FTA per sel. Sel ditentukan dari target skenario, bukan hasil ukur.
- **Konflik dan dampak:** Tidak ada konflik metodologi. Yang kurang hanya kolom FTA per sel. Penyebut FTA rate adalah semua presentasi pada sel tersebut (METRIC_DICTIONARY.md).
- **Bukti:**
  - `scripts/analisis_kalibrasi_dev.py:310`: `cells = [(lux, d) for lux in LUX_ORDER for d in DISTANCE_CM] + [("semua", "semua")]`
  - `scripts/analisis_kalibrasi_dev.py:159`: `return [t for t in trials if not t["fta"] and not t["unavailable"] and t["l2"] is not None]`
  - `scripts/analisis_kalibrasi_dev.py:354`: `n_fta = sum(bool(t["fta"]) for t in trials)`
- **Usulan perubahan:**
  - `scripts/analisis_kalibrasi_dev.py:307`: Tambah kolom n_total, n_fta, fta_rate (dan n_mesin_tidak_terhubung) per sel. APCER/BPCER tetap tanpa FTA.
  - `tests/test_analisis_kalibrasi_dev.py`: Tes bahwa baris FTA menambah n_fta di selnya dan tidak mengubah APCER/BPCER.

### QA-09: Tabel 5.E latensi Mean±SD per komponen + FPS, klaim < 200 ms/frame

- **Verdict:** Belum layak sekarang (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Waktu per komponen (MTCNN/FaceNet/dlib) tidak dicatat. Yang tercatat hanya total waktu per frame (frame_ms dan processing_ms). Skrip kalibrasi menyatakan tabel waktu belum bisa dibuat. Komentar mesin menyebut deteksi dlib 1080p sekitar 200 ms/frame, sehingga klaim <200 ms belum didukung data.
- **Konflik dan dampak:** Klaim "< 200 ms/frame" adalah nilai yang belum diukur. Menuliskannya di naskah berarti mengisi tebakan. Instrumentasi per komponen ada di wilayah agen mesin. Instrumentasi hanya boleh menambah pencatatan waktu tanpa mengubah input (resolusi, lompatan frame, jumlah thread), dan harus dibuktikan keluarannya identik.
- **Bukti:**
  - `scripts/analisis_kalibrasi_dev.py:359`: `Tabel 1 (waktu per komponen) belum bisa dibuat: mesin belum mencatat waktu MTCNN/FaceNet/dlib per presentasi.`
  - `capture_session.py:335`: `frame_ms = (time.perf_counter() - t_frame) * 1000`
  - `telemetry_logger.py:99`: `processing_ms REAL,`
  - `facenet_emar_system.py:212`: `# Deteksi wajah dlib pada frame 1080p ~200 ms/frame`
- **Usulan perubahan:**
  - `facenet_emar_system.py`: Agen mesin, setelah keputusan: catat waktu MTCNN, embedding FaceNet dan landmark dlib per frame ke presence_logs (kolom baru melalui ADDED_COLUMNS di telemetry_logger.py). Lampirkan tes bahwa keputusan dan jarak identik.
  - `scripts/generate_bab5_evaluation.py`: BARU: 5.E hanya membaca kolom waktu yang ada dan mengosongkan sel bila kolom tidak ada. Jangan cetak klaim ambang 200 ms.
- **Pertanyaan keputusan:** Izinkan instrumentasi waktu per komponen di mesin (tanpa mengubah input)? Klaim < 200 ms dihapus dari PRD sampai terukur?
- **Catatan verifier:** Benar: waktu per komponen tidak tercatat di mana pun. Tambahan: (1) frame_ms di capture_session mencampur frame dengan dan tanpa FaceNet, karena FaceNet hanya dijalankan tiap 10 frame. Flag facenet_fresh ikut dicatat sehingga kedua jenis frame bisa dipisahkan, tetapi rata-rata frame_ms mentah bukan latensi pipeline penuh. (2) Jalur web (verify_video lewat PresensiController) tidak mencatat waktu pemrosesan sama sekali. Yang dicatat hanya camera_fps dari klien, yaitu fps kamera, bukan fps pipeline. (3) Komentar mesin juga menyebut sekitar 12 fps untuk EMAR saja. Klaim <200 ms memang belum didukung data.

### QA-10: Tabel 5.F Friedman + Kendall W + Wilcoxon Bonferroni (N=18)

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** analisis_tingkat_subjek.py sudah punya Friedman dan Wilcoxon dengan Bonferroni 0.0167. Namun skrip ini membaca CSV sintetis 6.480 dan memeriksa integritas terhadap matriks konfusi yang ditulis tangan. Matriks itu tidak cocok dengan CSV yang ter-commit; hitungan grep/cut: S1 bona fide Reject=28 (acuan 14), S1 serangan Accept=4743 (acuan 4800), S3 bona fide Reject=0 (acuan 2). Akibatnya skrip berhenti di sys.exit(1). m_obs=360 mengasumsikan 10 repetisi. Kendall W belum ada. Versi web menghitung FTA sebagai galat.
- **Konflik dan dampak:** Hasil Friedman/Wilcoxon yang ada (dan angka README) bersumber dari data karangan. Bila dipakai di naskah, Bab 5 melaporkan uji atas data yang tidak pernah diukur. Perlakuan FTA sebagai galat di versi web bertentangan dengan aturan FTA terpisah, kecuali dinyatakan eksplisit sebagai metrik end-to-end yang berbeda.
- **Bukti:**
  - `analisis_tingkat_subjek.py:10`: `csv_path = os.path.join(script_dir, 'exports', 'Dataset_Cochran_Q_ISO30107_6480.csv')`
  - `analisis_tingkat_subjek.py:28`: `'M1': {'TP': 1606, 'FN': 14, 'TN': 60, 'FP': 4800},`
  - `analisis_tingkat_subjek.py:112`: `m_obs = 360`
  - `analisis_tingkat_subjek.py:92`: `stat, p_friedman = stats.friedmanchisquare(m1_err, m2_err, m3_err)`
  - `attendance-web/app/Services/SubjectLevelAnalysisService.php:15`: `Positif = presentasi diterima. FTA dihitung sebagai tidak diterima`
  - `.cursor/rules/thesis-methodology.mdc:10`: `Report FTA separately; it must not enter APCER or BPCER denominators.`
- **Usulan perubahan:**
  - `analisis_tingkat_subjek.py:10`: Ganti masukan ke ekspor presentasi nyata (CochranExportService / --csv argumen). Hapus ref_cm tertulis tangan (baris 27-58). m_obs diambil dari parameter_penelitian.N_PER_SUBJECT.
  - `analisis_tingkat_subjek.py:92`: Tambah Kendall W = chi2_Friedman / (N*(k-1)) dan laporkan N subjek aktual.
  - `attendance-web/app/Services/SubjectLevelAnalysisService.php:15`: Setelah keputusan: pisahkan FTA dari galat per subjek, atau beri label metrik end-to-end.
  - `tests/`: BARU tests/test_analisis_tingkat_subjek.py: data kecil dengan subject_id dari kolom, bukan urutan baris (thesis-guard.md:27).
- **Pertanyaan keputusan:** Pada galat per subjek untuk Friedman, FTA dikeluarkan (konsisten ISO) atau dihitung sebagai galat end-to-end?
- **Catatan verifier:** Terverifikasi dengan hitungan grep pada CSV ter-commit: S1 bona fide Reject=28 (acuan 14), S1 serangan Accept=4743 (acuan 4800), S3 bona fide Reject=0 (acuan 2). Ketidakcocokan lain: S2 FN=28 (acuan 23), S2 FP=32 (acuan 42). Skrip berhenti di sys.exit(1). Kendall W tidak ditemukan. Koreksi soal FTA: versi web tidak sekadar 'menghitung FTA sebagai galat'. FTA bona fide dihitung FN (galat) dan FTA serangan dihitung TN (penolakan benar), sehingga keduanya masuk penyebut. Bila analisis_tingkat_subjek.py diberi ekspor nyata CochranExportService (yang menulis nilai 'FTA'), baris 70 menghitung FTA sebagai galat untuk bona fide MAUPUN serangan, sedangkan baris 38-44 membuang FTA dari matriks konfusi. Itu perlakuan FTA ketiga. Pemeriksaan len(df)!=6480 (baris 18) juga akan menghentikan skrip. Panel web SubjectErrorRatePanel hanya menampilkan placeholder Friedman/Wilcoxon dan menyuruh menjalankan skrip ini.

### QA-11: Tabel 5.F Cochran's Q + McNemar + odds ratio / Cohen's g pada N=6.480 atau 360 (tingkat percobaan)

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Cochran's Q hanya ada di generator sintetis, dengan p-value ditulis sebagai teks tetap. McNemar exact ada di mesin dan memperlakukan tiap baris sebagai pasangan bebas. Percobaan bersarang dalam subjek (180 per subjek). Untuk P_DEV_01, seluruh 360 percobaan berasal dari satu orang. Odds ratio dan Cohen's g tidak ditemukan.
- **Konflik dan dampak:** Cochran's Q dan McNemar mengasumsikan blok (baris) saling bebas. Percobaan berulang per subjek berkorelasi, sehingga p-value tingkat percobaan terlalu kecil (inflasi tipe I; design effect 1+(m-1)rho). Koreksi kluster yang lazim (GEE/mixed-effects/bootstrap) dilarang aturan repo. Inferensi yang sah tinggal di tingkat subjek (Friedman/Wilcoxon, N=18). Pada N=360 dari satu orang tidak ada inferensi ke populasi.
- **Bukti:**
  - `scripts/export_cochran_dataset.py:246`: `print(f" P-value : < 0.0001 (Signifikan Secara Statistik pada alpha = 0.01)")`
  - `facenet_emar_system.py:1537`: `res = mcnemar(table, exact=True)`
  - `scripts/analisis_kalibrasi_dev.py:29`: `Semua presentasi berasal dari satu orang, jadi tidak saling bebas.`
  - `analisis_tingkat_subjek.py:114`: `deffs = {rho: 1 + (m_obs - 1) * rho for rho in rhos}`
  - `.claude/agents/thesis-guard.md:27`: `No GEE, mixed-effects logistic regression, or bootstrap`
- **Usulan perubahan:**
  - `scripts/generate_bab5_evaluation.py`: BARU: uji utama di tingkat subjek. Cochran's Q/McNemar tingkat percobaan, bila dipertahankan, dilabeli deskriptif (bukan inferensi populasi), disertai sel diskordan b/c, OR = b/c dan Cohen's g = b/(b+c) - 0.5, serta tabel design effect. Untuk P_DEV_01 hanya statistik deskriptif.
  - `facenet_emar_system.py:1511`: Agen mesin: docstring mcnemar_test diberi catatan asumsi independensi. Rumus tidak diubah.
- **Pertanyaan keputusan:** Cochran's Q/McNemar tingkat percobaan dihapus dari Bab 5 atau dipertahankan sebagai deskriptif dengan catatan independensi?
- **Catatan verifier:** Benar. Tambahan: (1) mcnemar_test di mesin tidak dipanggil di mana pun. Pencarian rekursif seluruh *.py hanya menemukan definisinya, jadi saat ini tidak ada hasil McNemar yang dihasilkan. (2) Statistik Q dihitung (export_cochran_dataset.py:231-234), tetapi p-value dicetak sebagai teks tetap tanpa perhitungan. Odds ratio dan Cohen's g tidak ditemukan. Inferensi tingkat percobaan memang melanggar asumsi independensi, dan koreksi kluster dilarang thesis-guard.md:27.

### QA-12: Apakah 6.480 berasal dari generator sintetis berbasis hash (scripts/export_cochran_dataset.py, exports/Dataset_Cochran_Q_ISO30107_6480.csv)

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Ya. Skor dan keputusan dibangkitkan dari zlib.crc32 atas string ID-label-kondisi-repetisi dengan REPETITIONS=10. S2 sintetis memakai EAR >= 0.200, terbalik dari aturan kedip EAR < 0.20. CSV tersebut ter-commit (commit 72db74f). Ekspor web sudah mengakui versi lama membangkitkan 6.480 baris dari CRC32. Tabel README (6,480 images; ACER 49.81/1.14/0.22%) sama persis dengan ref_cm di analisis_tingkat_subjek.py, bukan dengan isi CSV yang ter-commit.
- **Konflik dan dampak:** Seluruh angka 6.480, termasuk hasil di README, adalah fabrikasi deterministik dan tidak boleh masuk Bab 5. PRD yang menjadikan 6.480 sebagai N P01-P18 mewarisi data karangan ini.
- **Bukti:**
  - `scripts/export_cochran_dataset.py:61`: `hash_val = zlib.crc32(seed_str.encode("utf-8"))`
  - `scripts/export_cochran_dataset.py:36`: `REPETITIONS = 10`
  - `scripts/export_cochran_dataset.py:81`: `s2_live = (skor_ear >= 0.200 and skor_mar >= 0.100)`
  - `attendance-web/app/Services/CochranExportService.php:16`: `Versi sebelumnya membangkitkan 6.480 baris dari hash CRC32 tanpa satu pun`
  - `README.md:226`: `\| Total Dataset \| **6,480 images** \|`
  - `README.md:250`: `\| **FaceNet + EMAR Weighted Fusion** \| **99.74%** \| **99.48%** \| **0.22%** \|`
- **Usulan perubahan:**
  - `scripts/export_cochran_dataset.py:1`: Setelah keputusan: beri peringatan SINTETIS di docstring dan keluaran, atau hentikan pemakaiannya. Jangan hapus tanpa persetujuan.
  - `analisis_tingkat_subjek.py:10`: Putus ketergantungan ke CSV sintetis (lihat QA-10).
  - `README.md:220`: Untuk agen naskah/dokumentasi: tandai tabel dataset dan performa sebagai tidak berasal dari pengukuran.
- **Pertanyaan keputusan:** exports/Dataset_Cochran_Q_ISO30107_6480.csv dan export_cochran_dataset.py ditandai sintetis, dipindah, atau dihapus? README diperbaiki oleh siapa?
- **Catatan verifier:** Terverifikasi. Angka README (ACER 49,81/1,14/0,22%, akurasi 99,74%, APCER 0,31%, BPCER 0,12%) cocok persis dengan ref_cm. CSV ter-commit justru memberi S3 BPCER 0% (FN=0), sehingga README tidak berasal dari CSV itu. Tambahan: (1) Keputusan S2/S3 untuk print dan screen attack ditulis tetap 'Reject' tanpa perhitungan apa pun (baris 97-98, 108-109). (2) S3 sintetis memakai rumus lain: 1-d/0,80, P_live kontinu, ambang 0,50. (3) README juga menulis '27 kondisi eksperimen' (desain 9) serta Flask/TensorFlow/Keras, yang bertentangan dengan DECISION_LOG #1/#3 (PyTorch, FastAPI). README memuat penanda ':chatgpt-content-reference' (baris 235 dan 261), tanda teks hasil generator. Working tree bersih; CSV identik dengan commit 72db74f.

### QA-13: Dataset_Eksperimen_Bab5.csv sebagai masukan Bab 5 (ID apa saja di dalamnya)

- **Verdict:** Risiko integritas data (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Ada 117 baris data. S01: 67 baris (31 BONA_FIDE, 36 ATTACK). emb_TEST-QALWANI-001: 43 baris. S02: 3 baris. P01-P04: masing-masing 1 baris di baris 2-5, identik dengan kasus demo evaluation_bab5.py. Tidak ada P05-P18 dan tidak ada P_DEV_01. Sepuluh baris S01 punya d=0.85 dengan S1=1, bertentangan dengan aturan d<=0.40. Ada 53 baris 30 cm/300 lux dan 27 baris EAR 0.18 & MAR 0.4, pola nilai bawaan lama dan fallback PresensiController.
- **Konflik dan dampak:** CSV ini belum berisi data P01-P18. CSV ini memuat baris demo, baris uji pengembang, dan baris yang EAR/MAR/lux/jaraknya hasil fallback, bukan pengukuran. Membacanya mentah ke Tabel 5.x memasukkan nilai karangan. Membersihkannya juga dilarang (hanya boleh menambah baris).
- **Bukti:**
  - `Dataset_Eksperimen_Bab5.csv:2`: `P01,30,300,Bona_Fide,0.25,0.17,0.42,1,1,1`
  - `evaluation_bab5.py:270`: `("P01", 30, 300, "Bona_Fide", 0.25, 0.17, 0.42),`
  - `Dataset_Eksperimen_Bab5.csv:9`: `S01,30,350,BONA_FIDE,0.85,0.18,0.4,1,1,0`
  - `evaluation_bab5.py:160`: `None bila tidak ada bacaan hasil ukur; CSV lalu berisi sel kosong. Dulu`
  - `attendance-web/app/Http/Controllers/PresensiController.php:411`: `$earVal = (float) ($request->input('ear_val') ?? ($earBlinks > 0 ? 0.18 : 0.28));`
  - `.claude/agents/thesis-guard.md:25`: `research CSVs (`Dataset_Eksperimen_Bab5.csv`, ...) must not be rewritten or cleaned`
- **Usulan perubahan:**
  - `scripts/generate_bab5_evaluation.py`: BARU: filter eksplisit daftar participant_id P01-P18 dan tanggal mulai uji. Laporkan jumlah baris yang dikecualikan per alasan (demo, ID uji, S1 tidak konsisten). Tanpa menulis ulang CSV.
  - `attendance-web/app/Http/Controllers/PresensiController.php:411`: Agen web: fallback ear_val/mar_val diganti null (temuan thesis-guard check 2), agar baris baru tidak mewarisi nilai karangan.
- **Pertanyaan keputusan:** Baris lama (P01-P04 demo, S01, S02, emb_TEST-QALWANI-001) dikecualikan lewat filter analisis? Perlu berkas daftar pengecualian terdokumentasi?
- **Catatan verifier:** Sebagian besar terverifikasi: 117 baris data; S01=67 (31 BONA_FIDE, 36 ATTACK); emb_TEST-QALWANI-001=43; S02=3; P01-P04 di baris 2-5 identik dengan demo; 53 baris 30/300; 27 baris EAR 0,18 & MAR 0,4. KOREKSI ANGKA: baris S01 dengan d=0,85 dan S1=1 ada 13, bukan 10 (baris 9,14,19,23,27,33,44,48,52,59,78,88,95). Kutipan evaluation_bab5 ada di baris 159, bukan 160. Tambahan penting: (1) Penulis web mengisi participant_id dengan embedding_id dengan fallback 'S01' (PresensiController.php:177), dan label dari sample_type dengan fallback 'BONA_FIDE' (baris 188). Ini menjelaskan banyaknya baris S01 dan merupakan nilai karangan (thesis-guard cek 2). (2) CSV ini tidak punya kolom spesies PAI maupun split (label hanya BONA_FIDE/ATTACK), jadi tidak bisa memberi APCER per spesies untuk Tabel 5.C. (3) Ketiadaan P_DEV_01 memang disengaja (calibration_dev dikecualikan, baris 623). (4) Usulan filter 'P01-P18' keliru: ID subjek nyata adalah S01..S18/embedding_id, dan filter P01-P18 justru hanya meloloskan baris demo P01-P04.

### QA-14: CLAUDE.md parameter dikunci: EAR <= 0.20

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Kode dan tes mengunci aturan ketat EAR < 0.20 di Python mesin, evaluator, browser, dan tes Python/TS. EAR tepat 0.20 dihitung mata terbuka.
- **Konflik dan dampak:** Bila agen mengikuti "<=" dari CLAUDE.md, ia akan mengubah operator. Keputusan kedip pada frame EAR=0.20 berubah, tes terkunci gagal, dan data baru tidak sebanding dengan data lama.
- **Bukti:**
  - `parameter_penelitian.py:32`: `EAR_BLINK_THRESHOLD = 0.20 # mata tertutup jika EAR < 0,20`
  - `attendance-web/resources/js/Utils/emarGeometry.ts:132`: `const eyesClosed = ear < EAR_BLINK_THRESHOLD;`
  - `tests/test_parameter_naskah.py:129`: `def test_ear_tepat_0_20_bukan_mata_tertutup(self, emar):`
  - `tests/test_evaluation_bab5.py:49`: `# EAR tepat 0.20 masih dihitung mata terbuka`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: tulis "mata tertutup bila EAR < 0,20 (ketat)" dan rujuk parameter_penelitian.py:32 sebagai sumber, bukan menyalin angka.
- **Catatan verifier:** Benar: kode memakai aturan ketat EAR < 0,20 di Python, TS, PHP dan biometric-api (emar_service.py:237), dan dikunci tes. Tambahan: ModelSettingController mengizinkan admin mengubah ear_threshold 0,15-0,25 saat runtime, dan PresensiController.php:417 membaca modelSettings lebih dulu (cabang tanpa tantangan). Nilai efektif bisa bergeser dari 0,20 tanpa perubahan kode.

### QA-15: CLAUDE.md: MAR >= 0.10 dengan Delta_MAR >= 0.05

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** MAR >= 0.10 inklusif sudah sesuai. Kriteria Delta_MAR >= 0.05 tidak ada di kode Python, TS, maupun PHP (git grep delta_mar/deltaMar/MAR_DELTA tidak menemukan apa pun). Siklus mulut dihitung dari persilangan ambang dengan minimal 3 frame.
- **Konflik dan dampak:** Delta_MAR adalah ambang baru. Menuliskannya sebagai "dikunci" mendorong agen menambahkannya ke keputusan S2/S3 tanpa persetujuan. Keputusan PAD calibration_dev yang sudah terekam tidak lagi sebanding, dan tabel 2b berubah makna.
- **Bukti:**
  - `parameter_penelitian.py:33`: `MAR_OPEN_THRESHOLD = 0.10 # mulut terbuka jika MAR >= 0,10`
  - `facenet_emar_system.py:945`: `mouth_cycles = count_full_cycles(`
  - `.cursor/rules/thesis-methodology.mdc:12`: `Do not introduce, replace, or tune FaceNet, EAR, MAR, blink, or timing thresholds without explicit approval.`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: tulis hanya MAR >= 0,10 (inklusif). Delta_MAR dicatat sebagai usulan yang menunggu persetujuan, bukan parameter terkunci.
- **Pertanyaan keputusan:** Apakah Delta_MAR >= 0.05 memang kriteria baru yang ingin ditambahkan? Bila ya, berlaku hanya untuk data setelah tanggal keputusan?
- **Catatan verifier:** Benar: tidak ada Delta_MAR di mana pun (git grep delta_mar/deltaMar/mar_delta kosong), dan MAR >= 0,10 inklusif. Koreksi: 'minimal 3 frame' hanya berlaku di mesin Python (MOUTH_OPEN_FRAMES=3, dipakai count_full_cycles). CycleCounter browser (emarGeometry.ts:65-83) dan count_cycles di analisis_kalibrasi_dev.py:202-214 menghitung satu siklus dari satu frame aktif tanpa minimum frame. Keputusan calibration_dev memakai ChallengeTracker (satu transisi). Jadi definisi siklus mulut sudah berbeda antara mesin dan browser.

### QA-16: CLAUDE.md: alpha 0.60, jendela 8.0 s

- **Verdict:** Sudah ada (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Sudah dikunci di parameter_penelitian.py dan dites. Namun PresensiController menulis 0.6/0.4 secara langsung, tidak membaca ALPHA dari konfigurasi.
- **Konflik dan dampak:** Nilainya sudah sesuai. Salinan hard-code alpha di PresensiController.php:423 melanggar aturan "runtime thresholds must be supplied through configuration". Ini temuan untuk agen web, bukan perubahan nilai.
- **Bukti:**
  - `parameter_penelitian.py:34`: `ALPHA_DEFAULT = 0.60`
  - `parameter_penelitian.py:35`: `OBSERVATION_WINDOW_S = 8.0`
  - `tests/test_parameter_naskah.py:36`: `assert P.ALPHA_DEFAULT == 0.60`
  - `attendance-web/app/Http/Controllers/PresensiController.php:423`: `$sFinal = $evaluated ? (0.6 * $pFace) + (0.4 * $pLive) : null;`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: rujuk parameter_penelitian.py:34-35.
  - `attendance-web/app/Http/Controllers/PresensiController.php:423`: Agen web: baca alpha dari config (nilai tetap 0.60) dan tambahkan tes.
- **Catatan verifier:** Benar. Tambahan salinan hard-code alpha 0,6/0,4 (juga skala 1,5 dan ambang 0,75): AttendanceHistoryController.php:88 dan :289, serta Bab5ScenarioCard.tsx:97. config/biometrics.php belum punya kunci alpha (hanya scan_duration_sec=8 untuk jendela), jadi usulan 'baca dari config' perlu kunci baru bernilai 0,60. Catatan: ModelSettingController juga membuka facenet_threshold 0,20-0,60 saat runtime.

### QA-17: CLAUDE.md: timeout tantangan 6.0-8.0 s

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Timeout tantangan di browser dan modul Python sama-sama 4.0 s. Tes Vitest mengunci REJECT_TIMEOUT pada 5.2 s.
- **Konflik dan dampak:** Mengubah timeout berarti mengubah parameter waktu tanpa persetujuan. Hasil tantangan (PASS/REJECT_TIMEOUT) calibration_dev yang sudah terekam dengan 4.0 s tidak sebanding dengan data baru, sehingga APCER replay/BPCER berubah. Rentang "6.0-8.0" juga bukan satu nilai.
- **Bukti:**
  - `attendance-web/resources/js/Utils/emarGeometry.ts:96`: `export const CHALLENGE_TIMEOUT_S = 4.0;`
  - `active_liveness.py:38`: `def __init__(self, timeout_seconds: float = 4.0):`
  - `attendance-web/resources/js/Utils/__tests__/emarGeometry.test.ts:113`: `expect(t.update(CLOSED_EYE, CLOSED_MOUTH, 5.2)).toBe('REJECT_TIMEOUT');`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: tulis CHALLENGE_TIMEOUT_S = 4.0 s (emarGeometry.ts:96) sebagai kondisi sekarang. Perubahan menunggu keputusan.
- **Pertanyaan keputusan:** Timeout tantangan tetap 4.0 s, atau diganti satu nilai tertentu (6.0? 8.0?) mulai tanggal tertentu dengan data lama ditandai?
- **Catatan verifier:** Benar: timeout 4,0 s di browser dan Python. Ketelitian: tes Vitest memulai tantangan pada t=1,0, jadi REJECT_TIMEOUT pada 5,2 berarti selang 4,2 s > 4,0 s. Nilai 4 s juga terkunci di pesan PHP dan tesnya ('>4s') serta di UI, sehingga mengubahnya menyentuh beberapa tempat sekaligus.

### QA-18: CLAUDE.md: jarak 30/45/60 dengan toleransi ±2.0 cm

- **Verdict:** Keliru secara fakta (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Rentang sah terkunci 30-40, 45-55 dan 60-70 cm di Python, config Laravel, dan TS, serta dites (35 cm sah untuk tingkat 30; 42 dan 57 cm tidak sah).
- **Konflik dan dampak:** ±2 cm (28-32/43-47/58-62) membuat posisi 35, 50 dan 65 cm tidak sah. Sel kondisi untuk data yang sudah terekam pada rentang Subbab 5.2 jadi tidak valid.
- **Bukti:**
  - `parameter_penelitian.py:73`: `DISTANCE_BANDS = { 30: (30.0, 40.0),`
  - `attendance-web/config/biometrics.php:37`: `'DEKAT' => [30.0, 40.0],`
  - `attendance-web/resources/js/Utils/distanceCalibration.ts:30`: `{ category: 'DEKAT', target_cm: 30, min_cm: 30, max_cm: 40, label: 'Dekat' },`
  - `tests/test_parameter_naskah.py:60`: `(30, 30), (35, 30), (40, 30),`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: tulis DISTANCE_BANDS 30-40/45-55/60-70 cm dari parameter_penelitian.py:73-77. Bila ±2 cm yang dimaksud adalah residu kalibrasi, itu nilai lain (calibration_max_residual_cm = 3.0, biometrics.php:46).
- **Catatan verifier:** Benar dan konsisten di Python, config Laravel, TS dan DistanceController (30-40/45-55/60-70, inklusif). Residu kalibrasi 3,0 cm ada di biometrics.php:46 dan distanceCalibration.ts:36. Tidak ada toleransi ±2 cm di kode.

### QA-19: CLAUDE.md: lux <100 / 100-300 / >300 (Redup/Standar/Terang)

- **Verdict:** Sudah ada (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Batas sudah sesuai. Kunci kategori di kode adalah 'redup', 'normal', 'terang'. 'Standar' hanya label tampilan di ekspor dan pengukur lux. Docstring mesin masih memuat nilai lama (<200/200-500/>500 lux; 30/60/100 cm).
- **Konflik dan dampak:** Tidak ada konflik nilai. CLAUDE.md harus menyebut kunci kode 'normal' agar agen tidak mengganti kunci menjadi 'standar', yang akan memutus filter analisis (LUX_ORDER). Docstring mesin yang usang bisa menyesatkan agen.
- **Bukti:**
  - `parameter_penelitian.py:50`: `LUX_REDUP_MAX = 100.0 # redup : lux < 100`
  - `attendance-web/app/Services/CochranExportService.php:53`: `'normal' => 'Standar',`
  - `facenet_emar_system.py:32`: `- Intensitas cahaya: Redup (<200 lux), Normal (200–500 lux), Terang (>500 lux)`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: "redup <100, normal 100-300 (label tampilan: Standar), terang >300; sumber parameter_penelitian.py:50-66".
  - `facenet_emar_system.py:32`: Agen mesin/dokumentasi: perbarui docstring baris 32-33 agar sesuai parameter_penelitian (hanya komentar).
- **Catatan verifier:** Benar. Tambahan: LuxController memakai kode LOW/NORMAL/HIGH dengan condition 'Standar', dan CochranExportService masih menerima kunci lama lux_low/lux_medium/lux_high. Docstring mesin yang usang juga mencakup jarak 30/60/100 cm (baris 33), bukan hanya lux.

### QA-20: CLAUDE.md taksonomi: bona_fide/print_attack/screen_attack/replay_attack/cutout_attack

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja M; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Label serangan di kode adalah print_attack, screen_attack dan replay_video. Label ini dipakai di validasi PresensiController, CochranExportService, soloSession.ts, ResearchDatasetController, dan kolom tabel kalibrasi (apcer_replay_video). replay_attack dan cutout_attack tidak ditemukan di mana pun.
- **Konflik dan dampak:** Mengganti nama replay_video menjadi replay_attack memecah data. Rekaman calibration_dev yang sudah tersimpan dengan pai_species 'replay_video' tidak lagi cocok dengan validasi dan filter, sehingga APCER replay kosong. Menambah cutout_attack mengubah desain: N_ATTACK naik dan N_TOTAL dari 3.240 menjadi 4.050 dengan 5 repetisi. Ini spesies PAI baru tanpa data dan tanpa persetujuan.
- **Bukti:**
  - `parameter_penelitian.py:100`: `ATTACK_LABELS = ("print_attack", "screen_attack", "replay_video")`
  - `attendance-web/app/Http/Controllers/PresensiController.php:47`: `public const PAI_SPECIES = ['print_attack', 'screen_attack', 'replay_video'];`
  - `attendance-web/resources/js/Utils/soloSession.ts:21`: `export type SoloSample = 'bona_fide' \| 'print_attack' \| 'screen_attack' \| 'replay_video';`
  - `parameter_penelitian.py:105`: `N_ATTACK = N_SUBJECTS * len(ATTACK_LABELS) * REPETITIONS * N_CONDITIONS # 2.430`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: tulis taksonomi persis ATTACK_LABELS (replay_video). Bila nama tampilan 'replay attack' diinginkan, cukup di label UI.
- **Pertanyaan keputusan:** Apakah cutout_attack benar ditambahkan ke desain (mengubah N_TOTAL)? Apakah nama replay_attack hanya label tampilan?
- **Catatan verifier:** Inti benar: label kode adalah print_attack/screen_attack/replay_video, dan string replay_attack/cutout_attack memang tidak ada. Hitungan 4.050 benar (18x4x5x9 + 810). Koreksi: (1) ResearchDatasetController TIDAK memakai print_attack/screen_attack. Ia memakai printed_photo/screen_photo/replay_video (kode PP/PS/PR), sehingga taksonomi di repo sudah tidak seragam. (2) Konsep cut-out sudah ada: penulis Matriks_Evaluasi_Bab4.csv mengisi PAI_Species='CUT_OUT', disimpulkan dari prediksi (kedip ada, mulut tidak), bukan dari label kebenaran. Ini sendiri masalah integritas karena label spesies diturunkan dari keluaran sistem. Pesan dan tes 'Cut-Out Photo Attack' juga ada.

### QA-21: CLAUDE.md: stack Laravel 12/11 + MiniFASNet

- **Verdict:** Bertentangan dengan metodologi terkunci (verifikasi: lolos); ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Laravel terpasang adalah 13 (composer.json ^13.8, lock v13.33.0). README masih menulis Laravel 11. MiniFASNet tidak ditemukan di kode. Decision Log menetapkan liveness EMAR tanpa model CNN.
- **Konflik dan dampak:** Versi Laravel di PRD keliru secara fakta. Agen bisa memakai API versi salah, sedangkan attendance-web/AGENTS.md meminta cek versi terpasang. Menyebut MiniFASNet sebagai bagian stack bertentangan dengan Decision Log #2. Bila diimplementasikan, keputusan PAD tidak lagi murni EMAR, sehingga S2/S3 dan judul penelitian berubah.
- **Bukti:**
  - `attendance-web/composer.json:11`: `"laravel/framework": "^13.8",`
  - `attendance-web/composer.lock:1135`: `"version": "v13.33.0",`
  - `README.md:207`: `- Laravel 11`
  - `docs/specs/DECISION_LOG.md:13`: `Tidak akan menggunakan model CNN 3D untuk liveness.`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: "Laravel 13 (lihat composer.lock), FastAPI, PyTorch FaceNet + dlib/MediaPipe EMAR; tanpa MiniFASNet".
  - `README.md:207`: Agen dokumentasi: perbaiki versi Laravel.
- **Pertanyaan keputusan:** MiniFASNet dicoret dari PRD (sesuai Decision Log #2), atau memang direncanakan sebagai pembanding terpisah di luar S1/S2/S3?
- **Catatan verifier:** Fakta versi benar: composer ^13.8, lock v13.33.0, README menulis Laravel 11; MiniFASNet tidak ditemukan di kode. Koreksi: DECISION_LOG.md:13 hanya menolak 'model CNN 3D', bukan semua CNN. MiniFASNet (CNN 2D) tidak dilarang secara harfiah, tetapi menyimpang dari fokus EMAR yang diadopsi (DECISION_LOG #2) dan akan mengubah makna S2/S3. Tambahan: README juga menulis 'Flask API' dan 'TensorFlow / Keras' serta 'PHP 8.2+', bertentangan dengan DECISION_LOG #3 (FastAPI, Flask ditolak), basis PyTorch, dan composer php ^8.3.

### QA-22: .claude/settings.json: mode effort maksimal & izin tool

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: ya
- **Kondisi sekarang:** Isi sekarang hanya menonaktifkan plugin laravel-boost. Belum ada blok permissions. Kunci pengaturan untuk "effort maksimal" tidak ada buktinya di repo, sehingga perlu diverifikasi terhadap dokumentasi Claude Code yang terpasang. Repo publik, dan galeri, CSV riset serta DB log wajib tidak tertulis.
- **Konflik dan dampak:** "Izin tool" yang luas (auto-allow Edit/Write/Bash) memungkinkan agen menulis gallery/*.pkl, Dataset_Eksperimen_Bab5.csv atau logs/*.db tanpa konfirmasi. Ini melanggar aturan data. File ini ter-commit ke repo publik.
- **Bukti:**
  - `.claude/settings.json:3`: `"laravel-boost@anthropic-plugin-directory": false`
  - `.claude/agents/thesis-guard.md:25`: `The real gallery (`gallery/face_gallery.pkl`) must never be written`
- **Usulan perubahan:**
  - `.claude/settings.json:2`: Pertahankan enabledPlugins. Tambah permissions.deny untuk Edit/Write pada gallery/**, dataset/**, Dataset_Eksperimen_Bab5.csv, logs/*.db, exports/Dataset_Cochran_Q_ISO30107_6480.csv. Allow hanya perintah baca dan runner cek-semua. Pengaturan effort ditambahkan setelah nama kuncinya diverifikasi.
- **Pertanyaan keputusan:** Seberapa luas izin otomatis yang diinginkan? Daftar path yang wajib deny disetujui?

### QA-23: .claude/agents/01..06 (termasuk 06 qa-stat-evaluator)

- **Verdict:** Bisa dengan perubahan; ukuran kerja M; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Hanya ada thesis-guard.md. Agen ini read-only, memuat aturan statistik (tanpa GEE/mixed-effects/bootstrap; identitas subjek dari kolom nyata), dan membaca .cursor/rules terlebih dulu.
- **Konflik dan dampak:** Agen 06 yang ditulis dari PRD apa adanya (bootstrap, Cochran tingkat percobaan, N=6.480) akan bertentangan dengan thesis-guard. Agen baru harus mewarisi aturan thesis-guard, bukan menimpanya.
- **Bukti:**
  - `.claude/agents/thesis-guard.md:4`: `tools: Read, Grep, Glob, Bash`
  - `.claude/agents/thesis-guard.md:17`: `Read `.cursor/rules/thesis-methodology.mdc` first; its rules apply in full.`
  - `.claude/agents/thesis-guard.md:27`: `subject identity must come from a real column, never from row order.`
- **Usulan perubahan:**
  - `.claude/agents/thesis-guard.md`: Dipertahankan apa adanya. Agen baru merujuknya sebagai reviewer wajib.
  - `.claude/agents/qa-stat-evaluator.md`: BARU: tools Read/Grep/Glob/Bash, plus tulis hanya ke tests/ dan exports/. Memuat aturan statistik thesis-guard, rujukan parameter_penelitian.py, dan kewajiban menjalankan skill cek-semua.

### QA-24: .claude/commands/fix-pad-testbench.md dan generate-bab5-tables.md, dipanggil /project:fix-pad-testbench

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Direktori .claude/commands/ tidak ada. Repo sudah memakai format skill (.claude/skills/cek-semua/SKILL.md) yang menjalankan semua tes dan cek md5 galeri. Sintaks pemanggilan "/project:" bergantung pada versi Claude Code dan tidak dapat diverifikasi dari repo.
- **Konflik dan dampak:** Perintah "fix-pad-testbench" berisiko mengubah rumus PAD atau ambang demi meluluskan tes. Itu dilarang tanpa tes dan persetujuan. generate-bab5-tables harus read-only terhadap data mentah.
- **Bukti:**
  - `.claude/skills/cek-semua/SKILL.md:2`: `name: cek-semua`
  - `.claude/skills/cek-semua/SKILL.md:19`: `Terakhir, md5 `gallery/face_gallery.pkl` dibandingkan sebelum dan sesudah.`
  - `.cursor/rules/thesis-methodology.mdc:13`: `Do not alter metric formulas without accompanying unit tests.`
- **Usulan perubahan:**
  - `.claude/skills/generate-bab5-tables/SKILL.md`: BARU (format sama dengan cek-semua): menjalankan scripts/generate_bab5_evaluation.py, menulis hanya ke exports/, lalu memanggil thesis-guard.
  - `.claude/skills/fix-pad-testbench/SKILL.md`: BARU: batasi ke penambahan/perbaikan tes. Larang mengubah parameter_penelitian.py dan rumus S1/S2/S3. Wajib menjalankan cek-semua.

### QA-25: CLAUDE.md baru di root; apakah AGENTS.md hilang dari konteks bila tidak diimpor

- **Verdict:** Bisa dengan perubahan; ukuran kerja S; butuh keputusan peneliti: tidak
- **Kondisi sekarang:** Belum ada CLAUDE.md di root maupun attendance-web. AGENTS.md root (aturan antislop) dimuat sebagai instruksi proyek di sesi ini. attendance-web/AGENTS.md berisi panduan Laravel Boost. .cursor/rules tidak dibaca otomatis oleh Claude Code; thesis-guard membacanya manual. parameter_penelitian.py menyatakan dirinya sumber tunggal angka.
- **Konflik dan dampak:** Perilaku pemuat terhadap AGENTS.md saat CLAUDE.md ada tidak dapat diverifikasi dari repo. Bila pemuat memprioritaskan CLAUDE.md, aturan antislop dan panduan Laravel Boost bisa hilang. Menyalin angka ke CLAUDE.md membuat sumber kedua yang bisa menyimpang, seperti yang sudah terjadi di PRD (QA-14..21).
- **Bukti:**
  - `AGENTS.md:5`: `For UI, copy, accessibility, mobile layout, or code comments work, refer to the antislop skills in `.agents/skills/`:`
  - `attendance-web/AGENTS.md:7`: `This application is a Laravel application running on PHP 8.3.`
  - `parameter_penelitian.py:4`: `Satu sumber untuk ambang keputusan, kondisi uji, dan ukuran desain.`
- **Usulan perubahan:**
  - `CLAUDE.md`: BARU: baris pertama @AGENTS.md, lalu @.cursor/rules/thesis-methodology.mdc. Bagian parameter merujuk parameter_penelitian.py, docs/specs/DECISION_LOG.md dan .claude/agents/thesis-guard.md, dan hanya mengutip nilai yang sudah dicocokkan (QA-14..21).
  - `attendance-web/CLAUDE.md`: BARU, opsional: @AGENTS.md agar panduan Laravel Boost tetap dimuat saat bekerja di subfolder.
