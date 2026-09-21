import { useState } from 'react';

// Generic chip-style tag editor — used for both self-reported location
// tags (town/district/state) and general interests. Purely self-reported;
// this app never collects IP or GPS location.
export default function LocationTags({
  tags,
  onChange,
  disabled,
  placeholder = 'Add a town, district or state…',
  emptyLabel = "No location tags yet — you'll match with anyone, anywhere.",
}) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    const lower = value.toLowerCase();
    if (tags.some((t) => t.toLowerCase() === lower)) { setDraft(''); return; }
    if (tags.length >= 8) { setDraft(''); return; }
    onChange([...tags, value]);
    setDraft('');
  }

  function removeTag(index) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="chip bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 flex items-center gap-1.5 !py-1"
          >
            {t}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="text-slate-400 hover:text-coral-400 leading-none"
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {emptyLabel}
          </span>
        )}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            className="input flex-1 !py-1.5 text-sm"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(); }
            }}
          />
          <button type="button" className="btn-secondary !py-1.5 !px-3 text-sm shrink-0" onClick={addTag}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
