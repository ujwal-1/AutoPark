'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, LogIn, Menu, X, Monitor } from 'lucide-react';
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
    { href: '/', label: 'Live deck' },
    { href: '/book', label: 'Pre-book' },
    { href: '/pass', label: 'Active pass' },
    { href: '/history', label: 'Receipts' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-ink text-panel border-b border-[#4E4B42]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-[46px] gap-6">
          {/* Signage-style brand */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <DistrictLogo className="w-[22px] h-[16px] text-panel" />
            <span className="font-sign font-extrabold text-[15px] tracking-tight text-panel">
              districtPARK
            </span>
            <span className="hidden xl:inline text-[12px] text-[#BDB7A8] font-normal">
              · parking operations
            </span>
          </Link>

          {/* Desktop links — plain text with an underline for the current page */}
          <div className="hidden md:flex items-center gap-5 text-[12.5px]">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative py-1 transition-colors ${
                    isActive
                      ? 'text-panel after:absolute after:left-0 after:right-0 after:-bottom-[13px] after:h-[2px] after:bg-paint'
                      : 'text-[#CCC6B7] hover:text-panel'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="hidden lg:flex items-center gap-4">
            <Link
              href="/operator"
              className={`inline-flex items-center gap-1.5 text-[12.5px] px-2.5 py-1 border transition-colors ${
                pathname === '/operator'
                  ? 'border-paint text-panel bg-[#3D3A32]'
                  : 'border-[#4E4B42] text-[#CCC6B7] hover:text-panel hover:border-[#78736A]'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Operator console</span>
            </Link>

            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[#E7E3D8]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-[#8AAE99]' : 'bg-[#A55643]'}`}
              />
              <span className="font-mono">{wsConnected ? 'Linked' : 'Polling'}</span>
            </div>

            {currentUser ? (
              <div className="flex items-center gap-2 pl-4 border-l border-[#4E4B42]">
                <span className="w-5 h-5 bg-panel text-ink grid place-items-center text-[9.5px] font-bold rounded-sm">
                  {currentUser.username.substring(0, 1).toUpperCase()}
                </span>
                <span className="text-[11.5px] max-w-[90px] truncate text-[#E7E3D8]">
                  {currentUser.username}
                </span>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="text-[#BDB7A8] hover:text-panel p-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1 bg-panel text-ink hover:bg-white transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in</span>
              </Link>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 border border-[#4E4B42] text-panel"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-[#4E4B42] space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-2 py-2 text-[13px] ${
                    isActive ? 'text-panel bg-[#3D3A32]' : 'text-[#CCC6B7]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/operator"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-2 py-2 text-[13px] text-[#CCC6B7]"
            >
              Operator console
            </Link>
            {!currentUser && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-2 py-2 text-[13px] text-panel"
              >
                Sign in
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};
