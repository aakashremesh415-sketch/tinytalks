import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { decryptBytes } from '../lib/crypto.js';

// Renders a self-destructing image message. Incoming images are fetched
// and decrypted client-side only when the recipient chooses to open them;
// the server never has the plaintext. TIMED_10S auto-hides after a 10
// second countdown, ONE_TIME hides itself the moment it's closed.
export default function ImageBubble({ message, keyPair, isMine }) {
  // History rows carry the image's current availability/viewed state (see
  // routes/images.js publicImage()) so an already-self-destructed image
  // renders as gone immediately, instead of showing "tap to view" and
  // then failing on fetch.
  const alreadyGone = message.image
    ? message.image.available === false || (message.image.viewMode === 'ONE_TIME' && message.image.viewedComplete && !isMine)
    : false;

  const [opened, setOpened] = useState(false);
  const [gone, setGone] = useState(alreadyGone);
  const [objectUrl, setObjectUrl] = useState(message.localPreviewUrl || null);
  const [countdown, setCountdown] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (objectUrl && !message.localPreviewUrl) URL.revokeObjectURL(objectUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open() {
    // Only skip the authenticated fetch when we already have a preview —
    // that's the sender's own just-sent image in the current tab. Reopening
    // history (no local preview, even for the sender) still fetches and
    // decrypts for real, which the server allows for the sender regardless
    // of view mode (see routes/images.js: only the recipient's view
    // consumes a ONE_TIME image).
    if (message.localPreviewUrl) {
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
      <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-slate-100 dark:bg-ink-800 text-slate-500 italic">
        This image has self-destructed.
      </div>
    );
  }

  return (
    <div className={`max-w-[75%] rounded-2xl overflow-hidden border ${isMine ? 'border-violet-500/30' : 'border-slate-200 dark:border-white/10'} bg-slate-100 dark:bg-ink-800`}>
      {!opened && (
        <button onClick={open} className="w-full flex flex-col items-center gap-2 px-6 py-8 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
          <span className="text-2xl">🔒</span>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {isMine ? 'Sent' : 'Tap to view'} · {message.viewMode === 'ONE_TIME' ? 'one-time view' : '10-second view'}
          </span>
        </button>
      )}
      {opened && objectUrl && (
        <div className="relative">
          <img src={objectUrl} alt="" className="max-h-80 w-full object-contain bg-black" />
          {countdown !== null && (
            <span className="absolute top-2 right-2 chip bg-black/60 border-slate-300 dark:border-white/20 text-white">{countdown}s</span>
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
