import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { decryptBytes } from '../lib/crypto.js';

// Renders a self-destructing image message. Incoming images are fetched
// and decrypted client-side only when the recipient chooses to open them;
// the server never has the plaintext. TIMED_10S auto-hides after a 10
// second countdown, ONE_TIME hides itself the moment it's closed.
export default function ImageBubble({ message, keyPair, isMine }) {
  const [opened, setOpened] = useState(false);
  const [gone, setGone] = useState(false);
  const [objectUrl, setObjectUrl] = useState(message.localPreviewUrl || null);
  const [countdown, setCountdown] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (objectUrl && !message.localPreviewUrl) URL.revokeObjectURL(objectUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open() {
    if (isMine) {
      setOpened(true);
      return;
    }
    try {
      const { data } = await api.get(`/images/${message.imageId}/view`, { responseType: 'arraybuffer' });
      const bytes = decryptBytes(new Uint8Array(data), message.nonce, message.senderPubKey, keyPair.secretKey);
      if (!bytes) throw new Error('decrypt failed');
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
      setOpened(true);

      if (message.viewMode === 'TIMED_10S') {
        let remaining = 10;
        setCountdown(remaining);
        timerRef.current = setInterval(() => {
          remaining -= 1;
          setCountdown(remaining);
          if (remaining <= 0) {
            clearInterval(timerRef.current);
            closeAndDestroy(url);
          }
        }, 1000);
      }
    } catch {
      setGone(true);
    }
  }

  function closeAndDestroy(url) {
    URL.revokeObjectURL(url || objectUrl);
    setObjectUrl(null);
    setOpened(false);
    setGone(true);
  }

  if (gone) {
    return (
      <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-ink-800 text-slate-500 italic">
        This image has self-destructed.
      </div>
    );
  }

  return (
    <div className={`max-w-[75%] rounded-2xl overflow-hidden border ${isMine ? 'border-violet-500/30' : 'border-white/10'} bg-ink-800`}>
      {!opened && (
        <button onClick={open} className="w-full flex flex-col items-center gap-2 px-6 py-8 hover:bg-white/5 transition-colors">
          <span className="text-2xl">🔒</span>
          <span className="text-sm text-slate-300">
            {isMine ? 'Sent' : 'Tap to view'} · {message.viewMode === 'ONE_TIME' ? 'one-time view' : '10-second view'}
          </span>
        </button>
      )}
      {opened && objectUrl && (
        <div className="relative">
          <img src={objectUrl} alt="" className="max-h-80 w-full object-contain bg-black" />
          {countdown !== null && (
            <span className="absolute top-2 right-2 chip bg-black/60 border-white/20 text-white">{countdown}s</span>
          )}
          {message.viewMode === 'ONE_TIME' && !isMine && (
            <button
              onClick={() => closeAndDestroy(objectUrl)}
              className="absolute bottom-2 right-2 btn-secondary !py-1 !px-3 text-xs"
            >
              Close &amp; destroy
            </button>
          )}
        </div>
      )}
    </div>
  );
}
