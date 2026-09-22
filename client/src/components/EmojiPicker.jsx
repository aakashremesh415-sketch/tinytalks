import { useEffect, useRef, useState } from 'react';

// A small, dependency-free emoji picker — no external emoji-data package,
// just a curated grid of the emoji people actually reach for in chat.
// Click the 😊 button in the composer to open it; clicking an emoji inserts
// it into the draft and closes the popover.
const EMOJIS = [
  '😀', '😄', '😁', '😆', '🥹', '😂', '🤣', '🙂', '🙃', '😉',
  '😊', '😇', '🥰', '😍', '😘', '😋', '😛', '😜', '🤪', '🤗',
  '🤔', '🤨', '😐', '😏', '😴', '🥱', '😪', '😷', '🤒', '🥵',
  '🥶', '😳', '🥳', '😎', '🤓', '😕', '🙁', '😟', '😢', '😭',
  '😤', '😠', '😡', '🤯', '😱', '😨', '🥺', '😬', '🙄', '😅',
  '👍', '👎', '👌', '🤞', '👏', '🙌', '🙏', '👋', '✌️', '🤝',
  '💪', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔',
  '💯', '🔥', '✨', '🎉', '🎂', '🎁', '☕', '🍕', '🍺', '🌙',
  '☀️', '⭐', '👀', '💀', '👻', '🚀', '✅', '❌', '💤', '📷',
];

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

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
        <div className="absolute bottom-full mb-2 left-0 z-20 w-64 max-h-56 overflow-y-auto card p-2 grid grid-cols-8 gap-1 shadow-xl">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onSelect(e); setOpen(false); }}
              className="text-lg leading-none rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
