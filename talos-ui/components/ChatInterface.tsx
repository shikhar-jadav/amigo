'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, MessageData } from './ChatMessage';
import { Composer } from './Composer';
import { ToolEventData } from './StepLine';

interface ChatInterfaceProps {
  currentSessionId: string;
  initialMessages?: MessageData[];
  onFirstMessageSent?: (threadId: string, firstPrompt: string, userMsg: MessageData, assistantMsg: MessageData) => void;
  onUpdateMessages?: (threadId: string, messages: MessageData[]) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  currentSessionId,
  initialMessages = [],
  onFirstMessageSent,
  onUpdateMessages,
}) => {
  const [messages, setMessages] = useState<MessageData[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync state if initialMessages changes externally
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendPrompt = async (promptText: string, model: string) => {
    if (!promptText.trim() || isStreaming) return;

    const userMsgId = `msg-user-${Date.now()}`;
    const assistantMsgId = `msg-assistant-${Date.now()}`;

    const initialUserMsg: MessageData = { id: userMsgId, role: 'user', content: promptText };
    const initialAssistantMsg: MessageData = { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true, toolsExecuted: [] };

    const newMessages: MessageData[] = [
      ...messages,
      initialUserMsg,
      initialAssistantMsg,
    ];

    setMessages(newMessages);
    setIsStreaming(true);

    const isFirstTurn = messages.length === 0;
    if (isFirstTurn && onFirstMessageSent) {
      onFirstMessageSent(currentSessionId, promptText, initialUserMsg, initialAssistantMsg);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, thread_id: currentSessionId, model }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Failed to stream response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available');

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let activeTools: ToolEventData[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'TEXT_DELTA') {
                accumulatedText += data.delta;
              } else if (data.type === 'TOOL_CALL') {
                activeTools.push({
                  toolName: data.toolName,
                  args: data.args,
                  status: 'running',
                });
              } else if (data.type === 'TOOL_CALL_RESULT') {
                const existing = activeTools.find(
                  (t) => t.toolName === data.toolName || t.status === 'running'
                );
                if (existing) {
                  existing.output = data.output;
                  existing.status = 'completed';
                }
              }
            } catch (err) {
              // Ignore non-json lines
            }

            setMessages((prev) => {
              const updated = prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: accumulatedText,
                      toolsExecuted: [...activeTools],
                    }
                  : m
              );
              if (onUpdateMessages) {
                onUpdateMessages(currentSessionId, updated);
              }
              return updated;
            });
          }
        }
      }

      setMessages((prev) => {
        const finalMsgs = prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m));
        if (onUpdateMessages) {
          onUpdateMessages(currentSessionId, finalMsgs);
        }
        return finalMsgs;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const errorMsgs = prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `Error: ${err.message}`,
                isStreaming: false,
              }
            : m
        );
        if (onUpdateMessages) {
          onUpdateMessages(currentSessionId, errorMsgs);
        }
        return errorMsgs;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-[#000000]">
      {/* Top minimal bar */}
      <header className="flex h-11 shrink-0 items-center justify-center px-4 select-none">
        <div className="text-[12px] text-[#737373] flex items-center gap-1.5">
          <span>Free plan</span>
          <span>&middot;</span>
          <span className="text-[#a3a3a3] hover:text-white cursor-pointer transition-colors font-medium">
            Upgrade
          </span>
        </div>
      </header>

      {/* When NO messages: Centered empty screen with greetings & centered input box */}
      {!hasMessages ? (
        <div className="flex-1 flex flex-col items-center justify-center -mt-16 px-4">
          {/* Greeting: Orange star asterisk + 'Up late, Shikhar?' in serif font */}
          <div className="flex items-center justify-center gap-3.5 mb-7 select-none">
            <svg
              className="w-7 h-7 text-[#d97706]"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2L13.5 8.5L20 7L15.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L8.5 12L4 7L10.5 8.5L12 2Z" />
            </svg>
            <h1
              className="text-[34px] md:text-[38px] text-[#ededed] font-normal tracking-tight font-serif"
              style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", serif' }}
            >
              Up late, Shikhar?
            </h1>
          </div>

          {/* Centered Composer Card */}
          <div className="w-full max-w-[720px]">
            <Composer
              onSend={handleSendPrompt}
              isStreaming={isStreaming}
              isCentered={true}
            />
          </div>
        </div>
      ) : (
        /* When user enters input: The chat area shows messages, and the chat box moves to the bottom */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto pt-4 pb-2">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer docked at bottom */}
          <div className="shrink-0 bg-[#000000]">
            <Composer
              onSend={handleSendPrompt}
              isStreaming={isStreaming}
              isCentered={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};
