'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Users, Star, AlertTriangle, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

function SegmentIcon({ name }: { name: string }) {
  if (name.toLowerCase().includes('vip'))      return <Star size={16} fill="currentColor" />
  if (name.toLowerCase().includes('dormant'))  return <AlertTriangle size={16} />
  return <ShoppingCart size={16} />
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<any[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [nlQuery, setNlQuery] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { api.segments().then(setSegments).catch(() => {}) }, [])

  const handlePreview = async () => {
    if (!nlQuery.trim()) return
    setPreviewLoading(true)
    // Placeholder — real NL preview goes through AI agent
    setTimeout(() => {
      setPreview({ count: Math.floor(Math.random() * 3000 + 500), avgLifetimeValue: Math.floor(Math.random() * 5000 + 2000), topCities: ['Mumbai', 'Delhi', 'Bangalore'] })
      setPreviewLoading(false)
    }, 1200)
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-headline font-black text-3xl">SEGMENTS</h1>
          <p className="text-sm font-body text-on-surface-muted">Manage your audience partitions. Create dynamic segments using natural language or strict logic rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Segment list */}
        <div className="col-span-2 space-y-3">
          <div className="font-headline font-bold text-sm uppercase mb-2">Active Segments</div>
          {segments.map((seg: any) => (
            <Link key={seg.id} href={`/segments/${seg.id}`}>
              <div className="border-3 border-black shadow-hard bg-white p-4 hover:shadow-hard-lg transition-shadow flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5"><SegmentIcon name={seg.name} /></div>
                  <div>
                    <div className="font-headline font-bold">{seg.name}</div>
                    <div className="text-xs font-body text-on-surface-muted mt-0.5">{seg.description}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="font-headline font-black text-xl">{seg.estimatedSize?.toLocaleString() ?? '—'}</div>
                  <div className="text-xs font-body text-on-surface-muted">
                    {seg.estimatedRevenue ? `Exp. ₹${(Number(seg.estimatedRevenue)/1000).toFixed(0)}K` : '—'}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {segments.length === 0 && (
            <div className="border-3 border-black p-8 text-center text-on-surface-muted font-body">
              No segments yet. Create one using the panel →
            </div>
          )}
        </div>

        {/* Create segment panel */}
        <div className="border-3 border-black shadow-hard bg-white">
          <div className="border-b-3 border-black px-4 py-3 flex items-center justify-between">
            <span className="font-headline font-bold text-sm">Create Segment</span>
            <span className="bg-lime border border-black px-2 py-0.5 text-xs font-bold">BUILD</span>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs font-headline font-bold uppercase mb-1">Natural Language Query</div>
              <textarea
                value={nlQuery}
                onChange={e => setNlQuery(e.target.value)}
                placeholder="e.g. Show me users from New York who bought shoes last month but haven't..."
                className="w-full border-2 border-black p-2 text-sm font-body resize-none h-20 outline-none focus:shadow-hard"
              />
              <button
                onClick={handlePreview}
                disabled={!nlQuery.trim() || previewLoading}
                className="mt-2 w-full bg-black text-white border-2 border-black py-2 text-sm font-headline font-bold btn-press shadow-hard disabled:opacity-50"
              >
                {previewLoading ? 'Analyzing...' : '⚡ Use Natural Language'}
              </button>
            </div>

            <div className="border-t-2 border-black pt-3 text-xs font-body text-center text-on-surface-muted">OR</div>

            <button className="w-full border-2 border-black py-2 text-sm font-headline font-bold hover:bg-surface-low btn-press">
              Use Logic Builder
            </button>

            {preview && (
              <div className="border-2 border-black bg-surface-low p-3">
                <div className="text-xs font-headline font-bold uppercase mb-2 flex items-center gap-1">
                  <span className="w-2 h-2 bg-lime border border-black inline-block"/> Live Preview
                </div>
                <div className="text-sm font-body space-y-1">
                  <div className="flex justify-between"><span>Est. Audience</span><span className="font-bold">{preview.count.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Avg. LTV</span><span className="font-bold">₹{preview.avgLifetimeValue.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Top Regions</span><span className="font-bold text-right text-xs">{preview.topCities.join(', ')}</span></div>
                </div>
                <button
                  className="mt-3 w-full bg-lime border-2 border-black py-2 text-sm font-headline font-bold btn-press shadow-hard"
                  onClick={() => {
                    api.createSegment({
                      name: `AI Segment ${new Date().toLocaleDateString()}`,
                      nlQuery,
                      filterRules: { operator: 'AND', conditions: [{ field: 'total_orders', op: 'gte', value: 1 }] },
                      createdBy: 'ai_agent',
                      estimatedSize: preview.count,
                    }).then(() => api.segments().then(setSegments))
                  }}
                >
                  Save Segment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
