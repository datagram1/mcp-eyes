'use client';

import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function Toast({ messages, onDismiss }: ToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(message.id), 300);
    }, 4700);

    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(message.id), 300);
  };

  const bgColor = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
  }[message.type];

  const icon = {
    success: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }[message.type];

  return (
    <div
      className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
      style={{ animation: isExiting ? undefined : 'slideIn 0.3s ease-out' }}
    >
      {icon}
      <span className="flex-1 text-sm font-medium">{message.text}</span>
      <button
        onClick={handleDismiss}
        className="text-white/70 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Hook for easy toast management
export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setMessages((prev) => [...prev, { id, type, text }]);
  };

  const dismissToast = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  };

  return { messages, showToast, dismissToast };
}
