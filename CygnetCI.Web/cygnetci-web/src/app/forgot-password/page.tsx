'use client';

import React, { useState } from 'react';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { CONFIG } from '@/lib/config';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${CONFIG.api.baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // API always returns success (no account enumeration)
      if (!res.ok) throw new Error('Request failed. Please try again.');
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Forgot password</h2>
          <p className="mt-2 text-sm text-gray-600">Enter your email and we&apos;ll send a reset link</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl p-8 border border-gray-200">
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-gray-700">
                If an account exists for <span className="font-medium">{email}</span>, a password
                reset link has been sent. The link expires in 60 minutes.
              </p>
              <a href="/login" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500 font-medium">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </a>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    id="email" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{loading ? 'Sending...' : 'Send reset link'}</span>
              </button>
              <a href="/login" className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:text-blue-500 font-medium">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
