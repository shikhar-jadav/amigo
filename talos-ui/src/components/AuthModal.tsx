'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { X, Sparkles, Loader2, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultMode = 'login',
}) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await login(email, password);
        if (res.success) {
          onClose();
        } else {
          setError(res.error || 'Failed to sign in');
        }
      } else {
        const res = await register(email, password, displayName);
        if (res.success) {
          onClose();
        } else {
          setError(res.error || 'Failed to create account');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-[420px] rounded-3xl bg-[#141414] border border-[#262626] p-7 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-[#888888] hover:text-white hover:bg-[#222222] transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1f1f1f] border border-[#2e2e2e] mb-3">
            <Sparkles size={24} className="text-white" />
          </div>
          <h2 className="text-xl font-medium tracking-tight text-white">
            {mode === 'login' ? 'Welcome back to Talos' : 'Create your Talos account'}
          </h2>
          <p className="text-xs text-[#888888] mt-1.5">
            {mode === 'login'
              ? 'Sign in to access your chat history and personalized memories.'
              : 'Sign up to sync your AI conversations across sessions.'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-950/40 border border-red-800/50 p-3 text-xs text-red-300">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-medium text-[#aaaaaa] mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Shikhar"
                className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-3.5 py-2.5 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-[#555555] transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-[#aaaaaa] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-3.5 py-2.5 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-[#555555] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#aaaaaa] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] px-3.5 py-2.5 text-sm text-white placeholder-[#555555] focus:outline-none focus:border-[#555555] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl bg-white text-black font-medium py-2.5 text-sm hover:bg-[#e6e6e6] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin text-black" />
                <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
              </>
            ) : (
              <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-5 text-center text-xs text-[#888888]">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className="text-white hover:underline cursor-pointer font-medium"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-white hover:underline cursor-pointer font-medium"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
