import { useEffect, useRef, useState } from 'react';

// A photo input that offers either a plain file picker (works everywhere,
// and on phones the `capture` attribute hints at opening the camera app
// directly) or a live in-page camera preview (getUserMedia) for laptops
// with a webcam, so people aren't stuck digging up a saved photo.
//
// onSelect(file: File | null) is called with the chosen/captured image.
export default function PhotoCapture({ onSelect, captureFacing = 'user' }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'camera' | 'preview'
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (mode === 'camera') startCamera();
    else stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not available in this browser. Upload a photo instead.');
      setMode('upload');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: captureFacing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError('Could not access your camera — check your browser permissions, or upload a photo instead.');
      setMode('upload');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setPreviewUrl(URL.createObjectURL(file));
      onSelect(file);
      setMode('preview');
    }, 'image/jpeg', 0.92);
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onSelect(file);
    setMode('preview');
  }

  function retake() {
    setPreviewUrl(null);
    onSelect(null);
    setMode('upload');
  }

  return (
    <div>
      {mode !== 'preview' && (
        <div className="flex gap-2 mb-2">
          <TabButton active={mode === 'upload'} onClick={() => setMode('upload')}>Upload a photo</TabButton>
          <TabButton active={mode === 'camera'} onClick={() => setMode('camera')}>Use camera</TabButton>
        </div>
      )}

      {error && <p className="text-xs text-coral-400 mb-2">{error}</p>}

      {mode === 'upload' && (
        <input
          className="input file:mr-3 file:btn-secondary file:!py-1 file:!px-3 file:border-0"
          type="file"
          accept="image/*"
          capture={captureFacing}
          onChange={onFile}
        />
      )}

      {mode === 'camera' && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-xl bg-black aspect-video object-cover"
          />
          <button type="button" onClick={capture} className="btn-primary w-full">
            Take photo
          </button>
        </div>
      )}

      {mode === 'preview' && previewUrl && (
        <div className="space-y-2">
          <img src={previewUrl} alt="Selected preview" className="w-full rounded-xl max-h-64 object-cover" />
          <button type="button" onClick={retake} className="btn-secondary w-full">
            Retake / choose another
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-secondary !py-1.5 !px-3 text-xs ${active ? 'ring-2 ring-violet-500/60' : ''}`}
    >
      {children}
    </button>
  );
}
