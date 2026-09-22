import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { decryptBytes } from '../lib/crypto.js';

// Renders a voice-note message. Like ImageBubble, encrypted audio is fetched
// and decrypted client-side only when actually played — but unlike images
// there's no timed/one-time choice: the recipient's first listen
// unconditionally erases the note server-side, both the Blob and the
// VoiceNote row (see server/src/routes/voiceNotes.js), so this only ever
// shows "tap to play" once and then "played" forever after.
//
// Voice notes are single-device-only, the same as images (see the schema
// comment on VoiceNote) — and re-decrypting your OWN sent ciphertext has the
// same fundamental asymmetry images have (nacl.box needs the *recipient's*
// public key to reopen it, not your own, which is the only key stored
// per-message — see sentCache.js's header comment for the text-message
// version of this). So exactly like ImageBubble's `localPreviewUrl`, the
// sender's own just-recorded note is played straight from an in-memory
// object URL for this tab/session and never round-trips through the
// erase-on-listen endpoint at all; reopening it later from history (after a
// reload, with no local blob left) just shows "Sent", unable to replay —
// an accepted limitation, not a new one introduced here.
export default function VoiceNoteBubble({ message, keyPair, isMine, onConsumed }) {
  const stillAvailable = message.voiceNote !== null && message.voiceNote !== undefined;
  const voiceNoteId = message.voiceNote?.id;
  const durationSec = message.voiceNote?.durationSec;

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [gone, setGone] = useState(!stillAvailable && !message.localBlobUrl);
  const [error, setError] = useState(false);
  const audioRef = useRef(null);

  async function play() {
    if (gone || loading || playing) return;
    if (message.localBlobUrl) {
      if (audioRef.current) {
        audioRef.current.src = message.localBlobUrl;
        audioRef.current.play();
        setPlaying(true);
      }
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get(`/voice-notes/${voiceNoteId}/listen`, { responseType: 'arraybuffer' });
      const bytes = decryptBytes(new Uint8Array(data), message.nonce, message.senderPubKey, keyPair.secretKey);
      if (!bytes) throw new Error('decrypt failed');
      const url = URL.createObjectURL(new Blob([bytes]));
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setPlaying(true);
      }
      // Only the recipient's listen actually erases it server-side (see
      // routes/voiceNotes.js) — the sender re-fetching their own sent note
      // wouldn't consume it, but in practice the sender only ever gets here
      // via the localBlobUrl branch above (this tab, this session); a
      // sender reopening their own note from a page reload hits the same
      // decrypt asymmetry called out above and never reaches this line.
      if (!isMine) {
        setGone(true);
        onConsumed?.();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (gone) {
    return (
      <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm bg-slate-100 dark:bg-ink-800 text-slate-500 italic min-w-[10rem]">
        <span>🎧</span>
        <span>Voice note {isMine ? 'sent' : '— played'}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl px-3 py-2 bg-slate-100 dark:bg-ink-800 min-w-[11rem]">
      <button
        type="button"
        onClick={play}
        disabled={loading}
        className="h-9 w-9 shrink-0 rounded-full bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 disabled:opacity-60"
        title={isMine ? 'Play' : 'Tap to play — this erases it after you listen'}
      >
        {loading ? '…' : playing ? '❚❚' : '▶'}
      </button>
      <div className="flex-1 min-w-0 text-xs text-slate-500 dark:text-slate-400">
        {error ? 'Could not play — it may have expired.' : (
          <>
            🎤 Voice note{durationSec ? ` · ${durationSec}s` : ''}
            {!isMine && <span className="block">Erases after you listen</span>}
          </>
        )}
      </div>
      <audio ref={audioRef} hidden onEnded={() => setPlaying(false)} />
    </div>
  );
}
