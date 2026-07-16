'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QueryClientProvider } from '@tanstack/react-query'
import { Menu, X } from 'lucide-react'
import { queryClient } from '@/lib/queryClient'
import ReauthBanner from '@/components/notifications/ReauthBanner'
import NotificationCenter from '@/components/notifications/NotificationCenter'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assets', label: 'Assets' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/channels', label: 'Channels' },
  { href: '/notifications', label: 'Notifications' },
]

function NavLinks({ pathname, onClick }: { pathname: string; onClick?: () => void }) {
  return (
    <>
      {NAV_LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          onClick={onClick}
          className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname.startsWith(href)
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {label}
        </Link>
      ))}
    </>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200">
          {/* Hamburger — visible below lg */}
          <button
            className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo / brand — desktop */}
          <span className="hidden lg:block text-lg font-semibold text-indigo-600">PostPilot</span>

          <div className="flex items-center gap-2 ml-auto">
            <NotificationCenter />
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — desktop only */}
          <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-gray-200 py-4 px-3 gap-1">
            <NavLinks pathname={pathname} />
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto">
            <ReauthBanner />
            {children}
          </main>
        </div>

        {/* Mobile drawer overlay */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            {/* Drawer panel */}
            <div className="relative w-64 bg-white h-full shadow-xl flex flex-col py-4 px-3 gap-1">
              <div className="flex items-center justify-between mb-4 px-1">
                <span className="text-lg font-semibold text-indigo-600">PostPilot</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded-md text-gray-600 hover:bg-gray-100"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <NavLinks pathname={pathname} onClick={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </QueryClientProvider>
  )
}
