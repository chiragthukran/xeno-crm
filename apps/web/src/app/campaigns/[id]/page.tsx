'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { ArrowRight } from 'lucide-react'

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])

  const loadData = useCallback(async () => {
    const [camp, evts] = await Promise.all([
      api.campaign(params.id),
      api.campaignEvents(params.id),
    ])
    setData(camp)
    setEvents(evts)
  }, [params.id])

  useEffect(() => {
    loadData()
    // Live event feed — poll every 3s while campaign is RUNNING
    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [loadData])

  if (!data) return <div className="p-8 font-body">Loading...</div>

  const c = data.campaign
  const s = data.stats

  const funnelSteps = [
    { label: 'SENT',      value: s?.sent_count ?? 0,      pct: null },
    { label: 'DELIVERED', value: s?.delivered_count ?? 0,  pct: s?.sent_count ? Math.round((s.delivered_count/s.sent_count)*100) : 0 },
    { label: 'OPENED',    value: s?.opened_count ?? 0,     pct: s?.delivered_count ? Math.round((s.opened_count/s.delivered_count)*100) : 0 },
    { label: 'CLICKED',   value: s?.clicked_count ?? 0,    pct: s?.opened_count ? Math.round((s.clicked_count/s.opened_count)*100) : 0 },
    { label: 'PURCHASED', value: Math.floor((s?.clicked_count ?? 0) * 0.36), pct: 36 },
  ]

  return (
    <div className="p-8">
      <div className="text-xs font-body text-on-surface-muted mb-2">CAMPAIGNS › {c.name.toUpperCase()}</div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-headline font-black text-3xl">{c.name}</h1>
        <span className="bg-lime border-2 border-black px-3 py-1 font-headline font-bold text-sm">{c.status}</span>
      </div>

      {/* Revenue hero */}
      <div className="bg-lime border-3 border-black shadow-hard p-8 mb-6 relative overflow-hidden">
        <div className="text-xs font-headline font-bold uppercase tracking-widest mb-2">Total Revenue Generated</div>
        <div className="font-headline font-black text-6xl">₹{Number(s?.revenue_generated ?? 0).toLocaleString()}</div>
        {s?.sent_count && s.revenue_generated > 0 ? (
          <div className="mt-2 border-2 border-black bg-white inline-flex items-center gap-1 px-3 py-1 text-sm font-bold">
            ↗ +24% vs. target
          </div>
        ) : null}
      </div>

      {/* Funnel */}
      <div className="border-3 border-black shadow-hard bg-white p-6 mb-6">
        <h2 className="font-headline font-bold text-lg mb-4">Funnel Performance</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {funnelSteps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-3">
              {i > 0 && step.pct !== null && (
                <div className="flex flex-col items-center">
                  <span className="bg-surface-low border border-black text-xs px-1 font-bold">{step.pct}%</span>
                  <ArrowRight size={18}/>
                </div>
              )}
              <div className={`border-3 border-black p-4 text-center ${i === 4 ? 'bg-lime' : 'bg-surface-low'}`}>
                <div className="text-xs font-headline font-bold uppercase">{step.label}</div>
                <div className="font-headline font-black text-xl">{step.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live event feed */}
      <div className="border-3 border-black shadow-hard bg-white">
        <div className="border-b-3 border-black px-5 py-3 flex items-center justify-between">
          <span className="font-headline font-bold">Live Event Feed</span>
          {c.status === 'RUNNING' && (
            <span className="flex items-center gap-1.5 text-xs font-body">
              <span className="w-2 h-2 bg-lime border border-black rounded-full animate-pulse"/>
              Live
            </span>
          )}
        </div>
        <div className="divide-y divide-outline/20 max-h-80 overflow-y-auto">
          {events.length === 0 ? (
            <div className="px-5 py-4 text-sm text-on-surface-muted font-body">No events yet. Events stream in as they occur.</div>
          ) : events.map((ev: any) => (
            <div key={ev.id} className="px-5 py-3 flex items-center gap-4 text-sm font-body">
              <span className={`border px-2 py-0.5 text-xs font-headline font-bold uppercase
                ${ev.event_type === 'clicked' ? 'bg-lime border-black' :
                  ev.event_type === 'delivered' ? 'bg-surface-low border-black' : 'border-black'}`}>
                {ev.event_type}
              </span>
              <span className="text-on-surface-muted text-xs">{ev.communication_id?.slice(0, 8)}</span>
              <span className="ml-auto text-xs text-on-surface-muted">
                {new Date(ev.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
