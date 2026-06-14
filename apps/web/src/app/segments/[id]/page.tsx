'use client'
import { useState, useEffect, use } from 'react'
import { api } from '@/lib/api'
import { Users, ArrowLeft, Zap } from 'lucide-react'
import Link from 'next/link'

export default function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [segment, setSegment] = useState<any>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.segment(id)
      .then(seg => {
        setSegment(seg)
        api.segmentCustomers(id).then(setCustomers).catch(() => {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 font-body">Loading...</div>
  if (!segment) return <div className="p-8 font-body">Segment not found.</div>

  const conditions = segment.filterRules?.conditions ?? []

  return (
    <div className="p-8">
      <Link href="/segments" className="inline-flex items-center gap-1 text-sm font-body text-on-surface-muted hover:underline mb-4">
        <ArrowLeft size={14} /> Back to Segments
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-headline font-black text-3xl">{segment.name}</h1>
          <p className="text-sm font-body text-on-surface-muted mt-1">{segment.description}</p>
        </div>
        <Link
          href={`/copilot?prompt=${encodeURIComponent(`Create a campaign for the "${segment.name}" segment`)}`}
          className="bg-lime border-2 border-black shadow-hard px-4 py-2 font-headline font-bold text-sm btn-press flex items-center gap-2"
        >
          <Zap size={14} /> Run Campaign
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border-3 border-black shadow-hard bg-lime p-5">
          <div className="text-xs font-headline font-bold uppercase tracking-widest mb-1">Audience Size</div>
          <div className="font-headline font-black text-3xl">{segment.estimatedSize?.toLocaleString() ?? '—'}</div>
        </div>
        <div className="border-3 border-black shadow-hard bg-white p-5">
          <div className="text-xs font-headline font-bold uppercase tracking-widest mb-1">Est. Revenue Potential</div>
          <div className="font-headline font-black text-3xl">
            {segment.estimatedRevenue ? `₹${(Number(segment.estimatedRevenue)/100000).toFixed(1)}L` : '—'}
          </div>
        </div>
        <div className="border-3 border-black shadow-hard bg-white p-5">
          <div className="text-xs font-headline font-bold uppercase tracking-widest mb-1">Created By</div>
          <div className="font-headline font-black text-lg uppercase">{segment.createdBy ?? '—'}</div>
        </div>
      </div>

      {segment.aiRationale && (
        <div className="border-3 border-black shadow-hard bg-white p-5 mb-6">
          <div className="text-xs font-headline font-bold uppercase tracking-widest mb-2">AI Rationale</div>
          <p className="text-sm font-body">{segment.aiRationale}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-4 py-3 font-headline font-bold text-sm">Filter Rules</div>
          <div className="p-4 space-y-2">
            {conditions.length === 0 ? (
              <p className="text-sm font-body text-on-surface-muted">No filter rules defined.</p>
            ) : conditions.map((c: any, i: number) => (
              <div key={i} className="border-2 border-black px-3 py-2 text-sm font-body bg-surface-low flex items-center gap-2">
                <span className="font-bold font-mono text-xs bg-black text-white px-1">{c.field}</span>
                <span className="text-on-surface-muted">{c.op}</span>
                <span className="font-bold">{String(c.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-4 py-3 flex items-center justify-between">
            <span className="font-headline font-bold text-sm">Sample Customers</span>
            <span className="text-xs font-body text-on-surface-muted flex items-center gap-1">
              <Users size={12} /> {customers.length} shown
            </span>
          </div>
          <div className="divide-y divide-outline/20 max-h-80 overflow-y-auto">
            {customers.length === 0 ? (
              <div className="px-4 py-6 text-sm text-center text-on-surface-muted font-body">No customer data available.</div>
            ) : customers.slice(0, 20).map((c: any) => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between text-sm font-body">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-on-surface-muted">{c.email}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">₹{Number(c.lifetimeValue ?? 0).toLocaleString()}</div>
                  <div className="text-xs text-on-surface-muted">{c.totalOrders ?? 0} orders</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
