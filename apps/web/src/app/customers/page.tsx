'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

function churnLabel(r: number): { label: string; color: string } {
  if (r > 0.7) return { label: 'High',   color: 'bg-red-100 border-red-500 text-red-800' }
  if (r > 0.4) return { label: 'Medium', color: 'bg-lime border-black' }
  return              { label: 'Low',    color: 'bg-surface-low border-black' }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('filter', filter)
    if (search)           params.set('search', search)
    api.customers(params.toString()).then(rows => {
      setCustomers(rows)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filter, search])

  const FILTERS = ['all', 'vip', 'at-risk', 'active']

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-headline font-black text-3xl">Customers Directory</h1>
          <p className="text-sm font-body text-on-surface-muted">Manage and segment your Luxe Fashion audience.</p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          className="border-2 border-black px-3 py-2 text-sm font-body w-56 outline-none focus:shadow-hard"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`border-2 border-black px-3 py-1 text-sm font-headline font-bold capitalize btn-press
              ${filter === f ? 'bg-lime shadow-hard-sm' : 'bg-white hover:bg-surface-low'}`}
          >
            {f === 'at-risk' ? 'At Risk' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border-3 border-black shadow-hard bg-white">
        <table className="w-full text-sm font-body">
          <thead>
            <tr className="border-b-3 border-black bg-surface-low">
              <th className="text-left px-5 py-3 font-headline font-bold text-xs uppercase">Name</th>
              <th className="text-left px-5 py-3 font-headline font-bold text-xs uppercase">City</th>
              <th className="text-right px-5 py-3 font-headline font-bold text-xs uppercase">Lifetime Spend</th>
              <th className="text-center px-5 py-3 font-headline font-bold text-xs uppercase">Churn Risk</th>
              <th className="text-right px-5 py-3 font-headline font-bold text-xs uppercase">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-on-surface-muted">Loading...</td></tr>
            ) : customers.map((row: any) => {
              const c = row.customer ?? row
              const insight = row.insight
              const risk = churnLabel(Number(insight?.churnRisk ?? insight?.churn_risk ?? 0))
              const lastPurchase = c.lastPurchaseAt ?? c.last_purchase_at
                ? new Date(c.lastPurchaseAt ?? c.last_purchase_at) : null
              const daysAgo = lastPurchase ? Math.floor((Date.now() - lastPurchase.getTime()) / 86400000) : null
              return (
                <tr key={c.id} className="border-b border-outline/20 hover:bg-surface-low">
                  <td className="px-5 py-3">
                    <div className="font-bold">{c.name}</div>
                    <div className="text-xs text-on-surface-muted">{c.email}</div>
                  </td>
                  <td className="px-5 py-3 text-on-surface-muted">{c.city ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-bold">₹{Number(c.lifetimeValue ?? c.lifetime_value ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`border px-2 py-0.5 text-xs font-bold ${risk.color}`}>{risk.label}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-on-surface-muted">
                    {daysAgo !== null ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
