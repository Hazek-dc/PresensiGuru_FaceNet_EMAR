#!/usr/bin/env bash
# Semua pengecekan proyek presensi, dijalankan satu per satu agar laptop tidak
# kehabisan memori. Tanpa argumen: semua langkah. Dengan argumen: hanya langkah
# yang disebut, mis. `cek-semua.sh laravel vitest`.
# Langkah: laravel vitest tsc build pytest-root pytest-api
set -u

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
WEB="$ROOT/attendance-web"
PY="$ROOT/.venv/Scripts/python.exe"
LOGS="D:/claude_tmp/cek-semua"
mkdir -p "$LOGS"

# Proses Python membawa BLAS satu thread dan folder sementara di D: (C: hampir penuh).
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
export TMP=D:/claude_tmp TEMP=D:/claude_tmp BIOMETRIC_WARMUP=0

STEPS=("$@")
[ ${#STEPS[@]} -eq 0 ] && STEPS=(laravel vitest tsc build pytest-root pytest-api)

gallery_md5() { md5sum "$ROOT/gallery/face_gallery.pkl" 2>/dev/null | cut -d' ' -f1; }
GALLERY_BEFORE="$(gallery_md5)"

declare -a SUMMARY
FAILED=0

run_step() {
    local name="$1" dir="$2"; shift 2
    local log="$LOGS/$name.log" start=$SECONDS
    echo "== $name"
    (cd "$dir" && "$@") >"$log" 2>&1
    local code=$?
    local secs=$((SECONDS - start))
    if [ $code -eq 0 ]; then
        SUMMARY+=("LULUS  $name (${secs}s)")
    else
        SUMMARY+=("GAGAL  $name (${secs}s, kode $code, log: $log)")
        FAILED=1
        tail -n 25 "$log"
    fi
    return $code
}

vitest_all_files() {
    npx vitest run --no-file-parallelism --maxWorkers=1 || return 1
}

for step in "${STEPS[@]}"; do
    case "$step" in
        laravel)
            run_step laravel "$WEB" php artisan test ;;
        vitest)
            if run_step vitest "$WEB" vitest_all_files; then
                # Worker yang mati karena memori bisa membuat jumlah file berkurang tanpa baris FAIL.
                line="$(grep -E 'Test Files' "$LOGS/vitest.log" | tail -1)"
                if ! echo "$line" | grep -Eq '^ *Test Files +([0-9]+) passed \(\1\)'; then
                    SUMMARY[-1]="GAGAL  vitest (jumlah file tidak lengkap: $line)"
                    FAILED=1
                fi
            fi ;;
        tsc)
            run_step tsc "$WEB" npx tsc --noEmit ;;
        build)
            # Build gagal mengosongkan public/build; batasi thread rolldown agar tidak kehabisan memori.
            if run_step build "$WEB" env RAYON_NUM_THREADS=1 TOKIO_WORKER_THREADS=1 npx vite build; then
                if [ ! -f "$WEB/public/build/manifest.json" ]; then
                    SUMMARY[-1]="GAGAL  build (public/build/manifest.json tidak ada)"
                    FAILED=1
                fi
            fi ;;
        pytest-root)
            run_step pytest-root "$ROOT" "$PY" -m pytest tests -q -p no:cacheprovider --basetemp=D:/claude_tmp/pytest-root ;;
        pytest-api)
            run_step pytest-api "$ROOT/biometric-api" "$PY" -m pytest tests -q -p no:cacheprovider --basetemp=D:/claude_tmp/pytest-api ;;
        *)
            SUMMARY+=("GAGAL  $step (langkah tidak dikenal)")
            FAILED=1 ;;
    esac
done

GALLERY_AFTER="$(gallery_md5)"
if [ "$GALLERY_BEFORE" = "$GALLERY_AFTER" ]; then
    SUMMARY+=("LULUS  galeri asli tidak berubah (md5 $GALLERY_AFTER)")
else
    SUMMARY+=("GAGAL  GALERI ASLI BERUBAH: $GALLERY_BEFORE -> $GALLERY_AFTER")
    FAILED=1
fi

echo
echo "== Ringkasan"
printf '%s\n' "${SUMMARY[@]}"
exit $FAILED
