'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Zap, Bot, ArrowRight } from 'lucide-react'
import Link from 'next/link'

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`border-3 border-black shadow-hard p-5 ${highlight ? 'bg-lime' : 'bg-white'}`}>
      <div className="text-xs font-headline font-bold uppercase tracking-widest mb-1 opacity-70">{label}</div>
      <div className="font-headline font-black text-3xl">{value}</div>
      <div className="text-xs font-body mt-1 opacity-60">{sub}</div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  RUNNING:   'bg-lime border-black text-black',
  COMPLETED: 'bg-black text-white border-black',
  DRAFT:     'bg-surface-low border-black',
  QUEUED:    'bg-lime border-black',
  FAILED:    'bg-red-100 border-red-500 text-red-800',
}

const RECS = [
  {
    tag: 'HIGH IMPACT',
    title: 'Re-engage dormant high-value customers',
    desc: '~100 customers with LTV > ₹3,500 haven\'t bought in 45+ days. A WhatsApp win-back offer typically reactivates 22-30%.',
    prompt: 'Re-engage our dormant high-value customers who haven\'t purchased in 45 days with a personalised WhatsApp offer',
    cta: 'Generate Draft',
    tagColor: 'bg-lime',
  },
  {
    tag: 'QUICK WIN',
    title: 'Launch welcome journey for new customers',
    desc: 'New customers who get a Day-3 follow-up message are 3x more likely to make a second purchase.',
    prompt: 'Create a welcome campaign for customers who joined in the last 30 days to drive their second purchase',
    cta: 'Generate Draft',
    tagColor: 'bg-surface-low border border-black',
  },
]

export default function Dashboard() {
  const [overview, setOverview] = useState<any>(null)
  const [campaigns, setCampaigns] = useState<any[]>([])

  useEffect(() => {
    api.analyticsOverview().then(setOverview).catch(() => {})
    api.campaigns().then(r => setCampaigns(r.slice(0, 5))).catch(() => {})
  }, [])

  const c = overview?.customers
  const totalCustomers = c?.total_customers ? Number(c.total_customers) : null
  const totalCampaigns = overview?.campaigns?.total_campaigns ?? null
  const deliveryRate   = overview?.campaigns?.avg_delivery_rate ?? null
  const revenue        = overview?.attributedRevenue?.attributed_revenue
    ? `₹${(Number(overview.attributedRevenue.attributed_revenue) / 100000).toFixed(1)}L`
    : '—'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline font-black text-3xl">Overview</h1>
          <p className="text-sm font-body text-on-surface-muted">Real-time performance metrics</p>
        </div>
        <Link href="/campaigns/new" className="bg-lime border-2 border-black shadow-hard px-4 py-2 font-headline font-bold text-sm btn-press">
          + New Campaign
        </Link>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Customers"
          value={totalCustomers !== null ? `${(totalCustomers / 1000).toFixed(1)}k` : '—'}
          sub={`${c?.active_customers ?? '—'} active this month`}
        />
        <StatCard
          label="Total Campaigns"
          value={totalCampaigns ?? '—'}
          sub={`${overview?.campaigns?.active_campaigns ?? 0} running now`}
        />
        <StatCard
          label="Avg Delivery Rate"
          value={deliveryRate ? `${Number(deliveryRate).toFixed(1)}%` : '—'}
          sub="Across all channels"
        />
        <StatCard
          label="Attr. Revenue"
          value={revenue}
          sub="Campaign-attributed"
          highlight
        />
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Recent Campaigns */}
        <div className="col-span-3 border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={16} fill="currentColor" />
              <span className="font-headline font-bold text-sm">Recent Campaigns</span>
            </div>
            <Link href="/campaigns" className="text-xs font-body text-on-surface-muted hover:underline">View all →</Link>
          </div>
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b-2 border-black bg-surface-low">
                <th className="text-left px-4 py-2 font-bold text-xs uppercase">Name</th>
                <th className="text-left px-4 py-2 font-bold text-xs uppercase">Status</th>
                <th className="text-right px-4 py-2 font-bold text-xs uppercase">Sent</th>
                <th className="text-right px-4 py-2 font-bold text-xs uppercase">Open %</th>
                <th className="text-right px-4 py-2 font-bold text-xs uppercase">CTR</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-on-surface-muted">Loading...</td></tr>
              )}
              {campaigns.map((row: any) => {
                const camp = row.campaign
                const s    = row.stats
                const sent = Number(s?.sentCount ?? 0)
                const openRate = sent > 0 ? ((Number(s.openedCount) / sent) * 100).toFixed(1) : null
                const ctr      = sent > 0 ? ((Number(s.clickedCount) / sent) * 100).toFixed(1) : null
                return (
                  <tr key={camp.id} className="border-b border-outline/30 hover:bg-surface-low">
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${camp.id}`} className="font-medium hover:underline">
                        {camp.name}
                      </Link>
                      {camp.created_by === 'ai_agent' && (
                        <span className="ml-1.5 bg-black text-white text-xs px-1 py-0.5 font-bold">AI</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`border text-xs font-headline font-bold px-2 py-0.5 ${STATUS_COLORS[camp.status] ?? 'border-black'}`}>
                        {camp.status === 'RUNNING' ? '● ' : ''}{camp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{sent > 0 ? sent.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right">{openRate ? `${openRate}%` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">{ctr ? `${ctr}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Copilot Recs */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Bot size={16} />
            <span className="font-headline font-bold text-sm">Copilot Suggestions</span>
          </div>
          {RECS.map((r, i) => (
            <div key={i} className="border-3 border-black shadow-hard bg-white p-4">
              <span className={`text-xs font-headline font-black px-2 py-0.5 border border-black ${r.tagColor}`}>{r.tag}</span>
              <p className="font-headline font-bold text-sm mt-2 mb-1">{r.title}</p>
              <p className="text-xs font-body text-on-surface-muted mb-3">{r.desc}</p>
              <Link
                href={`/copilot?prompt=${encodeURIComponent(r.prompt)}`}
                className="border-2 border-black px-3 py-1.5 text-xs font-headline font-bold btn-press shadow-hard-sm inline-flex items-center gap-1 hover:bg-lime"
              >
                <Bot size={12} /> {r.cta}
                <ArrowRight size={11} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
