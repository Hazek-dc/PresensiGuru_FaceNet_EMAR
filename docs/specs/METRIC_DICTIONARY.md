# Metric Dictionary

Kamus standar untuk mendefinisikan status dan matriks biometrik yang digunakan dalam sistem dan laporan.

## Status Keputusan
- **MATCH:** Probe dan Gallery identik berdasarkan similarity score melebihi *threshold*.
- **NON_MATCH:** Probe tidak identik dengan Gallery yang diklaim.
- **BONA_FIDE:** Presentasi terdeteksi sebagai wajah asli (liveness passed).
- **ATTACK:** Presentasi terdeteksi sebagai serangan spoofing (print/screen/replay) (liveness failed).
- **FTA (Failure to Acquire):** Sampel tidak bisa diproses sama sekali (tidak ada wajah, wajah lebih dari satu, resolusi/format salah, landmark error).
- **INVALID_CLAIM:** Percobaan verifikasi pada subjek yang belum *enrolled* / tidak eksis dalam gallery.

## Keputusan Final
- **ACCEPT:** Saat `MATCH` AND `BONA_FIDE`. Presensi dicatat.
- **REJECT:** Gagal pada Identity ATAU gagal pada Liveness ATAU mengalami FTA / Invalid Claim. Presensi tidak dicatat.

## Matriks Evaluasi (ISO 30107-3 & ISO 19795-1)
- **APCER (Attack Presentation Classification Error Rate):** Persentase serangan presentasi (*attack*) yang secara keliru diklasifikasikan sebagai *bona fide* (Lolos liveness). APCER dihitung per **PAI species** (print, screen, replay).
- **BPCER (Bona Fide Presentation Classification Error Rate):** Persentase presentasi asli (*bona fide*) yang secara keliru ditolak sebagai *attack*.
- **FTA Rate:** Persentase presentasi (dari total percobaan) yang mengalami Failure to Acquire.
- Catatan Kritis: Denominator untuk APCER dan BPCER adalah total sampel yang **berhasil diekstraksi** (di luar FTA).
