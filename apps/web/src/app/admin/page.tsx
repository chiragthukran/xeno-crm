'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle, RefreshCw, Trash2, Plus, X, Check } from 'lucide-react'

const JOB_TYPE_COLORS: Record<string, string> = {
  EMAIL_DISPATCH: 'bg-blue-100 border-blue-400 text-blue-800',
  WEBHOOK_SYNC:   'bg-yellow-100 border-yellow-400 text-yellow-800',
  SMS_DISPATCH:   'bg-purple-100 border-purple-400 text-purple-800',
}

export default function AdminPage() {
  const [dlq, setDlq]               = useState<any[]>([])
  const [suppression, setSuppression] = useState<any[]>([])
  const [freqCaps, setFreqCaps]      = useState<any[]>([])
  const [queueStats, setQueueStats]  = useState<any>(null)
  const [loading, setLoading]        = useState(true)

  // Add entry form state
  const [showAdd, setShowAdd]   = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newReason, setNewReason] = useState('manual_block')
  const [adding, setAdding]     = useState(false)

  // Search
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    // Load each independently so one failure doesn't block the rest
    await Promise.allSettled([
      api.dlq().then(setDlq).catch(() => {}),
      api.suppressionList().then(setSuppression).catch(() => {}),
      api.frequencyCaps().then(setFreqCaps).catch(() => {}),
      api.queueStats().then(setQueueStats).catch(() => {}),
    ])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const retryJob = async (id: string) => {
    await api.retryDlqJob(id).catch(() => {})
    setDlq(prev => prev.filter(j => j.id !== id))
  }

  const removeSuppression = async (id: string) => {
    await api.removeSuppression(id)
    setSuppression(prev => prev.filter(s => s.id !== id))
  }

  const addSuppression = async () => {
    if (!newEmail.trim()) return
    setAdding(true)
    try {
      await api.addSuppression({ email: newEmail.trim(), reason: newReason })
      const updated = await api.suppressionList()
      setSuppression(updated)
      setNewEmail('')
      setShowAdd(false)
    } catch {}
    setAdding(false)
  }

  const updateCap = async (channel: string, field: string, value: number) => {
    const cap = freqCaps.find(c => c.channel === channel)
    if (!cap) return
    await api.updateFreqCap({
      channel,
      maxMessagesPerCustomer: field === 'max' ? value : cap.maxMessagesPerCustomer,
      windowDays: field === 'days' ? value : cap.windowDays,
    })
    api.frequencyCaps().then(setFreqCaps).catch(() => {})
  }

  const filtered = suppression.filter(s =>
    !search || s.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-headline font-black text-4xl">SYSTEM ADMIN</h1>
        <p className="text-sm font-body border-2 border-black inline-block px-2 py-0.5 mt-1">Technical Transparency & Event Queue Management</p>
      </div>

      {/* Queue stats bar */}
      <div className="flex gap-4 mb-6">
        {queueStats ? [
          { label: 'Waiting', value: queueStats.waiting, color: 'bg-lime' },
          { label: 'Active',  value: queueStats.active,  color: 'bg-black text-white' },
          { label: 'Failed',  value: queueStats.failed,  color: 'bg-red-100' },
        ].map(s => (
          <div key={s.label} className={`border-3 border-black shadow-hard px-4 py-2 ${s.color}`}>
            <div className="text-xs font-headline font-bold uppercase">{s.label}</div>
            <div className="font-headline font-black text-xl">{s.value}</div>
          </div>
        )) : (
          <div className="text-sm font-body text-on-surface-muted">Loading queue stats...</div>
        )}
        <button onClick={load} className="border-2 border-black px-3 py-2 font-headline font-bold text-sm btn-press hover:bg-surface-low flex items-center gap-1.5 ml-auto">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* DLQ */}
        <div className="col-span-2 border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-5 py-3 flex items-center justify-between bg-black text-white">
            <div className="flex items-center gap-2 font-headline font-bold">
              <AlertTriangle size={16}/> Dead Letter Queue
            </div>
            <span className="bg-lime text-black border-2 border-lime text-xs font-bold px-2 py-0.5">{dlq.length} Items</span>
          </div>
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b-2 border-black bg-surface-low">
                <th className="text-left px-4 py-2 text-xs font-bold uppercase">Job ID</th>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase">Queue</th>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase">Error</th>
                <th className="text-center px-4 py-2 text-xs font-bold uppercase">Retries</th>
                <th className="text-center px-4 py-2 text-xs font-bold uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {dlq.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-on-surface-muted font-body">No failed jobs — queue is healthy ✓</td></tr>
              ) : dlq.map((job: any) => (
                <tr key={job.id} className="border-b border-outline/20">
                  <td className="px-4 py-2.5 font-mono text-xs">#EVT-{job.id.slice(0,4).toUpperCase()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`border px-1.5 py-0.5 text-xs font-bold ${JOB_TYPE_COLORS[job.queueName] ?? 'bg-surface-low border-black'}`}>
                      {job.queueName?.toUpperCase() ?? 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-red-700 font-medium text-xs truncate max-w-xs">{job.errorMessage}</td>
                  <td className="px-4 py-2.5 text-center">{job.retryCount} / 3</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => retryJob(job.id)} className="bg-lime border-2 border-black px-2 py-0.5 text-xs font-headline font-bold btn-press">
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Frequency caps */}
        <div className="border-3 border-black shadow-hard bg-black text-white">
          <div className="border-b-3 border-white px-4 py-3 font-headline font-bold">Frequency Caps</div>
          <div className="p-4 space-y-4">
            {freqCaps.length === 0 ? (
              <div className="text-sm text-white/50 font-body">Loading...</div>
            ) : freqCaps.map((cap: any) => (
              <div key={cap.channel}>
                <div className="text-xs font-headline font-bold uppercase mb-2 capitalize">{cap.channel}</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    defaultValue={cap.maxMessagesPerCustomer}
                    min={1} max={20}
                    onBlur={e => updateCap(cap.channel, 'max', Number(e.target.value))}
                    className="w-14 border-2 border-white bg-black text-white text-center font-headline font-black py-1 outline-none focus:border-lime"
                  />
                  <span className="text-sm text-white/70">msgs per</span>
                  <select
                    defaultValue={cap.windowDays === 7 ? 'Week' : 'Day'}
                    onChange={e => updateCap(cap.channel, 'days', e.target.value === 'Week' ? 7 : 1)}
                    className="border-2 border-white bg-black text-white px-2 py-1 text-sm font-body outline-none focus:border-lime"
                  >
                    <option>Day</option>
                    <option>Week</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Suppression list */}
      <div className="mt-6 border-3 border-black shadow-hard bg-white">
        <div className="border-b-3 border-black px-5 py-3 flex items-center justify-between">
          <span className="font-headline font-bold">
            Suppression List Manager
            <span className="ml-2 text-xs font-body font-normal text-on-surface-muted">({suppression.length} entries)</span>
          </span>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="border-2 border-black px-3 py-1 text-xs font-headline font-bold btn-press hover:bg-lime flex items-center gap-1 transition-colors"
          >
            {showAdd ? <X size={12}/> : <Plus size={12}/>}
            {showAdd ? 'Cancel' : 'Add Entry'}
          </button>
        </div>

        {/* Add entry form */}
        {showAdd && (
          <div className="border-b-3 border-black px-5 py-4 bg-surface-low flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-headline font-bold uppercase mb-1 block">Email address</label>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSuppression()}
                placeholder="e.g. user@example.com"
                className="w-full border-2 border-black px-3 py-2 text-sm font-body outline-none focus:shadow-hard"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-headline font-bold uppercase mb-1 block">Reason</label>
              <select
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                className="border-2 border-black px-3 py-2 text-sm font-body outline-none bg-white"
              >
                <option value="manual_block">Manual Block</option>
                <option value="hard_bounce">Hard Bounce</option>
                <option value="spam_complaint">Spam Complaint</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>
            </div>
            <button
              onClick={addSuppression}
              disabled={adding || !newEmail.trim()}
              className="bg-lime border-2 border-black px-4 py-2 text-sm font-headline font-bold btn-press disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check size={14}/> {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}

        <div className="p-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search suppressed emails..."
            className="w-full border-2 border-black px-3 py-2 text-sm font-body outline-none focus:shadow-hard mb-4"
          />

          {loading ? (
            <div className="text-sm font-body text-on-surface-muted py-4 text-center">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm font-body text-on-surface-muted py-4 text-center">
              {search ? 'No matches found.' : 'Suppression list is empty.'}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {filtered.map((s: any) => (
                <div key={s.id} className="border-2 border-black bg-surface-low p-3 flex items-start gap-2 min-w-52 group">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold break-all">{s.email}</div>
                    <div className="text-xs text-red-700 font-bold mt-0.5 capitalize">{s.reason?.replace(/_/g, ' ')}</div>
                  </div>
                  <button
                    onClick={() => removeSuppression(s.id)}
                    className="text-stone-400 hover:text-red-600 flex-shrink-0 transition-colors p-0.5 hover:bg-red-50 rounded"
                    title="Remove from suppression list"
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
