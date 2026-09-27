const RECORDING_MIME_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
];

function selectMimeType() {
    return RECORDING_MIME_TYPES.find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
    );
}

/**
 * Owns one user-media stream and an optional MediaRecorder session.
 * Capture is kept local until the caller explicitly submits it for verification.
 */
export class CameraRecorder {
    #videoElement;
    #stream = null;
    #recorder = null;
    #chunks = [];
    #recordingStopped = null;

    constructor(videoElement) {
        if (!(videoElement instanceof HTMLVideoElement)) {
            throw new TypeError('CameraRecorder requires a video element.');
        }

        this.#videoElement = videoElement;
    }

    get isPreviewing() {
        return this.#stream !== null;
    }

    get isRecording() {
        return this.#recorder?.state === 'recording';
    }

    async startPreview() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('This browser does not support camera access.');
        }

        if (this.#stream === null) {
            this.#stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: 'user',
                },
            });
            this.#videoElement.srcObject = this.#stream;
        }

        await this.#videoElement.play();
    }

    async startRecording() {
        await this.startPreview();

        if (this.isRecording) {
            throw new Error('A recording is already in progress.');
        }

        const mimeType = selectMimeType();
        const options = mimeType === undefined ? undefined : { mimeType };
        this.#chunks = [];
        this.#recorder = new MediaRecorder(this.#stream, options);
        this.#recordingStopped = new Promise((resolve, reject) => {
            this.#recorder.addEventListener('dataavailable', (event) => {
                if (event.data.size > 0) {
                    this.#chunks.push(event.data);
                }
            });
            this.#recorder.addEventListener(
                'stop',
                () => {
                    const actualMimeType =
                        this.#recorder?.mimeType || mimeType || 'video/webm';
                    resolve(new Blob(this.#chunks, { type: actualMimeType }));
                },
                { once: true },
            );
            this.#recorder.addEventListener(
                'error',
                (event) => {
                    reject(
                        event.error ??
                            new Error(
                                'The browser could not record the camera stream.',
                            ),
                    );
                },
                { once: true },
            );
        });
        this.#recorder.start();
    }

    async stopRecording() {
        if (this.#recorder === null || this.#recordingStopped === null) {
            throw new Error('No active recording is available to stop.');
        }

        if (this.#recorder.state !== 'inactive') {
            this.#recorder.stop();
        }

        return this.#recordingStopped;
    }

    async captureFrame() {
        if (!this.isPreviewing || this.#videoElement.videoWidth === 0) {
            throw new Error(
                'The camera preview is not ready for a still capture.',
            );
        }

        const canvas = document.createElement('canvas');
        canvas.width = this.#videoElement.videoWidth;
        canvas.height = this.#videoElement.videoHeight;
        const context = canvas.getContext('2d');
        if (context === null) {
            throw new Error('The browser could not prepare a still capture.');
        }

        context.drawImage(
            this.#videoElement,
            0,
            0,
            canvas.width,
            canvas.height,
        );
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob === null) {
                        reject(
                            new Error(
                                'The browser could not encode the still capture.',
                            ),
                        );
                        return;
                    }
                    resolve(blob);
                },
                'image/jpeg',
                0.92,
            );
        });
    }

    stopPreview() {
        this.#stream?.getTracks().forEach((track) => track.stop());
        this.#stream = null;
        this.#videoElement.srcObject = null;
    }
}
