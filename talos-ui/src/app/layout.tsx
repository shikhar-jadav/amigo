import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Talos Agent v6',
  description: 'Enterprise Multi-Tier AI Agent Platform with Gated LLM Relay & LangGraph ReAct',
};

import { AuthProvider } from '@/context/AuthContext';
import { SyncProvider } from '@/context/SyncContext';
import { ProactiveProvider } from '@/context/ProactiveContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-slate-950 text-slate-100 antialiased overflow-hidden">
        <AuthProvider>
          <SyncProvider>
            <ProactiveProvider>{children}</ProactiveProvider>
          </SyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
