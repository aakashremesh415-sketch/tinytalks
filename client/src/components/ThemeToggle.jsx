import { useTheme } from '../lib/theme.jsx';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full border
        border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200
        dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10
        transition-colors ${className}`}
    >
      <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}
