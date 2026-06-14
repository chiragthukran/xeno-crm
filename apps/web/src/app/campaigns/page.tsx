'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { ArrowRight, Play, Pause, X } from 'lucide-react'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  RUNNING:   'bg-lime border-black',
  COMPLETED: 'border-black bg-white',
  PAUSED:    'border-black bg-surface-low',
  DRAFT:     'border-black bg-surface-low',
  FAILED:    'border-red-500 bg-red-50 text-red-800',
  QUEUED:    'bg-lime border-black',
}

function FunnelRow({ stats }: { stats: any }) {
  if (!stats) return null
  const steps = [
    { label: 'SENT',      value: stats.sentCount },
    { label: 'DELIVERED', value: stats.deliveredCount },
    { label: 'OPENED',    value: stats.openedCount },
    { label: 'CLICKED',   value: stats.clickedCount },
    { label: 'PURCHASED', value: Math.floor(stats.clickedCount * 0.36), highlight: true },
  ]
  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className={`border-2 border-black px-3 py-1.5 text-center ${s.highlight ? 'bg-lime' : 'bg-surface-low'}`}>
            <div className="text-xs font-headline font-bold uppercase">{s.label}</div>
            <div className="font-black text-sm">{Number(s.value || 0).toLocaleString()}</div>
            {i > 0 && steps[i-1]?.value ? (
              <div className="text-xs text-on-surface-muted">
                {Math.round((s.value / steps[i-1]!.value) * 100)}%
              </div>
            ) : null}
          </div>
          {i < steps.length - 1 && <ArrowRight size={14} />}
        </div>
      ))}
    </div>
  )
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.campaigns().then(r => { setCampaigns(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = campaigns.filter(r => {
    const c = r.campaign
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false
    return true
  })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div className="bg-lime border-3 border-black shadow-hard px-6 py-4 inline-block">
          <h1 className="font-headline font-black text-5xl leading-none">ALL<br/>CAMPAIGNS</h1>
        </div>
        <Link href="/campaigns/new" className="bg-black text-white border-2 border-black px-4 py-2 font-headline font-bold btn-press shadow-hard">
          + NEW CAMPAIGN
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-6 mb-6 text-sm font-body">
        <div className="flex items-center gap-2">
          <span className="font-bold">STATUS</span>
          {['all', 'RUNNING', 'PAUSED', 'COMPLETED'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`border-2 border-black px-2 py-0.5 font-headline font-bold text-xs btn-press ${statusFilter === s ? 'bg-lime' : 'bg-white hover:bg-surface-low'}`}>
              {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">CHANNEL</span>
          {['all', 'Email', 'SMS', 'WhatsApp'].map(ch => (
            <button key={ch} onClick={() => setChannelFilter(ch === 'all' ? 'all' : ch.toLowerCase())}
              className={`border-2 border-black px-2 py-0.5 font-headline font-bold text-xs btn-press ${channelFilter === (ch === 'all' ? 'all' : ch.toLowerCase()) ? 'bg-lime' : 'bg-white hover:bg-surface-low'}`}>
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign rows */}
      <div className="space-y-3">
        {loading && <div className="text-center py-8 text-on-surface-muted font-body">Loading...</div>}
        {filtered.map((row: any) => {
          const c = row.campaign
          const s = row.stats
          const seg = row.segment
          const isExpanded = expanded === c.id

          return (
            <div key={c.id} className="border-3 border-black shadow-hard bg-white">
              <div className="flex items-center px-5 py-4 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-headline font-bold">{c.name}</span>
                    {c.createdBy === 'ai_agent' && (
                      <span className="bg-black text-white text-xs px-1.5 py-0.5 font-bold">AI</span>
                    )}
                  </div>
                  <div className="text-xs font-body text-on-surface-muted">ID: {c.id.slice(0, 8)} · Created {new Date(c.createdAt).toLocaleDateString()}</div>
                </div>
                <span className={`border-2 text-xs font-headline font-bold px-2 py-0.5 ${STATUS_COLORS[c.status] ?? 'border-black'}`}>
                  {c.status === 'RUNNING' ? '● ' : c.status === 'PAUSED' ? '❚❚ ' : ''}{c.status}
                </span>
                <span className="text-sm font-body capitalize w-20">{c.channel}</span>
                <span className="text-sm font-body w-24 text-right">{seg?.estimatedSize?.toLocaleString() ?? '—'}</span>
                <span className="text-sm font-bold w-20 text-right">
                  {s?.sentCount ? `${((s.deliveredCount / s.sentCount) * 100).toFixed(1)}%` : '—'}
                </span>
                <button onClick={() => setExpanded(isExpanded ? null : c.id)} className="ml-2 border-2 border-black p-1 hover:bg-surface-low">
                  {isExpanded ? <X size={14}/> : <ArrowRight size={14}/>}
                </button>
              </div>
              {isExpanded && (
                <div className="border-t-3 border-black px-5 py-4 bg-surface-low">
                  <FunnelRow stats={s} />
                  <div className="mt-3 flex gap-2">
                    <Link href={`/campaigns/${c.id}`} className="border-2 border-black px-3 py-1.5 text-xs font-headline font-bold btn-press hover:bg-white">
                      VIEW FULL REPORT
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
