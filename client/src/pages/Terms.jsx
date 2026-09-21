import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import termsRaw from '../content/terms.md?raw';

// Minimal, dependency-free markdown rendering — good enough for a single
// static legal document without pulling in a full markdown lib. Works on
// whole blank-line-separated blocks (like real markdown) rather than
// line-by-line, so a list item or paragraph that's hard-wrapped across
// multiple source lines renders as one continuous item/paragraph instead
// of fracturing into a new list/paragraph at every line break.
function renderMarkdown(md) {
  const blocks = md.trim().split(/\n\s*\n+/);

  return blocks.map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    const first = lines[0];

    if (first.startsWith('# ')) {
      return <h1 key={i} className="font-display text-2xl font-bold mt-2">{first.slice(2)}</h1>;
    }
    if (first.startsWith('## ')) {
      return <h2 key={i} className="font-display text-lg font-bold mt-6">{first.slice(3)}</h2>;
    }
    if (first.startsWith('*') && first.endsWith('*') && lines.length === 1) {
      return <p key={i} className="text-xs text-slate-500 italic">{first.replaceAll('*', '')}</p>;
    }
    if (first.startsWith('- ')) {
      // Join each bullet's own wrapped continuation lines back into one
      // item before splitting on the next "- ".
      const items = [];
      for (const line of lines) {
        if (line.startsWith('- ')) items.push(line.slice(2));
        else items[items.length - 1] += ' ' + line;
      }
      return (
        <ul key={i} className="list-disc pl-5 space-y-1.5 mt-2">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-slate-600 dark:text-slate-300">{stripBold(item)}</li>
          ))}
        </ul>
      );
    }
    return <p key={i} className="text-sm text-slate-600 dark:text-slate-300 mt-2">{stripBold(lines.join(' '))}</p>;
  });
}

function stripBold(text) {
  const parts = text.split('**');
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="text-slate-900 dark:text-slate-100">{p}</strong> : p));
}

export default function Terms() {
  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <ThemeToggle />
      </header>
      <main className="max-w-3xl mx-auto px-6 pb-20 card p-8">
        {renderMarkdown(termsRaw)}
      </main>
    </div>
  );
}
