/**
 * Bunyi penanda mode solo (Web Audio API), agar operator yang berdiri di penanda
 * lantai tahu kapan hitung mundur, perekaman, dan jeda dimulai tanpa melihat layar.
 *
 * Peramban hanya mengizinkan audio setelah gestur pengguna, jadi unlockAudio()
 * dipanggil dari klik tombol "Mulai antrean".
 */

export type CueName = 'countdown' | 'record' | 'rest' | 'resume' | 'done' | 'error';

/** [frekuensi Hz, durasi ms] per nada, dimainkan berurutan dengan jeda 80 ms. */
export const CUE_PATTERNS: Record<CueName, ReadonlyArray<readonly [number, number]>> = {
    countdown: [[880, 150]],
    record: [[1320, 120]],
    rest: [[660, 110], [660, 110]],
    resume: [[990, 260]],
    done: [[660, 120], [880, 120], [1100, 220]],
    error: [[220, 450]],
};

const GAP_MS = 80;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
    if (context) return context;
    const Ctor = typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;
    try {
        context = new Ctor();
    } catch {
        context = null;
    }
    return context;
}

export function unlockAudio(): void {
    const ctx = audioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
}

export function playCue(name: CueName): void {
    const ctx = audioContext();
    if (!ctx) return;
    let at = ctx.currentTime;
    for (const [freq, ms] of CUE_PATTERNS[name]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        // Naik-turun 10 ms agar tidak berbunyi klik.
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.25, at + 0.01);
        gain.gain.setValueAtTime(0.25, at + ms / 1000 - 0.01);
        gain.gain.linearRampToValueAtTime(0, at + ms / 1000);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + ms / 1000);
        at += (ms + GAP_MS) / 1000;
    }
}
