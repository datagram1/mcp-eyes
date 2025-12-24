'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  title: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  {
    title: 'Overview',
    href: '/dashboard/help',
    icon: 'home',
  },
  {
    title: 'Getting Started',
    href: '/dashboard/help/getting-started',
    icon: 'rocket',
    children: [
      { title: 'Quick Start', href: '/dashboard/help/getting-started' },
      { title: 'Installation', href: '/dashboard/help/getting-started/installation' },
      { title: 'Permissions', href: '/dashboard/help/getting-started/permissions' },
      { title: 'MCP Setup', href: '/dashboard/help/getting-started/mcp-setup' },
    ],
  },
  {
    title: 'Tools Reference',
    href: '/dashboard/help/tools',
    icon: 'tools',
    children: [
      { title: 'Tool Selection Guide', href: '/dashboard/help/tools' },
      { title: 'Desktop Automation', href: '/dashboard/help/tools/desktop' },
      { title: 'Browser Automation', href: '/dashboard/help/tools/browser' },
      { title: 'Grid Tools', href: '/dashboard/help/tools/grid' },
      { title: 'Filesystem & Shell', href: '/dashboard/help/tools/filesystem' },
      { title: 'System Tools', href: '/dashboard/help/tools/system' },
    ],
  },
  {
    title: 'Platform Guides',
    href: '/dashboard/help/platforms',
    icon: 'platform',
    children: [
      { title: 'macOS', href: '/dashboard/help/platforms/macos' },
      { title: 'Windows', href: '/dashboard/help/platforms/windows' },
      { title: 'Linux', href: '/dashboard/help/platforms/linux' },
    ],
  },
  {
    title: 'Troubleshooting',
    href: '/dashboard/help/troubleshooting',
    icon: 'help',
  },
];

const icons: Record<string, React.ReactNode> = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  rocket: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  tools: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  platform: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  help: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/dashboard/help') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const isExactActive = (href: string) => pathname === href;

  return (
    <div className="flex gap-8">
      {/* Sidebar Navigation */}
      <aside className="w-64 flex-shrink-0">
        <nav className="sticky top-8 space-y-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-4">
            Documentation
          </div>
          {navigation.map((item) => (
            <div key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon && (
                  <span className={isActive(item.href) ? 'text-white' : 'text-slate-400'}>
                    {icons[item.icon]}
                  </span>
                )}
                <span className="font-medium">{item.title}</span>
              </Link>

              {/* Child items */}
              {item.children && isActive(item.href) && (
                <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`block px-3 py-1.5 text-sm rounded transition-colors ${
                        isExactActive(child.href)
                          ? 'text-blue-400 font-medium'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {child.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <div className="prose prose-invert prose-slate max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
