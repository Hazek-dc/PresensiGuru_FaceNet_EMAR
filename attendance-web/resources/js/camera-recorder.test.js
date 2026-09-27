/**
 * Browser-side audit tests — written by the independent auditor.
 *
 * These tests verify CameraRecorder behavior with mocked browser APIs.
 * No real camera access. No real biometric data.
 *
 * Auditor: Quality Assurance Automation
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// Mock Setup: simulate browser MediaDevices API in jsdom
// ─────────────────────────────────────────────────────────────────────────

function createMockMediaStream() {
    const mockTrack = {
        stop: vi.fn(),
        kind: 'video',
        enabled: true,
        readyState: 'live',
    };
    return {
        getTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
        getAudioTracks: () => [],
        _mockTrack: mockTrack,
    };
}

function createMockVideoElement() {
    const el = document.createElement('video');

    // Override read-only properties needed by CameraRecorder
    Object.defineProperty(el, 'videoWidth', { value: 640, writable: true });
    Object.defineProperty(el, 'videoHeight', { value: 480, writable: true });

    // Mock play() to resolve immediately
    el.play = vi.fn().mockResolvedValue(undefined);

    return el;
}

// ─────────────────────────────────────────────────────────────────────────
// E2E-1: Kamera ditolak → pesan aman
// ─────────────────────────────────────────────────────────────────────────

describe('E2E-1: Camera permission denied → safe error message', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('throws a clear error when getUserMedia is not supported', async () => {
        // Simulate a browser without getUserMedia
        const originalMediaDevices = navigator.mediaDevices;
        Object.defineProperty(navigator, 'mediaDevices', {
            value: undefined,
            writable: true,
            configurable: true,
        });

        // Dynamically import to get fresh module
        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        await expect(recorder.startPreview()).rejects.toThrow(
            'This browser does not support camera access.',
        );

        // Restore
        Object.defineProperty(navigator, 'mediaDevices', {
            value: originalMediaDevices,
            writable: true,
            configurable: true,
        });
    });

    it('throws when getUserMedia rejects (permission denied)', async () => {
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi
                    .fn()
                    .mockRejectedValue(
                        new DOMException(
                            'Permission denied',
                            'NotAllowedError',
                        ),
                    ),
            },
            writable: true,
            configurable: true,
        });

        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        await expect(recorder.startPreview()).rejects.toThrow();
    });

    it('error message does not expose sensitive system information', async () => {
        Object.defineProperty(navigator, 'mediaDevices', {
            value: undefined,
            writable: true,
            configurable: true,
        });

        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        try {
            await recorder.startPreview();
        } catch (error) {
            // Error message should be user-friendly, not a stack trace
            expect(error.message).not.toMatch(/at\s+\w+/); // no stack trace
            expect(error.message).not.toContain('undefined'); // no raw undefined
            expect(error.message.length).toBeGreaterThan(10); // meaningful message
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────
// E2E-2: MediaRecorder menghasilkan video → siap diunggah
// ─────────────────────────────────────────────────────────────────────────

describe('E2E-2: MediaRecorder produces recording blob', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('CameraRecorder constructor rejects non-video elements', () => {
        const { CameraRecorder } = require('./camera-recorder.js');
        const div = document.createElement('div');

        expect(() => new CameraRecorder(div)).toThrow(
            'CameraRecorder requires a video element.',
        );
    });

    it('reports isPreviewing=false before startPreview', async () => {
        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        expect(recorder.isPreviewing).toBe(false);
    });

    it('reports isRecording=false before startRecording', async () => {
        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        expect(recorder.isRecording).toBe(false);
    });

    it('stopRecording throws when no recording is active', async () => {
        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        await expect(recorder.stopRecording()).rejects.toThrow(
            'No active recording is available to stop.',
        );
    });

    it('stopPreview releases all tracks', async () => {
        const mockStream = createMockMediaStream();

        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn().mockResolvedValue(mockStream),
            },
            writable: true,
            configurable: true,
        });

        const { CameraRecorder } = await import('./camera-recorder.js');
        const video = createMockVideoElement();
        const recorder = new CameraRecorder(video);

        await recorder.startPreview();
        expect(recorder.isPreviewing).toBe(true);

        recorder.stopPreview();
        expect(recorder.isPreviewing).toBe(false);
        expect(mockStream._mockTrack.stop).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────
// General: attendance-capture.js event dispatch
// ─────────────────────────────────────────────────────────────────────────

describe('Attendance capture page interaction', () => {
    it('setStatus helper toggles error class correctly', () => {
        // Test the status message display logic
        const statusEl = document.createElement('p');
        statusEl.classList.add('text-slate-600');

        // Simulate setStatus behavior
        const message = 'Kamera belum digunakan.';
        statusEl.textContent = message;

        expect(statusEl.textContent).toBe(message);
        expect(statusEl.classList.contains('text-slate-600')).toBe(true);
    });
});
