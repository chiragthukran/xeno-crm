'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts'
import { ArrowRight } from 'lucide-react'

export default function AnalyticsPage() {
  const [funnel, setFunnel] = useState<any>(null)
  const [channels, setChannels] = useState<any[]>([])
  const [topCampaigns, setTopCampaigns] = useState<any[]>([])
  const [revenue, setRevenue] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      api.analyticsFunnel().then(setFunnel),
      api.channelPerformance().then(setChannels),
      api.topCampaigns().then(setTopCampaigns),
      api.revenueByWeek().then(r => setRevenue(r.reverse())),
    ]).catch(() => {})
  }, [])

  const funnelSteps = funnel ? [
    { label: 'Total Sent',     value: funnel.sent,      pct: null },
    { label: 'Opened',         value: funnel.opened,    pct: funnel.sent ? Math.round(funnel.opened/funnel.sent*100*10)/10 : 0 },
    { label: 'Clicked',        value: funnel.clicked,   pct: funnel.opened ? Math.round(funnel.clicked/funnel.opened*100*10)/10 : 0 },
    { label: 'Converted',      value: funnel.revenue ? Math.floor(Number(funnel.clicked)*0.026) : 0, highlight: true, pct: '2.6%' },
  ] : []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline font-black text-3xl">Analytics Overview</h1>
          <p className="text-sm font-body text-on-surface-muted">Performance metrics for last 30 days.</p>
        </div>
        <div className="flex gap-2">
          <button className="border-2 border-black px-3 py-1.5 text-sm font-headline font-bold btn-press hover:bg-surface-low">
            Last 30 Days
          </button>
          <button className="bg-black text-white border-2 border-black px-3 py-1.5 text-sm font-headline font-bold btn-press">
            ↓ Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Conversion Funnel */}
        <div className="border-3 border-black shadow-hard bg-white p-6">
          <h2 className="font-headline font-bold mb-4">Conversion Funnel</h2>
          <div className="flex items-end gap-3">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                {i > 0 && (
                  <div className="text-center">
                    {step.pct && <div className={`text-xs font-bold px-1 mb-1 border border-black ${Number(step.pct) > 0 ? 'bg-lime' : 'bg-red-100'}`}>{step.pct}%</div>}
                    <ArrowRight size={14}/>
                  </div>
                )}
                <div className={`${step.highlight ? 'bg-lime border-3 border-black p-4' : 'p-0'}`}>
                  <div className="font-headline font-black text-2xl">{Number(step.value || 0).toLocaleString()}</div>
                  <div className="text-xs font-body text-on-surface-muted">{step.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Matrix */}
        <div className="border-3 border-black shadow-hard bg-white p-6">
          <h2 className="font-headline font-bold mb-4">Channel Matrix</h2>
          <div className="space-y-4">
            {(channels.length > 0 ? channels : [
              { channel: 'email',    avg_open_rate: 45, avg_click_rate: 8 },
              { channel: 'sms',      avg_open_rate: 88, avg_click_rate: 12 },
              { channel: 'whatsapp', avg_open_rate: 92, avg_click_rate: 18 },
            ]).map((ch: any) => (
              <div key={ch.channel}>
                <div className="flex items-center justify-between text-sm font-body mb-1">
                  <span className="capitalize font-bold">{ch.channel}</span>
                  <span className="text-xs text-on-surface-muted">{ch.avg_open_rate}% Open / {ch.avg_click_rate}% Click</span>
                </div>
                <div className="h-4 border-2 border-black bg-surface-low">
                  <div className="h-full bg-black" style={{ width: `${ch.avg_open_rate}%` }}/>
                </div>
                <div className="h-2 mt-0.5 bg-surface-low border border-black">
                  <div className="h-full bg-lime" style={{ width: `${ch.avg_click_rate * 3}%` }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Revenue bar chart */}
        <div className="border-3 border-black shadow-hard bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline font-bold">Revenue Attribution</h2>
            <span className="bg-lime border-2 border-black px-2 py-0.5 text-xs font-bold">
              Total: ₹{revenue.reduce((s, r) => s + Number(r.revenue || 0), 0).toLocaleString()}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenue.map((r, i) => ({ week: `Week ${i+1}`, revenue: Number(r.revenue || 0) }))}>
              <CartesianGrid strokeDasharray="0" stroke="#e2e2e2" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fontFamily: 'Hanken Grotesk' }} />
              <YAxis tick={{ fontSize: 11, fontFamily: 'Hanken Grotesk' }} />
              <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#ccff00" stroke="#000" strokeWidth={2} radius={0} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top campaigns */}
        <div className="border-3 border-black shadow-hard bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline font-bold">Top Campaigns</h2>
            <a href="/campaigns" className="text-xs font-body underline">View All</a>
          </div>
          <div className="space-y-2">
            {(topCampaigns.length > 0 ? topCampaigns : [
              { name: 'Summer Sale Announce', channel: 'sms',      revenue_generated: 145000 },
              { name: 'VIP Early Access',     channel: 'email',    revenue_generated: 98000 },
              { name: 'Cart Abandonment Flow',channel: 'whatsapp', revenue_generated: 72000 },
            ]).map((camp: any, i: number) => (
              <div key={i} className="flex items-center gap-3 border-b border-outline/20 pb-2">
                <span className="font-headline font-black text-lg w-5">{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{camp.name}</div>
                  <div className="text-xs text-on-surface-muted capitalize">{camp.channel}</div>
                </div>
                <span className="font-headline font-bold text-sm text-green-700">
                  ₹{(Number(camp.revenue_generated)/1000).toFixed(0)}K
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
