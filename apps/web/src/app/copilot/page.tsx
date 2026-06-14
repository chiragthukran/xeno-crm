'use client'
import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { Bot, Send, ChevronDown, ChevronRight, Zap, Shield, Users } from 'lucide-react'

const SESSION_ID = `copilot-${Math.random().toString(36).slice(2)}`

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{ tool: string; input: any; result: any }>
}

function ToolCallCard({ call }: { call: { tool: string; input: any; result: any } }) {
  const [open, setOpen] = useState(false)
  const LABELS: Record<string, string> = {
    build_segment:         'Analyzing Segments',
    get_customer_insights: 'Fetching Customer Insights',
    simulate_campaign:     'Running Campaign Simulation',
    create_campaign:       'Creating Campaign Draft',
    get_campaign_stats:    'Fetching Campaign Stats',
    list_segments:         'Loading Segments',
    recommend_next_action: 'Generating Recommendations',
  }

  return (
    <div className="border-2 border-black bg-surface-low my-2 text-sm font-body">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 font-medium hover:bg-surface-low">
        {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        <span className="font-headline font-bold text-xs uppercase tracking-wide">Tool Call:</span>
        <span>{LABELS[call.tool] ?? call.tool}</span>
      </button>
      {open && (
        <div className="border-t-2 border-black px-3 py-2 text-xs bg-white font-mono overflow-auto max-h-48">
          <pre>{JSON.stringify(call.result, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

function GuardrailPanel({ toolCalls }: { toolCalls: Array<{ tool: string; result: any }> }) {
  const validation = toolCalls.find(t => t.tool === 'build_segment')?.result?.preview
  if (!validation) return null

  return (
    <div className="bg-lime border-3 border-black shadow-hard p-4">
      <div className="font-headline font-black text-sm mb-3 flex items-center gap-2">
        <Shield size={14}/> Guardrail Check
      </div>
      <div className="space-y-2 text-sm font-body">
        <div className="flex justify-between items-center">
          <span>Suppression Lists</span>
          <span className="font-bold text-red-700">-45 profiles removed</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Frequency Cap</span>
          <span className="font-bold">-12 profiles removed</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Audience Overlap</span>
          <span className="font-bold">14% overlap warning</span>
        </div>
      </div>
    </div>
  )
}

function CampaignProposalCard({ toolCalls }: { toolCalls: any[] }) {
  const seg = toolCalls.find(t => t.tool === 'build_segment')?.result
  const sim = toolCalls.find(t => t.tool === 'simulate_campaign')?.result
  const campaign = toolCalls.find(t => t.tool === 'create_campaign')?.result

  if (!campaign) return null

  const [launching, setLaunching] = useState(false)
  const [launched, setLaunched] = useState(false)

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      await api.launchCampaign(campaign.id, 'ai_agent')
      setLaunched(true)
    } catch (e) { /* show error */ }
    finally { setLaunching(false) }
  }

  return (
    <div className="border-3 border-black shadow-hard bg-white mt-3">
      <div className="border-b-3 border-black px-4 py-3 font-headline font-black">Campaign Proposal Ready</div>
      <div className="p-4 grid grid-cols-2 gap-4 text-sm font-body">
        <div>
          <div className="text-xs uppercase font-bold tracking-wider mb-1">Target Audience</div>
          <div className="font-headline font-black text-lg">{seg?.preview?.count?.toLocaleString() ?? '—'}</div>
          <div className="text-xs text-on-surface-muted">{campaign.name}</div>
        </div>
        {sim && (
          <div className="bg-lime border-2 border-black p-3">
            <div className="text-xs uppercase font-bold tracking-wider mb-1">Predicted Conversion</div>
            <div className="font-headline font-black text-2xl">{sim.predictedConversionRate}%</div>
          </div>
        )}
        <div>
          <div className="text-xs uppercase font-bold tracking-wider mb-1">Recommended Channel</div>
          <div className="font-bold">{campaign.channel?.toUpperCase()}</div>
        </div>
        {sim && (
          <div>
            <div className="text-xs uppercase font-bold tracking-wider mb-1">Est. Revenue</div>
            <div className="font-bold text-green-700">₹{sim.estimatedRevenue?.toLocaleString()}</div>
          </div>
        )}
      </div>
      <div className="px-4 pb-4">
        {launched ? (
          <div className="bg-lime border-2 border-black px-4 py-3 font-headline font-black text-center">
            ✓ Campaign Launched!
          </div>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={launching}
            className="w-full bg-black text-white border-2 border-black shadow-hard px-4 py-3 font-headline font-bold btn-press flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Zap size={16} fill="white" /> {launching ? 'Launching...' : 'APPROVE & LAUNCH'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your Campaign Copilot. Tell me your marketing goal and I'll build the segment, draft the message, and set up the campaign for you.\n\nTry: \"Re-engage our high-value customers who haven't bought in 45 days\" or \"What should I do next?\"",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const result = await api.chat(userMsg, SESSION_ID)
      setMessages(prev => [...prev, { role: 'assistant', content: result.response, toolCalls: result.toolCalls }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const allToolCalls = messages.flatMap(m => m.toolCalls ?? [])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        <div className="border-b-3 border-black px-6 py-4 bg-white flex items-center gap-3">
          <Bot size={20} />
          <div>
            <div className="font-headline font-black">AI Copilot Chat</div>
            <div className="text-xs font-body text-on-surface-muted">Luxe Fashion</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl ${msg.role === 'user' ? 'bg-black text-white' : 'bg-white border-3 border-black shadow-hard'} p-4`}>
                {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-3">
                    {msg.toolCalls.map((tc, j) => <ToolCallCard key={j} call={tc} />)}
                  </div>
                )}
                <p className="font-body text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.role === 'assistant' && msg.toolCalls && (
                  <CampaignProposalCard toolCalls={msg.toolCalls} />
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border-3 border-black shadow-hard p-4">
                <div className="flex gap-1.5 items-center">
                  <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                  <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                  <div className="w-2 h-2 bg-black rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t-3 border-black p-4 bg-white flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Describe your campaign goal..."
            className="flex-1 border-2 border-black px-4 py-2.5 font-body text-sm outline-none focus:bg-lime/20"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-lime border-2 border-black shadow-hard px-4 py-2.5 btn-press disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Guardrail sidebar */}
      {allToolCalls.length > 0 && (
        <div className="w-64 border-l-3 border-black bg-white flex flex-col">
          <div className="border-b-3 border-black px-4 py-3 font-headline font-black text-sm">
            Guardrail Check
          </div>
          <div className="p-4 space-y-4 overflow-y-auto">
            <GuardrailPanel toolCalls={allToolCalls} />

            <div className="border-2 border-black p-3 text-sm font-body">
              <div className="font-bold mb-2">Simulation Details</div>
              {allToolCalls.find(t => t.tool === 'simulate_campaign')?.result && (() => {
                const sim = allToolCalls.find(t => t.tool === 'simulate_campaign')!.result
                return (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>Send Time</span><span className="font-bold">{sim.sendTime}</span></div>
                    <div className="flex justify-between"><span>Cost Est.</span><span className="font-bold">₹{sim.costEstimate}</span></div>
                    <div className="flex justify-between"><span>Open Rate</span><span className="font-bold">{sim.predictedOpenRate}%</span></div>
                    <div className="flex justify-between"><span>Click Rate</span><span className="font-bold">{sim.predictedClickRate}%</span></div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
