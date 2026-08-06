import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type NotificationType = 'low-stock' | 'out-of-stock' | 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
};

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (type: NotificationType, title: string, message: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const STORAGE_KEY = 'nain-tools-notifications';

function loadStored(): Notification[] {
  try {
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

  const addNotification = useCallback((type: NotificationType, title: string, message: string) => {
    const notif: Notification = {
      id: `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [notif, ...prev].slice(0, 50));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll }}
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
