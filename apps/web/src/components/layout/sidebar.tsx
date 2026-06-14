'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, Users, Layers, Megaphone, BarChart2, Settings, Plus, Zap } from 'lucide-react'

const NAV = [
  { label: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard },
  { label: 'AI Copilot', href: '/copilot',    icon: Bot },
  { label: 'Customers',  href: '/customers',  icon: Users },
  { label: 'Segments',   href: '/segments',   icon: Layers },
  { label: 'Campaigns',  href: '/campaigns',  icon: Megaphone },
  { label: 'Analytics',  href: '/analytics',  icon: BarChart2 },
  { label: 'Admin',      href: '/admin',      icon: Settings },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <header className="w-full bg-white border-b-3 border-black flex items-center px-6 h-14 flex-shrink-0 gap-8">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0 group">
        <div className="w-8 h-8 bg-lime border-2 border-black flex items-center justify-center font-headline font-black text-sm transition-transform group-hover:scale-105">
          <Zap size={14} fill="black" />
        </div>
        <div>
          <div className="font-headline font-black text-sm leading-tight">Luxe Fashion</div>
          <div className="text-xs text-on-surface-muted font-body leading-tight">Campaign Copilot</div>
        </div>
      </Link>

      {/* Nav items */}
      <nav className="flex items-center gap-1 flex-1">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`
                relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-body font-medium
                rounded transition-all duration-200 group
                ${active
                  ? 'bg-lime border-2 border-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  : 'hover:bg-stone-100 text-stone-600 hover:text-black border-2 border-transparent'
                }
              `}
            >
              <Icon
                size={14}
                strokeWidth={active ? 2.5 : 2}
                className={`transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`}
              />
              <span>{label}</span>
              {active && (
                <span className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-black rounded-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* New Campaign CTA */}
      <Link
        href="/campaigns/new"
        className="flex items-center gap-1.5 bg-black text-white text-sm font-headline font-bold px-4 py-2 border-2 border-black shadow-[3px_3px_0px_0px_rgba(204,255,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all duration-150 flex-shrink-0"
      >
        <Plus size={14} />
        New Campaign
      </Link>
    </header>
  )
}
