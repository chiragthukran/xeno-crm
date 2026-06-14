'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, Users, Layers, Megaphone, BarChart2, Settings, Plus } from 'lucide-react'

const NAV = [
  { label: 'Dashboard',  href: '/dashboard',    icon: LayoutDashboard },
  { label: 'AI Copilot', href: '/copilot',       icon: Bot },
  { label: 'Customers',  href: '/customers',     icon: Users },
  { label: 'Segments',   href: '/segments',      icon: Layers },
  { label: 'Campaigns',  href: '/campaigns',     icon: Megaphone },
  { label: 'Analytics',  href: '/analytics',     icon: BarChart2 },
  { label: 'Admin',      href: '/admin',         icon: Settings },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-40 bg-white border-r-3 border-black flex flex-col h-screen flex-shrink-0">
      {/* Logo */}
      <div className="p-4 border-b-3 border-black">
        <div className="w-8 h-8 bg-lime border-2 border-black flex items-center justify-center font-headline font-black text-sm mb-2">
          LF
        </div>
        <div className="font-headline font-black text-sm leading-tight">Campaign Copilot</div>
        <div className="text-xs text-on-surface-muted font-body">Luxe Fashion</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-body font-medium transition-colors mx-2 rounded
                ${active
                  ? 'bg-lime border-2 border-black shadow-hard-sm font-bold'
                  : 'hover:bg-surface-low'
                }`}
            >
              <Icon size={16} strokeWidth={2.5} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* New Campaign CTA */}
      <div className="p-3 border-t-3 border-black">
        <Link
          href="/campaigns/new"
          className="flex items-center gap-1.5 w-full bg-black text-white text-sm font-headline font-bold px-3 py-2.5 border-2 border-black shadow-hard-sm btn-press justify-center"
        >
          <Plus size={14} />
          New Campaign
        </Link>
      </div>
    </aside>
  )
}
