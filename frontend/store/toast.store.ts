'use client';

import { create } from 'zustand';
import { playNotificationSound } from '@/lib/notificationSound';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  durationMs?: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((s) => ({ toasts: [...s.toasts, { id, durationMs: 4000, ...toast }] }));
    // Play the arrival chime (respects the user's mute preference internally).
    playNotificationSound(toast.type);
    if ((toast.durationMs ?? 4000) > 0) {
      setTimeout(() => get().dismiss(id), toast.durationMs ?? 4000);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Convenience helpers — use anywhere, no hook required.
export const toast = {
  success: (message: string, title?: string) => useToastStore.getState().push({ type: 'success', message, title }),
  error:   (message: string, title?: string) => useToastStore.getState().push({ type: 'error',   message, title }),
  info:    (message: string, title?: string) => useToastStore.getState().push({ type: 'info',    message, title }),
  warning: (message: string, title?: string) => useToastStore.getState().push({ type: 'warning', message, title }),
};
