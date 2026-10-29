'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
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
  const [clock, setClock] = useState('');

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

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('autopark_token');
    localStorage.removeItem('autopark_user');
    setCurrentUser(null);
    router.push('/login');
  };

  const navLinks = [
    { href: '/', label: 'Live deck' },
    { href: '/book', label: 'Pre-book' },
    { href: '/pass', label: 'Active pass' },
    { href: '/history', label: 'Receipts' },
    { href: '/operator', label: 'Operator console' },
  ];

  const initials = currentUser
    ? currentUser.username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'OP'
    : 'OP';

  return (
    <nav className="sticky top-0 z-50 bg-ink text-[#F7F4EC] border-b border-[#4E4B42]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 md:gap-5 h-[46px]">
          {/* Signage brand */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <DistrictLogo className="w-[22px] h-[14px] text-[#F7F4EC]" />
            <span className="font-sign font-extrabold text-[14.5px] tracking-[0.01em]">
              districtPARK
            </span>
            <span className="hidden md:inline text-[12.5px] font-normal text-[#BDB7A8]">
              · parking operations
            </span>
          </Link>

          <span className="hidden lg:block w-px h-[18px] bg-[#4E4B42]" />

          {/* Section links */}
          <div className="hidden lg:flex items-center gap-4 text-[12.5px]">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative py-1 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-[#F7F4EC] after:absolute after:left-0 after:right-0 after:-bottom-[15px] after:h-[2px] after:bg-paint'
                      : 'text-[#CCC6B7] hover:text-[#F7F4EC]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Status, clock, operator */}
          <div className="ml-auto flex items-center gap-3 sm:gap-4 whitespace-nowrap">
            <span className="hidden sm:flex items-center gap-1.5 mono text-[11px] uppercase tracking-[0.1em] text-[#E7E3D8]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  wsConnected ? 'bg-[#8AAE99]' : 'bg-fault'
                }`}
              />
              {wsConnected ? 'Linked' : 'Polling'}
            </span>

            <span className="hidden md:inline mono text-[12px] text-[#F7F4EC] tabular-nums">
              {clock}
            </span>

            {currentUser ? (
              <div className="flex items-center gap-2 pl-3 sm:pl-4 border-l border-[#4E4B42]">
                <span className="w-5 h-5 bg-[#F7F4EC] text-ink grid place-items-center text-[9.5px] font-bold rounded-[2px]">
                  {initials}
                </span>
                <span className="hidden sm:inline text-[11.5px] max-w-[110px] truncate text-[#E7E3D8]">
                  {currentUser.username}
                </span>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="text-[#BDB7A8] hover:text-[#F7F4EC] p-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-2.5 py-1 bg-[#F7F4EC] text-ink text-[12px] font-semibold hover:bg-white transition-colors"
              >
                Sign in
              </Link>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 border border-[#4E4B42] text-[#F7F4EC]"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-[#4E4B42] space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-2 py-2 text-[13px] ${
                    isActive ? 'text-[#F7F4EC] bg-[#3D3A32]' : 'text-[#CCC6B7]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
};
