import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/admin/summary').then(({ data }) => setSummary(data));
  }, []);

  const cards = [
    { label: 'Pending gender verifications', value: summary?.pendingVerifications, tone: 'violet' },
    { label: 'Open reports', value: summary?.openReports, tone: 'coral' },
    { label: 'Underage-suspicion reports', value: summary?.underageReports, tone: 'coral', urgent: true },
    { label: 'Banned users', value: summary?.bannedUsers, tone: 'mint' },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">Overview of what needs attention.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {cards.map((c) => (
          <div key={c.label} className={`card p-5 ${c.urgent && c.value > 0 ? 'ring-1 ring-coral-500/50' : ''}`}>
            <p className="text-sm text-slate-500 dark:text-slate-400">{c.label}</p>
            <p className="font-display text-3xl font-bold mt-2">{c.value ?? '–'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
