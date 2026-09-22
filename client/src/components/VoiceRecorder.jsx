import { useRef, useState } from 'react';

// A deliberately simple record button — tap to start, tap the stop square to
// send, or ✕ to discard. No waveform, no pause/resume, no scrubbing: this is
// a stranger-chat app sending short voice notes, not a voice-memo editor.
// MediaRecorder's default mimeType (webm/opus in Chrome/Firefox, mp4/aac in
// Safari) is left to the browser — the bytes are opaque ciphertext to the
// server either way (see Chat.jsx's sendVoiceNote), and playback only ever
// happens through the same browser that recorded it or another modern one.
export default function VoiceRecorder({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  async function start() {
    if (disabled || recording || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      window.alert("This browser doesn't support recording audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (cancelledRef.current || chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        setBusy(true);
        Promise.resolve(onRecorded(blob, durationSec)).finally(() => setBusy(false));
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
    } catch {
      window.alert('Microphone access is needed to record a voice note.');
    }
  }

  function stopAndSend() {
    recorderRef.current?.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  }

  if (recording) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={stopAndSend}
          className="btn-secondary !px-3 text-coral-500 animate-pulse"
          title="Stop and send"
          aria-label="Stop recording and send"
        >
          ⏹
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-slate-400 hover:text-coral-500 text-sm px-1"
          title="Discard recording"
          aria-label="Discard recording"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || busy}
      className="btn-secondary !px-3"
      title="Record a voice note"
      aria-label="Record a voice note"
    >
      {busy ? '…' : '🎤'}
    </button>
  );
}
