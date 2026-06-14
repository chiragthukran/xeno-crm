'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function NewCampaignPage() {
  const router = useRouter()
  const [segments, setSegments] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', segmentId: '', messageTemplate: '', channel: 'whatsapp', sendRatePerMinute: 100 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.segments().then(setSegments).catch(() => {}) }, [])

  const submit = async () => {
    if (!form.name || !form.segmentId || !form.messageTemplate) {
      setError('Please fill all required fields')
      return
    }
    setLoading(true)
    try {
      const campaign = await api.createCampaign({ ...form, createdBy: 'marketer' })
      router.push(`/campaigns/${campaign.id}`)
    } catch { setError('Failed to create campaign') }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-headline font-black text-3xl mb-6">New Campaign</h1>

      {error && <div className="border-2 border-red-500 bg-red-50 text-red-800 px-4 py-2 mb-4 text-sm font-body">{error}</div>}

      <div className="space-y-5">
        {[
          { label: 'Campaign Name *', key: 'name', type: 'text', placeholder: 'e.g. Summer VIP Re-engagement' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs font-headline font-bold uppercase mb-1">{f.label}</label>
            <input
              type={f.type}
              value={(form as any)[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full border-2 border-black px-3 py-2.5 font-body text-sm outline-none focus:shadow-hard"
            />
          </div>
        ))}

        <div>
          <label className="block text-xs font-headline font-bold uppercase mb-1">Segment *</label>
          <select
            value={form.segmentId}
            onChange={e => setForm(p => ({ ...p, segmentId: e.target.value }))}
            className="w-full border-2 border-black px-3 py-2.5 font-body text-sm outline-none bg-white"
          >
            <option value="">Select a segment...</option>
            {segments.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name} ({s.estimatedSize?.toLocaleString() ?? '?'} customers)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-headline font-bold uppercase mb-1">Channel *</label>
          <div className="flex gap-2">
            {['whatsapp', 'sms', 'email', 'rcs'].map(ch => (
              <button
                key={ch}
                onClick={() => setForm(p => ({ ...p, channel: ch }))}
                className={`border-2 border-black px-3 py-2 text-sm font-headline font-bold capitalize btn-press
                  ${form.channel === ch ? 'bg-lime shadow-hard-sm' : 'bg-white hover:bg-surface-low'}`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-headline font-bold uppercase mb-1">
            Message Template * <span className="font-body font-normal normal-case text-on-surface-muted ml-1">Use {'{{name}}'} for personalisation</span>
          </label>
          <textarea
            value={form.messageTemplate}
            onChange={e => setForm(p => ({ ...p, messageTemplate: e.target.value }))}
            placeholder="Hi {{name}}, we have something special for you..."
            rows={4}
            className="w-full border-2 border-black px-3 py-2.5 font-body text-sm outline-none focus:shadow-hard resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-headline font-bold uppercase mb-1">Send Rate (messages/min)</label>
          <input
            type="number"
            value={form.sendRatePerMinute}
            onChange={e => setForm(p => ({ ...p, sendRatePerMinute: Number(e.target.value) }))}
            min={1} max={1000}
            className="w-32 border-2 border-black px-3 py-2.5 font-body text-sm outline-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={submit}
            disabled={loading}
            className="bg-lime border-2 border-black shadow-hard px-6 py-3 font-headline font-bold btn-press disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <button onClick={() => router.back()} className="border-2 border-black px-4 py-3 font-headline font-bold btn-press hover:bg-surface-low">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
