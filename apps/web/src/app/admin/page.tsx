'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { AlertTriangle, RefreshCw, Trash2, Plus } from 'lucide-react'

const JOB_TYPE_COLORS: Record<string, string> = {
  EMAIL_DISPATCH:   'bg-blue-100 border-blue-400 text-blue-800',
  WEBHOOK_SYNC:     'bg-yellow-100 border-yellow-400 text-yellow-800',
  SMS_DISPATCH:     'bg-purple-100 border-purple-400 text-purple-800',
}

export default function AdminPage() {
  const [dlq, setDlq] = useState<any[]>([])
  const [suppression, setSuppression] = useState<any[]>([])
  const [freqCaps, setFreqCaps] = useState<any[]>([])
  const [queueStats, setQueueStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    await Promise.all([
      api.dlq().then(setDlq),
      api.suppressionList().then(setSuppression),
      api.frequencyCaps().then(setFreqCaps),
      api.queueStats().then(setQueueStats),
    ]).catch(() => {})
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const retryJob = async (id: string) => {
    await api.retryDlqJob(id)
    setDlq(prev => prev.filter(j => j.id !== id))
  }

  const removeSuppression = async (id: string) => {
    await api.removeSuppression(id)
    setSuppression(prev => prev.filter(s => s.id !== id))
  }

  const updateCap = async (channel: string, field: string, value: number) => {
    const cap = freqCaps.find(c => c.channel === channel)
    if (!cap) return
    await api.updateFreqCap({ channel, maxMessagesPerCustomer: field === 'max' ? value : cap.max_messages_per_customer, windowDays: field === 'days' ? value : cap.window_days })
    api.frequencyCaps().then(setFreqCaps)
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-headline font-black text-4xl">SYSTEM ADMIN</h1>
        <p className="text-sm font-body border-2 border-black inline-block px-2 py-0.5 mt-1">Technical Transparency & Event Queue Management</p>
      </div>

      {/* Queue stats bar */}
      {queueStats && (
        <div className="flex gap-4 mb-6">
          {[
            { label: 'Waiting', value: queueStats.waiting, color: 'bg-lime' },
            { label: 'Active',  value: queueStats.active,  color: 'bg-black text-white' },
            { label: 'Failed',  value: queueStats.failed,  color: 'bg-red-100' },
          ].map(s => (
            <div key={s.label} className={`border-3 border-black shadow-hard px-4 py-2 ${s.color}`}>
              <div className="text-xs font-headline font-bold uppercase">{s.label}</div>
              <div className="font-headline font-black text-xl">{s.value}</div>
            </div>
          ))}
          <button onClick={load} className="border-2 border-black px-3 py-2 font-headline font-bold text-sm btn-press hover:bg-surface-low flex items-center gap-1.5">
            <RefreshCw size={14}/> Refresh Sync
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* DLQ */}
        <div className="col-span-2 border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-5 py-3 flex items-center justify-between bg-black text-white">
            <div className="flex items-center gap-2 font-headline font-bold">
              <AlertTriangle size={16}/> Dead Letter Queue (Failed Jobs)
            </div>
            <span className="bg-lime text-black border-2 border-lime text-xs font-bold px-2 py-0.5">{dlq.length} Items</span>
          </div>
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b-2 border-black bg-surface-low">
                <th className="text-left px-4 py-2 text-xs font-bold uppercase">Job ID</th>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase">Type</th>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase">Error Message</th>
                <th className="text-center px-4 py-2 text-xs font-bold uppercase">Retries</th>
                <th className="text-center px-4 py-2 text-xs font-bold uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {dlq.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-on-surface-muted">No failed jobs — queue is healthy</td></tr>
              )}
              {dlq.map((job: any) => (
                <tr key={job.id} className="border-b border-outline/20">
                  <td className="px-4 py-2.5 font-mono text-xs">#EVT-{job.id.slice(0,4).toUpperCase()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`border px-1.5 py-0.5 text-xs font-bold ${JOB_TYPE_COLORS[job.queue_name] ?? 'bg-surface-low border-black'}`}>
                      {job.queue_name?.toUpperCase() ?? 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-red-700 font-medium text-xs">{job.error_message}</td>
                  <td className="px-4 py-2.5 text-center">{job.retry_count} / 3</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => retryJob(job.id)} className="bg-lime border-2 border-black px-2 py-0.5 text-xs font-headline font-bold btn-press">
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-outline/20 flex justify-between text-xs font-body text-on-surface-muted">
            <span>Showing {Math.min(dlq.length, 12)} of {dlq.length} failed jobs</span>
            <button className="underline">View All Logs</button>
          </div>
        </div>

        {/* Frequency caps */}
        <div className="border-3 border-black shadow-hard bg-black text-white">
          <div className="border-b-3 border-white px-4 py-3 font-headline font-bold">Frequency Caps</div>
          <div className="p-4 space-y-4">
            {freqCaps.map((cap: any) => (
              <div key={cap.channel}>
                <div className="text-xs font-headline font-bold uppercase mb-1 capitalize">Global {cap.channel} Limit</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    defaultValue={cap.max_messages_per_customer}
                    min={1} max={10}
                    onBlur={e => updateCap(cap.channel, 'max', Number(e.target.value))}
                    className="w-16 border-2 border-white bg-black text-white text-center font-headline font-black py-1 outline-none"
                  />
                  <span className="text-sm">per</span>
                  <select
                    defaultValue={cap.window_days === 7 ? 'Week' : 'Day'}
                    onChange={e => updateCap(cap.channel, 'days', e.target.value === 'Week' ? 7 : 1)}
                    className="border-2 border-white bg-black text-white px-2 py-1 text-sm font-body outline-none"
                  >
                    <option>Day</option>
                    <option>Week</option>
                  </select>
                </div>
              </div>
            ))}
            <button className="w-full bg-lime text-black border-2 border-lime py-2 font-headline font-bold text-sm btn-press mt-2">
              Save Rules
            </button>
          </div>
        </div>
      </div>

      {/* Suppression list */}
      <div className="mt-6 border-3 border-black shadow-hard bg-white">
        <div className="border-b-3 border-black px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-headline font-bold">
            Suppression List Manager
          </div>
          <button className="border-2 border-black px-3 py-1 text-xs font-headline font-bold btn-press hover:bg-surface-low flex items-center gap-1">
            <Plus size={12}/> Add Entry
          </button>
        </div>
        <div className="p-4">
          <input placeholder="Search suppressed emails or domains..." className="w-full border-2 border-black px-3 py-2 text-sm font-body outline-none focus:shadow-hard mb-4"/>
          <div className="flex flex-wrap gap-3">
            {(suppression.length > 0 ? suppression : [
              { id: '1', email: 'user@bounced-domain.com', reason: 'Hard Bounce' },
              { id: '2', email: 'spam.trap@isp.net',        reason: 'Manual Block' },
              { id: '3', email: 'complaint@angry-user.com', reason: 'Spam Complaint' },
            ]).map((s: any) => (
              <div key={s.id} className="border-2 border-black bg-surface-low p-3 flex items-start gap-2 min-w-48">
                <div className="flex-1">
                  <div className="text-sm font-bold break-all">{s.email}</div>
                  <div className="text-xs text-red-700 font-bold mt-0.5 capitalize">{s.reason?.replace('_', ' ')}</div>
                </div>
                <button onClick={() => removeSuppression(s.id)} className="text-red-500 hover:text-red-700 flex-shrink-0">
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
