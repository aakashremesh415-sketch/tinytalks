import { useEffect, useRef, useState } from 'react';

// A small built-in sticker pack — bigger, expressive single-glyph "cards"
// rather than inline-sized emoji, the way Telegram/WhatsApp stickers read
// at a glance in a thread. No image assets to host or license: each one is
// just a real Unicode emoji rendered large, with a short caption. Sent as
// its own message kind ('sticker') carrying just this id — see
// stickerById() below, used by MessageBubble to look the id back up.
export const STICKERS = [
  { id: 'wave', emoji: '👋', label: 'Hey!' },
  { id: 'love', emoji: '❤️', label: 'Love you' },
  { id: 'laugh', emoji: '🤣', label: 'LOL' },
  { id: 'thumbsup', emoji: '👍', label: 'Nice!' },
  { id: 'clap', emoji: '👏', label: 'Well done' },
  { id: 'party', emoji: '🥳', label: 'Congrats!' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'heart_eyes', emoji: '😍', label: 'Love it' },
  { id: 'cry', emoji: '😭', label: "I'm crying" },
  { id: 'shocked', emoji: '😱', label: 'No way!' },
  { id: 'sleepy', emoji: '😴', label: 'So tired' },
  { id: 'cool', emoji: '😎', label: 'Cool' },
  { id: 'thinking', emoji: '🤔', label: 'Hmm...' },
  { id: 'facepalm', emoji: '🤦', label: 'Facepalm' },
  { id: 'pray', emoji: '🙏', label: 'Please' },
  { id: 'ok', emoji: '👌', label: 'Perfect' },
  { id: 'rocket', emoji: '🚀', label: "Let's go" },
  { id: 'cake', emoji: '🎂', label: 'Happy birthday!' },
  { id: 'sorry', emoji: '🙇', label: 'Sorry' },
  { id: 'good_morning', emoji: '☀️', label: 'Good morning!' },
  { id: 'good_night', emoji: '🌙', label: 'Good night' },
  { id: 'miss_you', emoji: '🥹', label: 'Miss you' },
  { id: 'congrats', emoji: '🎉', label: 'Congratulations!' },
  { id: 'no', emoji: '🙅', label: 'No' },
  { id: 'yes', emoji: '🙆', label: 'Yes' },
  { id: 'heart_hands', emoji: '🫶', label: '<3' },
  { id: 'mind_blown', emoji: '🤯', label: 'Mind blown' },
  { id: 'eyes', emoji: '👀', label: 'Watching...' },
];

export function stickerById(id) {
  return STICKERS.find((s) => s.id === id) || null;
}

export default function StickerPicker({ onSelect }) {
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
        title="Send a sticker"
        aria-label="Send a sticker"
      >
        🏷️
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-20 w-72 max-h-80 overflow-y-auto card p-2 grid grid-cols-4 gap-1.5 shadow-xl">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s.id); setOpen(false); }}
              className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-white/10"
              title={s.label}
            >
              <span className="text-3xl leading-none">{s.emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
