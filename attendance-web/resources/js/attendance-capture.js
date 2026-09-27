import { CameraRecorder } from './camera-recorder';

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('text-red-700', isError);
    element.classList.toggle('text-slate-600', !isError);
}

async function initialiseCapturePage(root) {
    const video = root.querySelector('[data-camera-preview]');
    const startButton = root.querySelector('[data-start-recording]');
    const stopButton = root.querySelector('[data-stop-recording]');
    const status = root.querySelector('[data-capture-status]');
    const preview = root.querySelector('[data-recording-preview]');
    const recorder = new CameraRecorder(video);

    startButton.addEventListener('click', async () => {
        try {
            await recorder.startRecording();
            startButton.disabled = true;
            stopButton.disabled = false;
            setStatus(status, 'Perekaman liveness sedang berlangsung.');
        } catch (error) {
            setStatus(status, error.message, true);
        }
    });

    stopButton.addEventListener('click', async () => {
        try {
            const [recording, still] = await Promise.all([
                recorder.stopRecording(),
                recorder.captureFrame(),
            ]);
            const recordingUrl = URL.createObjectURL(recording);
            preview.src = recordingUrl;
            preview.hidden = false;
            startButton.disabled = false;
            stopButton.disabled = true;
            setStatus(
                status,
                'Capture siap untuk dikirim ke layanan verifikasi.',
            );

            root.dispatchEvent(
                new CustomEvent('attendance:capture-ready', {
                    bubbles: true,
                    detail: { recording, still },
                }),
            );
        } catch (error) {
            setStatus(status, error.message, true);
        }
    });

    window.addEventListener('beforeunload', () => recorder.stopPreview(), {
        once: true,
    });
}

document.querySelectorAll('[data-attendance-capture]').forEach((root) => {
    initialiseCapturePage(root).catch((error) => {
        const status = root.querySelector('[data-capture-status]');
        setStatus(status, error.message, true);
    });
});
