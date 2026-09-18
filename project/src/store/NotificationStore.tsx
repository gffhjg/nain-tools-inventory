import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type NotificationType = 'low-stock' | 'out-of-stock' | 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  dedupeKey?: string;
};

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (type: NotificationType, title: string, message: string, dedupeKey?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const STORAGE_KEY = 'nain-tools-notifications';
const PURGE_KEY = 'nain-tools-notifications-purged-v3';

function loadStored(): Notification[] {
  try {
    if (!localStorage.getItem(PURGE_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(PURGE_KEY, 'true');
      return [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Notification[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function store(notifs: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 50)));
  } catch {
    // ignore quota errors
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(loadStored);

  useEffect(() => {
    store(notifications);
  }, [notifications]);

  const addNotification = useCallback((type: NotificationType, title: string, message: string, dedupeKey?: string) => {
    setNotifications((prev) => {
      // Check if this exact alert already exists (e.g. from previous run)
      const existing = prev.find((n) => (dedupeKey && n.dedupeKey === dedupeKey) || (n.title === title && n.message === message));
      if (existing) {
        // If it already exists and was read by user, keep it read! Do not re-mark unread or add duplicate mark
        return prev;
      }
      const notif: Notification = {
        id: `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dedupeKey,
        type,
        title,
        message,
        timestamp: Date.now(),
        read: false,
      };
      return [notif, ...prev].slice(0, 50);
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, deleteNotification, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
