'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Car, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '../../lib/config';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Invalid username or password');
      }

      const data = await res.json();
      if (typeof window !== 'undefined') {
        localStorage.setItem('autopark_token', data.access_token);
        localStorage.setItem('autopark_username', data.username);
        localStorage.setItem('autopark_role', data.role || 'DRIVER');
        localStorage.setItem('autopark_plate', data.license_plate || '');
      }

      router.push('/book');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-districtBg text-white flex flex-col justify-center items-center p-4 relative selection:bg-white/20 selection:text-white">
      <div className="w-full max-w-md district-card p-8 relative z-10 border border-white/10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#18181B] border border-white/10 text-white flex items-center justify-center mb-3">
            <Car className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
            district<span className="font-light text-zinc-400">PARK</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 text-center font-normal">
            Pre-Arrival Driver Portal &amp; Gate Authentication
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. driver1 or demouser"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-districtInput border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-districtInput border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-all font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="district-btn-primary w-full mt-2 py-3.5 px-4 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/[0.08] text-center">
          <p className="text-xs text-zinc-400">
            Don't have an account yet?{' '}
            <Link href="/register" className="text-white font-bold hover:underline">
              Create an account
            </Link>
          </p>
          <div className="mt-4">
            <Link href="/" className="text-xs text-zinc-400 hover:text-white transition-colors">
              ← Return to Live Parking View
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
