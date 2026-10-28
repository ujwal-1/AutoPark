'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Car, Lock, User, Mail, Phone, ArrowRight, AlertCircle } from 'lucide-react';

import { getApiBaseUrl } from '../../lib/config';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          full_name: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      // Automatically store token & user
      localStorage.setItem('autopark_token', data.access_token);
      localStorage.setItem('autopark_user', JSON.stringify(data.user));

      // Redirect to main dashboard
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-concrete text-ink flex flex-col justify-center items-center p-4 py-10 relative selection:bg-ink selection:text-panel">
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
            Create Driver Account for Smart Gate Clearance
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
              Username <span className="text-muted">*</span>
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
                placeholder="Choose username"
                className="w-full pl-10 pr-4 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full pl-10 pr-4 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="driver@mail.com"
                  className="w-full pl-9 pr-3 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
                Phone
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full pl-9 pr-3 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
              Password <span className="text-muted">*</span>
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
                placeholder="At least 6 characters"
                className="w-full pl-10 pr-4 py-3 rounded-sm bg-districtInput border border-hair text-sm text-ink placeholder-muted focus:outline-none focus:border-ink transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink2 uppercase tracking-wider mb-1.5">
              Confirm Password <span className="text-muted">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
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
              <span>Creating Account...</span>
            ) : (
              <>
                <span>Register &amp; Enter Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-hair text-center">
          <p className="text-xs text-ink2">
            Already have an account?{' '}
            <Link href="/login" className="text-ink font-bold hover:underline">
              Log in here
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
