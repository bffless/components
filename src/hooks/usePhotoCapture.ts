import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';

export interface UsePhotoCaptureOptions {
  /** Multipart upload endpoint. Default '/api/uploads/wall-photos'. */
  uploadEndpoint?: string;
  /** Camera countdown seconds before capture. Default 3. */
  countdownSeconds?: number;
  /** JPEG quality for in-browser captures (0..1). Default 0.9. */
  jpegQuality?: number;
}

export interface UsePhotoCaptureResult {
  // Current photo state
  photoUrl: string;
  photoPreview: string;
  uploading: boolean;
  // Camera state
  cameraOpen: boolean;
  cameraError: string;
  countdown: number | null;
  flashVisible: boolean;
  // Actions
  openCamera: () => Promise<void>;
  takePhoto: () => void;
  captureFrame: () => void;
  removePhoto: () => void;
  handlePhotoSelect: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  // Refs (consumer wires into JSX)
  fileInputRef: RefObject<HTMLInputElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Pure UI state for the camera + file-upload UX shared by every wall component.
 * Returns the photo URL (uploaded), an in-browser preview, and refs the consumer
 * wires into its `<input type="file">`, `<video>`, and `<canvas>` JSX.
 */
export function usePhotoCapture(opts?: UsePhotoCaptureOptions): UsePhotoCaptureResult {
  const uploadEndpoint = opts?.uploadEndpoint ?? '/api/uploads/wall-photos';
  const countdownSeconds = opts?.countdownSeconds ?? 3;
  const jpegQuality = opts?.jpegQuality ?? 0.9;

  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashVisible, setFlashVisible] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCameraError('');
    setCountdown(null);
  }, []);

  const uploadBlob = useCallback(
    async (blob: Blob, filename: string) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', blob, filename);
        const res = await fetch(uploadEndpoint, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const data: { url?: string } = await res.json();
        setPhotoUrl(data.url ?? '');
      } catch {
        setPhotoPreview('');
        setPhotoUrl('');
      } finally {
        setUploading(false);
      }
    },
    [uploadEndpoint],
  );

  const openCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError(
        'Could not access camera. Please allow camera permissions or use "Choose Photo" instead.',
      );
    }
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 200);
    canvas.toBlob(
      blob => {
        if (!blob) return;
        setPhotoPreview(URL.createObjectURL(blob));
        uploadBlob(blob, 'photobooth.jpg');
        stopCamera();
      },
      'image/jpeg',
      jpegQuality,
    );
  }, [jpegQuality, stopCamera, uploadBlob]);

  const takePhoto = useCallback(() => {
    setCountdown(countdownSeconds);
    let count = countdownSeconds;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        captureFrame();
      }
    }, 1000);
  }, [captureFrame, countdownSeconds]);

  const handlePhotoSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setPhotoPreview(URL.createObjectURL(file));
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(uploadEndpoint, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const data: { url?: string } = await res.json();
        setPhotoUrl(data.url ?? '');
      } catch {
        setPhotoPreview('');
        setPhotoUrl('');
      } finally {
        setUploading(false);
      }
    },
    [uploadEndpoint],
  );

  const removePhoto = useCallback(() => {
    setPhotoUrl('');
    setPhotoPreview('');
    stopCamera();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [stopCamera]);

  return {
    photoUrl,
    photoPreview,
    uploading,
    cameraOpen,
    cameraError,
    countdown,
    flashVisible,
    openCamera,
    takePhoto,
    captureFrame,
    removePhoto,
    handlePhotoSelect,
    fileInputRef,
    videoRef,
    canvasRef,
  };
}
