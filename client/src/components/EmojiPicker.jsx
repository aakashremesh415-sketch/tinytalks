import { useEffect, useMemo, useRef, useState } from 'react';

// The full standard emoji set (~1,900, every category from Unicode's own
// grouping) via unicode-emoji-json — dynamically imported only once this
// picker is actually opened, so its ~400KB of data ships as its own chunk
// and never touches the initial page load. A tiny "recently used" strip
// (kept in memory only, not persisted) surfaces whatever you reach for most
// without digging through nine categories every time.
let dataPromise = null;
function loadEmojiData() {
  if (!dataPromise) {
    dataPromise = import('unicode-emoji-json/data-by-group.json').then((m) => m.default || m);
  }
  return dataPromise;
}

const FALLBACK_QUICK = ['😀', '😂', '❤️', '👍', '🙏', '🔥', '🎉', '😢', '😮', '😎'];

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(null); // array of {name, slug, emojis}
  const [activeGroup, setActiveGroup] = useState(0);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState([]);
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
    if (!open || groups) return;
    loadEmojiData()
      .then((data) => setGroups(Object.values(data)))
      .catch(() => setGroups([])); // offline/CDN hiccup — picker still opens, just empty
  }, [open, groups]);

  const filtered = useMemo(() => {
    if (!groups) return [];
    const q = query.trim().toLowerCase();
    if (!q) return groups[activeGroup]?.emojis || [];
    return groups.flatMap((g) => g.emojis).filter((e) => e.name.includes(q) || e.slug.includes(q));
  }, [groups, activeGroup, query]);

  function pick(emoji) {
    onSelect(emoji);
    setRecent((prev) => [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 10));
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-secondary !px-3"
        title="Insert emoji"
        aria-label="Insert emoji"
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-20 w-80 max-h-96 card p-2 shadow-xl flex flex-col gap-2">
          <input
            autoFocus
            className="input !py-1.5 text-sm"
            placeholder="Search emoji…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {!query && (
            <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-white/10 pb-2">
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
            <div>
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
        </div>
      )}
    </div>
  );
}
