'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  bio?: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearMemories: () => Promise<{ success: boolean; message?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('talos_user_v6');
      if (saved) {
        setUser(JSON.parse(saved));
      }
    } catch {}
    refreshUser();
  }, []);

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.user) {
          setUser(data.user);
          localStorage.setItem('talos_user_v6', JSON.stringify(data.user));
          return;
        }
      } else if (res.status === 401 || res.status === 403) {
        // Explicitly unauthenticated
        setUser(null);
        localStorage.removeItem('talos_user_v6');
      }
      // If server unreachable or error status, retain cached user
    } catch {
      // Network/offline error: do not clear user if cached
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setUser(data.user);
        try {
          localStorage.setItem('talos_user_v6', JSON.stringify(data.user));
        } catch {}
        return { success: true };
      }
      return { success: false, error: data.detail || data.error || 'Login failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const register = async (email: string, password: string, displayName?: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setUser(data.user);
        try {
          localStorage.setItem('talos_user_v6', JSON.stringify(data.user));
        } catch {}
        return { success: true };
      }
      return { success: false, error: data.detail || data.error || 'Registration failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const logout = async () => {
    // Best-effort snapshot upload before clearing session (timeout after 2s so logout is never blocked)
    try {
      const uid = user?.id || '';
      await fetch('/api/snapshot/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {
      // Non-fatal — continue logout immediately
    }
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Non-fatal
    } finally {
      setUser(null);
      try {
        localStorage.removeItem('talos_user_v6');
        localStorage.removeItem('talos_active_thread_id_v6');
      } catch {}
      // Clear location state or reload to home cleanly
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  };

  const clearMemories = async () => {
    try {
      const res = await fetch('/api/memories', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message || 'Memories cleared' };
      }
      return { success: false, message: data.detail || 'Failed to clear memories' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        clearMemories,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
