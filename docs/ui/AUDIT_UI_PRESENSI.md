# Audit & Pemetaan UI Presensi Biometrik (FaceNet + EMAR)
**Skripsi:** *Analisis Kinerja FaceNet dan Eye-Mouth Aspect Ratio (EMAR) pada Sistem Face Verification Mitigasi Serangan Spoofing Presensi*  
**Peneliti:** Qalwani Anugerah (NPM 221220048)  
**Target Halaman:** `/presensi` (Mode Personal & Mode Kiosk)  
**Tanggal Audit:** 28 Agustus 2026

---

## 1. Deteksi Tumpukan Teknologi (Tech Stack)

| Lapisan | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Backend Web & Proxy** | Laravel 13 (PHP 8.2+) | Menyediakan rute web `/presensi`, otentikasi role, dan proxy endpoint `POST /api/presensi` |
| **Backend AI Biometrik** | Python 3.10+ (FastAPI / PyTorch) | Model FaceNet (512-D), MTCNN, dan perhitungan skor EMAR liveness |
| **Frontend Framework** | React 18 + TypeScript + Inertia.js | SPA terintegrasi Laravel via Inertia Adapter |
| **Styling & Design System** | Tailwind CSS v4 + Forms Plugin | Variabel semantik, dark/light theme switching, responsive utilities |
| **Animasi & Transisi** | Motion (`motion/react` / Framer Motion) | Animasi layout, pills, modal backdrop, spring easing |
| **Computer Vision Client** | Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | 478 3D facial landmarks, blendshapes (EAR/MAR), quality score |
| **Rendering 3D Mesh** | Three.js (`three`) | WebGL overlay 3D canonical wireframe di atas video scanner |
| **Build Tooling** | Vite 8.1.4 | Fast HMR & optimized production bundling |

---

## 2. Pemetaan Berkas Komponen Halaman `/presensi`

| No | Berkas | Lokasi | Peran & Fungsi Utama |
| :--- | :--- | :--- | :--- |
| 1 | **Page Controller** | `app/Http/Controllers/PresensiController.php` | Mengirim view Inertia `Presensi/Index`, meneruskan request verifikasi ke API biometrik |
| 2 | **Rute Halaman** | `routes/web.php` (Baris 11-13) | `GET /presensi`, `GET /attendance/capture`, `POST /api/presensi` |
| 3 | **Halaman Utama** | `resources/js/Pages/Presensi/Index.tsx` | Struktur panggung, manajemen tema (dark/light), sakelar mode (Personal/Kiosk), alur verifikasi, umpan balik status |
| 4 | **Panggung Scanner** | `resources/js/Components/Presensi/FaceScannerContainer.tsx` | Kamera live feed, WebGL overlay 3D mesh, safe zone reticle, liveness challenge (Blink/Mouth), MediaRecorder video capture |
| 5 | **Readiness Checklist** | `resources/js/Components/Presensi/QualityChecklist.tsx` | Indikator 4 parameter kesiapan (Wajah Terdeteksi, Posisi Sesuai, Pencahayaan Cukup, Uji Liveness) |
| 6 | **Telemetri Penelitian** | `resources/js/Components/Presensi/QalwaniResearchPanel.tsx` | Drawer telemetri collapsible (EAR, MAR, skor FaceNet L2, skor fusi EMAR, latensi ms, session ID) |
| 7 | **Modal Enrollment** | `resources/js/Components/Presensi/ManualEnrollmentModal.tsx` | Pendaftaran wajah manual multi-angle untuk admin/guru |
| 8 | **Hook MediaPipe** | `resources/js/Hooks/useFaceLandmarker.ts` | Deteksi landmark wajah 478-titik, blendshapes, filter smoothing adaptif |
| 9 | **Hook Three.js** | `resources/js/Hooks/useThreeFaceMesh.ts` | Rendering visualisasi 3D wireframe di atas canvas scanner |
| 10 | **Utilitas Geometri Wajah** | `resources/js/Utils/faceGeometry.ts` | Evaluasi jarak wajah, pitch, yaw, roll, dan quality gate |

---

## 3. Titik Kritis Capture Frame — Bukti Penjagaan "Aturan Emas #2 (Piksel Suci)"

Lokasi capture sampel biometrik yang dikirimkan ke backend:

### A. Perekaman MediaStream (Kamera ke VideoBlob)
- **Berkas:** `resources/js/Components/Presensi/FaceScannerContainer.tsx`
- **Baris Kode:** 276–308 (`triggerVerification`)
```typescript
const stream = streamRef.current;
const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
recorder.ondataavailable = (e) => {
    if (e.data?.size > 0) chunksRef.current.push(e.data);
};
recorder.onstop = () => {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    onVerificationSubmit(blob);
};
recorder.start();
```
- **Keterangan:** Objek `streamRef.current` berasal langsung dari `navigator.mediaDevices.getUserMedia` dengan resolusi sumber ideal 1280x720. Seluruh transformasi CSS (seperti pratinjau cermin `transform: scaleX(-1)` pada tag `<video>` baris 574) **hanya berada pada layer presentasi DOM** dan sama sekali **tidak mempengaruhi buffer piksel mentah** yang direkam oleh `MediaRecorder`.

### B. Pengiriman Payload ke Backend
- **Berkas:** `resources/js/Pages/Presensi/Index.tsx`
- **Baris Kode:** 98–132 (`handleVerificationSubmit`)
```typescript
const formData = new FormData();
formData.append('video', videoBlob, 'liveness_sample.webm');
if (mode === 'kiosk') formData.append('kiosk_id', kioskId);
const response = await axios.post('/api/presensi', formData, { ... });
```
- **Jaminan:** Struktur payload `FormData`, nama field (`video`, `kiosk_id`), dan endpoint `/api/presensi` dipertahankan 100% tanpa modifikasi.

---

## 4. Analisis Cacat Visual & Ergonomi Saat Ini (Baseline Cacat)

1. **Desktop Spacing (≥1024px / 1440px):**
   - Kolom kanan terasa kosong jika pengguna sudah login (hanya 1 kartu identitas dan checklist).
   - Perlu penambahan kartu **Ringkasan Sesi & Sistem Presensi** (Waktu server realtime, status model FaceNet 512-D, status EMAR Liveness, ambang batas aktif) agar layar desktop proporsional dan profesional untuk kebutuhan sidang/demo.
2. **Mobile Ergonomics (≤767px):**
   - Area panggung scanner perlu aspek rasio responsif yang fleksibel agar tidak menutupi checklist saat keyboard virtual aktif (Mode Kiosk).
   - Target sentuh untuk tombol aksi kiosk dan sakelar mode perlu dipastikan memenuhi standar **≥44×44px**.
3. **Panggung Kamera & Safe Zone Reticle:**
   - Reticle oval saat ini berukuran SVG statis (rx:30, ry:40); perlu responsif dinamis dengan aksen warna semantik yang mencerminkan tahapan state machine (Mencari: Abu-abu -> Menyesuaikan: Kuning -> Terkunci/Kualitas Lolos: Sian -> Liveness Tantangan: Ungu -> Berhasil: Hijau -> Gagal: Merah).
4. **Meter Liveness EMAR Realtime:**
   - Perlu penambahan visualisasi meter realtime EAR (Eye Aspect Ratio) dan MAR (Mouth Aspect Ratio) dengan indikator ambang batas `EAR_THRESH` dan `MAR_THRESH` yang bergerak mulus berbasis `requestAnimationFrame` tanpa overhead re-render React.
5. **Mode Kiosk Khusus:**
   - Tipografi besar, auto-clear timer setelah hasil presensi berhasil/gagal, dan proteksi privasi.
