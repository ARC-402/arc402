import { useState, useCallback } from "react";
import type { ToastData, ToastVariant } from "./components/Toast.js";

let _nextId = 0;

interface UseNotificationsResult {
  toasts: ToastData[];
  push: (message: string, variant?: ToastVariant, duration?: number) => void;
  dismiss: (id: string) => void;
}

export function useNotifications(): UseNotificationsResult {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const push = useCallback(
    (message: string, variant: ToastVariant = "info", duration?: number) => {
      const id = `toast-${++_nextId}`;
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}
