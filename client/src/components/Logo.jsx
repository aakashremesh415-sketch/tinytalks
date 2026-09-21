export default function Logo({ withWordmark = true, size = 36 }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="tt-grad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff6b5b" />
            <stop offset="0.55" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="64" height="64" rx="16" fill="#11151f" />
        <path
          d="M46 14c8 0 14 6 14 13.5S54 41 46 41c-1.7 0-3.3-.3-4.8-.8l-6.2 3.6 1.2-6.2A13.2 13.2 0 0 1 32 27.5C32 20 38 14 46 14Z"
          fill="url(#tt-grad)"
          opacity="0.55"
        />
        <path
          d="M24 18c9.4 0 17 6.9 17 15.5S33.4 49 24 49c-2.1 0-4.1-.35-5.9-1L9 52l2.6-7.4A15.1 15.1 0 0 1 7 33.5C7 24.9 14.6 18 24 18Z"
          fill="url(#tt-grad)"
        />
        <circle cx="19" cy="33" r="2.6" fill="#0b0e14" />
        <circle cx="28.5" cy="33" r="2.6" fill="#0b0e14" />
      </svg>
      {withWordmark && (
        <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-slate-50">
          tinytalks<span className="text-violet-400 font-semibold">.live</span>
        </span>
      )}
    </div>
  );
}
