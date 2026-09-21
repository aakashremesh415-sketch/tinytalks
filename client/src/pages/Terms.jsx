import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import termsRaw from '../content/terms.md?raw';

// Minimal, dependency-free markdown rendering — good enough for a
// single static legal document without pulling in a full markdown lib.
function renderMarkdown(md) {
  const lines = md.split('\n');
  const blocks = [];
  let list = [];

  function flushList() {
    if (list.length) {
      blocks.push(<ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1">{list}</ul>);
      list = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (line.startsWith('# ')) { flushList(); blocks.push(<h1 key={blocks.length} className="font-display text-2xl font-bold mt-2">{line.slice(2)}</h1>); }
    else if (line.startsWith('## ')) { flushList(); blocks.push(<h2 key={blocks.length} className="font-display text-lg font-bold mt-6">{line.slice(3)}</h2>); }
    else if (line.startsWith('- ')) { list.push(<li key={list.length} className="text-sm text-slate-300">{stripBold(line.slice(2))}</li>); }
    else if (line.startsWith('*') && line.endsWith('*')) { flushList(); blocks.push(<p key={blocks.length} className="text-xs text-slate-500 italic">{line.replaceAll('*', '')}</p>); }
    else { flushList(); blocks.push(<p key={blocks.length} className="text-sm text-slate-300 mt-2">{stripBold(line)}</p>); }
  }
  flushList();
  return blocks;
}

function stripBold(text) {
  const parts = text.split('**');
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="text-slate-100">{p}</strong> : p));
}

export default function Terms() {
  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
      </header>
      <main className="max-w-3xl mx-auto px-6 pb-20 card p-8">
        {renderMarkdown(termsRaw)}
      </main>
    </div>
  );
}
