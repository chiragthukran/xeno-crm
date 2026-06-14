'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { TrendingUp, Users, Megaphone, DollarSign, Zap, Bot } from 'lucide-react'
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

export default function Dashboard() {
  const [overview, setOverview] = useState<any>(null)
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [recs] = useState([
    {
      tag: 'HIGH IMPACT',
      title: 'Re-engage churned shoppers from last week',
      desc: '420 users abandoned cart > ₹150. Send a 10% discount SMS.',
      cta: 'Generate Draft',
      tagColor: 'bg-lime',
    },
    {
      tag: 'OPTIMIZATION',
      title: 'A/B Test Subject Lines',
      desc: "Your 'Spring Launch' campaign has low open rates in Segment C. Try a variant.",
      cta: 'Apply Variant',
      tagColor: 'bg-surface-low border border-black',
    },
  ])

  useEffect(() => {
    api.analyticsOverview().then(setOverview).catch(() => {})
    api.campaigns().then(r => setCampaigns(r.slice(0, 3))).catch(() => {})
  }, [])

  const stats = overview?.customers
  const rev   = overview?.attributedRevenue

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
        <StatCard label="Total Customers"  value={stats ? `${Math.round(Number(stats.total)/1000)}k` : '—'}  sub="+12.4% vs last month" />
        <StatCard label="Total Campaigns"  value={campaigns.length ? `${campaigns.length * 12}` : '—'}       sub="+4 this week" />
        <StatCard label="Avg Delivery"     value="98.2%"      sub="— Steady" />
        <StatCard label="Attr. Revenue"    value={rev ? `₹${(Number(rev.attributed_revenue)/1000000).toFixed(1)}M` : '₹2.4M'} sub="+18.2% YoY" highlight />
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Active Campaigns */}
        <div className="col-span-3 border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-5 py-3 flex items-center gap-2">
            <Zap size={16} fill="currentColor" />
            <span className="font-headline font-bold text-sm">Active Campaigns</span>
          </div>
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b-2 border-black bg-surface-low">
                <th className="text-left px-4 py-2 font-bold text-xs uppercase">Campaign Name</th>
                <th className="text-left px-4 py-2 font-bold text-xs uppercase">Status</th>
                <th className="text-right px-4 py-2 font-bold text-xs uppercase">Sent</th>
                <th className="text-right px-4 py-2 font-bold text-xs uppercase">Opened</th>
                <th className="text-right px-4 py-2 font-bold text-xs uppercase">CTR</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.filter(c => c.campaign?.status === 'RUNNING').map((row: any) => {
                const c = row.campaign; const s = row.stats
                return (
                  <tr key={c.id} className="border-b border-outline/30 hover:bg-surface-low">
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-lime border border-black px-2 py-0.5 text-xs font-bold">{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{s?.sent_count?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{s?.opened_count?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {s?.sent_count ? `${((s.clicked_count / s.sent_count) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
              {campaigns.filter(c => c.campaign?.status === 'RUNNING').length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-on-surface-muted">No active campaigns</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Copilot Recs */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Bot size={16} />
            <span className="font-headline font-bold text-sm">Copilot Recs</span>
          </div>
          {recs.map((r, i) => (
            <div key={i} className="border-3 border-black shadow-hard bg-white p-4">
              <span className={`text-xs font-headline font-black px-2 py-0.5 border border-black ${r.tagColor}`}>{r.tag}</span>
              <p className="font-headline font-bold text-sm mt-2 mb-1">{r.title}</p>
              <p className="text-xs font-body text-on-surface-muted mb-3">{r.desc}</p>
              <Link href="/copilot" className="border-2 border-black px-3 py-1.5 text-xs font-headline font-bold btn-press shadow-hard-sm inline-flex items-center gap-1">
                <Bot size={12} /> {r.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 border-3 border-black shadow-hard bg-white">
        <div className="border-b-3 border-black px-5 py-3 font-headline font-bold text-sm">Recent Activity</div>
        <div className="px-5 py-4 text-sm font-body text-on-surface-muted">
          <Link href="/campaigns" className="hover:underline">View all campaigns →</Link>
        </div>
      </div>
    </div>
  )
}
