'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Car,
  Wifi,
  User,
  LogOut,
  LogIn,
  LayoutGrid,
  CalendarCheck,
  Ticket,
  History,
  Monitor,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../lib/types';
import { DistrictLogo } from './DistrictLogo';

interface NavbarProps {
  wsConnected?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ wsConnected = true }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('autopark_token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('autopark_user') : null;
    if (token && userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch {
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('autopark_token');
    localStorage.removeItem('autopark_user');
    setCurrentUser(null);
    router.push('/login');
  };

  const navLinks = [
    { href: '/', label: 'Live Deck', icon: LayoutGrid },
    { href: '/book', label: 'Pre-Book', icon: CalendarCheck },
    { href: '/pass', label: 'Active Pass', icon: Ticket },
    { href: '/history', label: 'Receipts', icon: History },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-[#09090B]/95 backdrop-blur-xl border-b border-white/[0.08] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* District Monochrome Style Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-[#141416] border border-white/10 flex items-center justify-center text-white group-hover:border-white/30 transition-all shadow-sm">
              <DistrictLogo className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-white font-sans lowercase">
                district<span className="text-zinc-400 font-extrabold tracking-normal text-xs ml-1 uppercase">Park</span>
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links (District Monochrome Pill Tab Bar) */}
          <div className="hidden md:flex items-center gap-1 bg-[#141416] p-1 rounded-full border border-white/[0.08]">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all relative ${
                    isActive
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right Controls: Operator Console + Live Sync Pill + Auth */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Operator Console Tab */}
            <Link
              href="/operator"
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                pathname === '/operator'
                  ? 'bg-white text-black border-white shadow-sm'
                  : 'bg-[#141416] text-zinc-300 hover:text-white border-white/[0.08] hover:border-white/20'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Operator Console</span>
            </Link>

            {/* Live WebSocket Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#141416] border border-white/[0.08] text-[11px] font-bold text-zinc-400">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-zinc-300 font-mono tracking-wider">LIVE</span>
            </div>

            {/* User Auth */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#141416] border border-white/[0.08] text-xs">
                  <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-black">
                    {currentUser.username.substring(0, 1).toUpperCase()}
                  </div>
                  <span className="font-semibold text-white max-w-[90px] truncate">
                    {currentUser.username}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="p-2 rounded-full bg-[#141416] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.08] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-white text-black hover:bg-zinc-200 transition-all shadow-sm active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-[#141416] text-white border border-white/[0.08]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/[0.08] space-y-2 bg-[#09090B]">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold ${
                    isActive
                      ? 'bg-white text-black'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
            <Link
              href="/operator"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-zinc-300 hover:text-white hover:bg-white/[0.05]"
            >
              <Monitor className="w-4 h-4" />
              <span>Operator Console</span>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};
