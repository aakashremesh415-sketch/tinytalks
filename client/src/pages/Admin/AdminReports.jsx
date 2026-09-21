import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

const STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'];

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');

  async function load() {
    const { data } = await api.get('/admin/reports', { params: { status: statusFilter || undefined } });
    setReports(data.reports);
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function updateStatus(id, status) {
    await api.patch(`/admin/reports/${id}`, { status, resolutionNote: note || undefined });
    setSelected(null);
    setNote('');
    load();
  }

  async function banReportedUser(report) {
    if (!confirm(`Ban ${report.reportedUser.displayName || report.reportedUser.email || 'this user'}?`)) return;
    await api.post(`/admin/users/${report.reportedUserId}/ban`, {
      reason: `Report: ${report.category}`,
      category: report.category,
    });
    updateStatus(report.id, 'RESOLVED');
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Reports &amp; tickets</h1>
        <select className="input max-w-[10rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="mt-6 space-y-3">
        {reports.map((r) => (
          <div key={r.id} className={`card p-4 ${r.category === 'UNDERAGE_SUSPICION' ? 'ring-1 ring-coral-500/60' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">{new Date(r.createdAt).toLocaleString()}</p>
                <p className="font-medium mt-1">{r.category.replaceAll('_', ' ')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Reported: <strong className="text-slate-700 dark:text-slate-200">{r.reportedUser.displayName || r.reportedUser.email || r.reportedUser.id}</strong>
                  {' '}by {r.reporter.displayName || r.reporter.email || r.reporter.id}
                </p>
                {r.description && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">"{r.description}"</p>}
                <span className="chip mt-2 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">{r.status}</span>
                {r.reportedUser.banned && <span className="chip mt-2 ml-2 bg-coral-500/10 border-coral-500/30 text-coral-400">Already banned</span>}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => setSelected(selected === r.id ? null : r.id)}>
                  {selected === r.id ? 'Close' : 'Update'}
                </button>
                {!r.reportedUser.banned && (
                  <button className="btn-secondary !py-1 !px-3 text-xs border-coral-500/40 text-coral-400" onClick={() => banReportedUser(r)}>
                    Ban user
                  </button>
                )}
              </div>
            </div>

            {selected === r.id && (
              <div className="mt-4 border-t border-slate-200 dark:border-white/5 pt-4 space-y-2">
                <textarea className="input h-20 resize-none" placeholder="Resolution note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  {STATUSES.map((s) => (
                    <button key={s} className="btn-secondary !py-1 !px-3 text-xs" onClick={() => updateStatus(r.id, s)}>
                      Mark {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {reports.length === 0 && <p className="text-slate-500 text-sm">No reports match this filter.</p>}
      </div>
    </div>
  );
}
