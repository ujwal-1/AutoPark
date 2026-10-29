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
        // Store as autopark_user JSON object so Navbar & book page can read it
        localStorage.setItem('autopark_user', JSON.stringify({
          id: data.id,
          username: data.username,
          role: data.role || 'DRIVER',
          vehicle_plate: data.license_plate || '',
          full_name: data.full_name || null,
          email: data.email || null,
        }));
      }

      router.push('/book');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-concrete text-ink flex flex-col justify-center items-center p-4 relative selection:bg-ink selection:text-panel">
      <div className="w-full max-w-md district-card p-8 relative z-10 border border-hair">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-sm bg-panel2 border border-hair text-ink flex items-center justify-center mb-3">
            <Car className="w-7 h-7 text-ink" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-1.5">
            district<span className="font-light text-ink2">PARK</span>
          </h1>
          <p className="text-xs text-ink2 mt-1 text-center font-normal">
            Pre-Arrival Driver Portal &amp; Gate Authentication
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-sm bg-fault/10 border border-fault text-fault text-xs font-semibold flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-fault shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. driver1 or demouser"
                className="w-full pl-10 pr-4 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
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

        <div className="mt-6 pt-6 border-t border-hair text-center">
          <p className="text-xs text-ink2">
            Don't have an account yet?{' '}
            <Link href="/register" className="text-ink font-bold hover:underline">
              Create an account
            </Link>
          </p>
          <div className="mt-4">
            <Link href="/" className="text-xs text-ink2 hover:text-ink transition-colors">
              ← Return to Live Parking View
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
