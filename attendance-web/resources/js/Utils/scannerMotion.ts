/**
 * Motion Tokens & Design Constants for Scanner UI Transitions
 * TAHAP 13.35 — Centralized Animation Design System
 */

export const scannerMotion = {
    duration: {
        instant: 0.12,
        fast: 0.18,
        state: 0.26,
        panel: 0.32,
        result: 0.52,
    },
    ease: {
        standard: [0.22, 1, 0.36, 1],
        enter: [0.16, 1, 0.3, 1],
        exit: [0.4, 0, 1, 1],
    },
    spring: {
        type: 'spring' as const,
        stiffness: 340,
        damping: 30,
        mass: 0.8,
    },
    bounceSpring: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 22,
    },
} as const;

export const STATE_ACCENT_COLORS = {
    INITIALIZING: '#6b7280',
    REQUESTING_CAMERA: '#6b7280',
    SEARCHING_FACE: '#6b7280',
    ALIGNING_FACE: '#f59e0b',
    CHECKING_QUALITY: '#06b6d4',
    READY: '#06b6d4',
    LIVENESS_CHALLENGE: '#a855f7',
    CAPTURING: '#3b82f6',
    VERIFYING_IDENTITY: '#3b82f6',
    SUCCESS: '#10b981',
    FAILED: '#ef4444',
} as const;
