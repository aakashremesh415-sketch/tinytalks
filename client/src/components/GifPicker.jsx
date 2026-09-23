import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// GIF search, proxied through server/src/routes/gifs.js (which holds the
// Giphy API key server-side) so the key never ships to the browser. The
// GIF itself is sent as its Giphy CDN URL, stored as plain text the same
// way a text message is (see Chat.jsx's sendGif) — it just happens to be
// a URL this time instead of a sentence.
export default function GifPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setLoading(true);
    const delay = query.trim() ? 350 : 0; // debounce typing, but load trending instantly on open
    const handle = setTimeout(() => {
      const req = query.trim()
        ? api.get('/gifs/search', { params: { q: query.trim() } })
        : api.get('/gifs/trending');
      req
        .then(({ data }) => setGifs(data.gifs || []))
        .catch(() => setGifs([]))
        .finally(() => setLoading(false));
    }, delay);
    return () => clearTimeout(handle);
  }, [open, query]);

  function pick(gif) {
    onSelect(gif.url);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary !px-3 text-xs font-semibold"
        title="Send a GIF"
        aria-label="Send a GIF"
      >
        GIF
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-20 w-72 max-h-80 card p-2 shadow-xl flex flex-col gap-2">
          <input
            autoFocus
            className="input !py-1.5 text-sm"
            placeholder="Search GIFs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1.5 min-h-[8rem]">
            {loading && <p className="col-span-2 text-center text-xs text-slate-400 py-6">Loading…</p>}
            {!loading && gifs.length === 0 && (
              <p className="col-span-2 text-center text-xs text-slate-400 py-6">No GIFs found</p>
            )}
            {!loading && gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => pick(g)}
                className="rounded-lg overflow-hidden hover:ring-2 hover:ring-violet-500"
              >
                <img src={g.previewUrl} alt={g.title} className="w-full h-20 object-cover bg-slate-100 dark:bg-ink-800" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
