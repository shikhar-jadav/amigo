'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { TalosChatApp } from '@/components/chat/TalosChatApp';

export default function ThreadPage() {
  const params = useParams();
  const threadId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : null;

  return <TalosChatApp initialThreadId={threadId} />;
}
