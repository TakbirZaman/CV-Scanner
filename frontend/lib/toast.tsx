"use client";
import { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type Toast = { id: number; message: string; variant: "success" | "error" | "info" };
type Ctx = { toast: (msg: string, variant?: Toast["variant"]) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

let nextId = 1;
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, variant: Toast["variant"] = "info") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg border backdrop-blur ${
                t.variant === "success"
                  ? "bg-sage text-white border-sage/20"
                  : t.variant === "error"
                  ? "bg-white text-red-800 border-red-200"
                  : "bg-ink text-white border-white/10"
              }`}
            >
              {t.variant === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : t.variant === "error" ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
              <span className="leading-tight">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
