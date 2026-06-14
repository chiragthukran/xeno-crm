const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    })
    if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  // Customers
  customers:        (params?: string) => req<any[]>(`/customers${params ? `?${params}` : ''}`),
  customerStats:    ()                => req<any>('/customers/stats/summary'),

  // Segments
  segments:          ()                => req<any[]>('/segments'),
  segment:           (id: string)     => req<any>(`/segments/${id}`),
  segmentCustomers:  (id: string)     => req<any[]>(`/segments/${id}/customers`),
  createSegment:     (body: any)      => req<any>('/segments', { method: 'POST', body: JSON.stringify(body) }),
  previewSegment:    (id: string)     => req<any>(`/segments/${id}/preview`),

  // Campaigns
  campaigns:        ()                => req<any[]>('/campaigns'),
  campaign:         (id: string)      => req<any>(`/campaigns/${id}`),
  createCampaign:   (body: any)       => req<any>('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  launchCampaign:   (id: string, by = 'marketer') =>
    req<any>(`/campaigns/${id}/launch`, { method: 'POST', body: JSON.stringify({ triggeredBy: by }) }),
  campaignStats:    (id: string)      => req<any>(`/campaigns/${id}/stats`),
  campaignEvents:   (id: string)      => req<any[]>(`/campaigns/${id}/events`),

  // Analytics
  analyticsOverview:   () => req<any>('/analytics/overview'),
  analyticsFunnel:     () => req<any>('/analytics/funnel'),
  channelPerformance:  () => req<any[]>('/analytics/channel-performance'),
  topCampaigns:        () => req<any[]>('/analytics/top-campaigns'),
  revenueByWeek:       () => req<any[]>('/analytics/revenue-by-week'),

  // Admin
  dlq:              ()                => req<any[]>('/admin/dlq'),
  retryDlqJob:      (id: string)      => req<any>(`/admin/dlq/${id}/retry`, { method: 'POST' }),
  queueStats:       ()                => req<any>('/admin/queue-stats'),
  suppressionList:  ()                => req<any[]>('/admin/suppression'),
  addSuppression:   (body: any)       => req<any>('/admin/suppression', { method: 'POST', body: JSON.stringify(body) }),
  removeSuppression:(id: string)      => req<any>(`/admin/suppression/${id}`, { method: 'DELETE' }),
  frequencyCaps:    ()                => req<any[]>('/admin/frequency-caps'),
  updateFreqCap:    (body: any)       => req<any>('/admin/frequency-caps', { method: 'PUT', body: JSON.stringify(body) }),

  // AI Agent
  chat:             (message: string, sessionId: string) =>
    req<{ response: string; toolCalls: any[] }>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, sessionId }) }),
}
