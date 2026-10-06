"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => string;
  removeToast: (id: string) => void;
  toast: {
    success: (message: string, title?: string) => string;
    error: (message: string, title?: string) => string;
    warning: (message: string, title?: string) => string;
    info: (message: string, title?: string) => string;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

let globalAddToast: ((toast: Omit<ToastItem, "id">) => string) | null = null;

export const toast = {
  success: (message: string, title?: string) => {
    if (globalAddToast)
      return globalAddToast({ message, title, type: "success" });
    console.log("[Toast Success]", message);
    return "";
  },
  error: (message: string, title?: string) => {
    if (globalAddToast)
      return globalAddToast({ message, title, type: "error" });
    console.error("[Toast Error]", message);
    return "";
  },
  warning: (message: string, title?: string) => {
    if (globalAddToast)
      return globalAddToast({ message, title, type: "warning" });
    console.warn("[Toast Warning]", message);
    return "";
  },
  info: (message: string, title?: string) => {
    if (globalAddToast) return globalAddToast({ message, title, type: "info" });
    console.info("[Toast Info]", message);
    return "";
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({
      message,
      title,
      type = "info",
      duration = 4000,
    }: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, title, type, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast],
  );

  useEffect(() => {
    globalAddToast = addToast;
    return () => {
      globalAddToast = null;
    };
  }, [addToast]);

  const value = {
    toasts,
    addToast,
    removeToast,
    toast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      addToast: () => "",
      removeToast: () => {},
      toast,
    };
  }
  return context;
}

export function Toaster() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((t) => {
        const icons = {
          success: (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          ),
          error: <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />,
          warning: (
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          ),
          info: <Info className="h-5 w-5 text-indigo-600 flex-shrink-0" />,
        };

        const borderStyles = {
          success:
            "border-emerald-200 bg-emerald-50/95 text-emerald-950 shadow-emerald-900/10",
          error: "border-red-200 bg-red-50/95 text-red-950 shadow-red-900/10",
          warning:
            "border-amber-200 bg-amber-50/95 text-amber-950 shadow-amber-900/10",
          info: "border-indigo-200 bg-indigo-50/95 text-indigo-950 shadow-indigo-900/10",
        };

        const type = t.type || "info";

        return (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-md animate-toast-in",
              borderStyles[type],
            )}
          >
            {icons[type]}
            <div className="flex-1 text-sm">
              {t.title && <div className="font-semibold mb-0.5">{t.title}</div>}
              <div className="text-sm/relaxed opacity-90">{t.message}</div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-md -mr-1 -mt-1"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
