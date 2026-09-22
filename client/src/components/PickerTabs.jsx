import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { STICKERS } from './StickerPicker.jsx';

// Lazy-loaded once, shared with whichever tab needs it — same chunk-split
// trick EmojiPicker.jsx used to use on its own, just hoisted up here now
// that emoji is a tab instead of its own button.
let emojiDataPromise = null;
function loadEmojiData() {
  if (!emojiDataPromise) {
    emojiDataPromise = import('unicode-emoji-json/data-by-group.json').then((m) => m.default || m);
  }
  return emojiDataPromise;
}

const FALLBACK_QUICK = ['😀', '😂', '❤️', '👍', '🙏', '🔥', '🎉', '😢', '😮', '😎'];

const TABS = [
  { key: 'emoji', label: '😊', title: 'Emoji' },
  { key: 'sticker', label: '🏷️', title: 'Stickers' },
  { key: 'gif', label: 'GIF', title: 'GIFs' },
];

// One combined popover behind a single composer button, replacing the three
// separate always-visible emoji/sticker/GIF buttons — on a narrow phone
// screen those three plus the photo and (now) voice-note buttons left
// almost no room for the text input itself. Tab state always resets to
// 'emoji' on open; each tab keeps its own internal state (search text,
// loaded data) for as long as the popover stays open, so flipping between
// tabs doesn't lose a half-typed GIF search.
export default function PickerTabs({ onEmoji, onSticker, onGif }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('emoji');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function pickSticker(id) {
    onSticker(id);
    setOpen(false);
  }

  function pickGif(url) {
    onGif(url);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTab('emoji'); }}
        className="btn-secondary !px-3"
        title="Emoji, stickers & GIFs"
        aria-label="Emoji, stickers and GIFs"
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-20 w-80 max-h-96 card p-2 shadow-xl flex flex-col gap-2">
          <div className="flex gap-1 border-b border-slate-200 dark:border-white/10 pb-2 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                title={t.title}
                className={`flex-1 text-sm font-medium rounded-md py-1.5 transition-colors ${
                  tab === t.key
                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'emoji' && <EmojiTab onSelect={onEmoji} />}
          {tab === 'sticker' && <StickerTab onSelect={pickSticker} />}
          {tab === 'gif' && <GifTab onSelect={pickGif} />}
        </div>
      )}
    </div>
  );
}

function EmojiTab({ onSelect }) {
  const [groups, setGroups] = useState(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (groups) return;
    loadEmojiData()
      .then((data) => setGroups(Object.values(data)))
      .catch(() => setGroups([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = (() => {
    if (!groups) return [];
    const q = query.trim().toLowerCase();
    if (!q) return groups[activeGroup]?.emojis || [];
    return groups.flatMap((g) => g.emojis).filter((e) => e.name.includes(q) || e.slug.includes(q));
  })();

  function pick(emoji) {
    onSelect(emoji);
    setRecent((prev) => [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 10));
  }

  return (
    <>
      <input
        autoFocus
        className="input !py-1.5 text-sm shrink-0"
        placeholder="Search emoji…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!query && (
        <div className="flex flex-wrap gap-1 shrink-0">
          {groups
            ? groups.map((g, i) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => setActiveGroup(i)}
                  title={g.name}
                  className={`text-lg leading-none rounded-md px-2 py-1 ${activeGroup === i ? 'bg-violet-500/15' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}
                >
                  {g.emojis[0]?.emoji}
                </button>
              ))
            : <span className="text-xs text-slate-400 px-1 py-1">Loading emoji…</span>}
        </div>
      )}
      {!query && recent.length > 0 && (
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1 mb-1">Recently used</p>
          <div className="grid grid-cols-8 gap-1">
            {recent.map((e) => (
              <button key={`recent-${e}`} type="button" onClick={() => pick(e)} className="text-lg leading-none rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-white/10">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto grid grid-cols-8 gap-1 content-start">
        {!groups && FALLBACK_QUICK.map((e) => (
          <button key={e} type="button" onClick={() => pick(e)} className="text-lg leading-none rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-white/10">
            {e}
          </button>
        ))}
        {groups && filtered.length === 0 && (
          <p className="col-span-8 text-center text-xs text-slate-400 py-6">No matches</p>
        )}
        {groups && filtered.map((e) => (
          <button
            key={e.slug}
            type="button"
            onClick={() => pick(e.emoji)}
            title={e.name}
            className="text-lg leading-none rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            {e.emoji}
          </button>
        ))}
      </div>
    </>
  );
}

function StickerTab({ onSelect }) {
  return (
    <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-1.5 content-start">
      {STICKERS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10"
          title={s.label}
        >
          <span className="text-3xl leading-none">{s.emoji}</span>
        </button>
      ))}
    </div>
  );
}

function GifTab({ onSelect }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const delay = query.trim() ? 350 : 0;
    const handle = setTimeout(() => {
      // 10s client-side timeout too, on top of the server's own timeout on
      // its call out to Giphy — belt and suspenders so this tab can't get
      // stuck on "Loading…" no matter which leg of the round trip stalls.
      const req = query.trim()
        ? api.get('/gifs/search', { params: { q: query.trim() }, timeout: 10000 })
        : api.get('/gifs/trending', { timeout: 10000 });
      req
        .then(({ data }) => setGifs(data.gifs || []))
        .catch(() => setGifs([]))
        .finally(() => setLoading(false));
    }, delay);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <>
      <input
        className="input !py-1.5 text-sm shrink-0"
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
            onClick={() => onSelect(g.url)}
            className="rounded-lg overflow-hidden hover:ring-2 hover:ring-violet-500"
          >
            <img src={g.previewUrl} alt={g.title} className="w-full h-20 object-cover bg-slate-100 dark:bg-ink-800" loading="lazy" />
          </button>
        ))}
      </div>
    </>
  );
}
