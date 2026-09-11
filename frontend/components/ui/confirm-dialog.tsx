"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "default",
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40" />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.99 }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-md rounded-xl bg-white p-6 shadow-2xl border border-borderhair z-50"
              >
                <div className="flex gap-3">
                  <div className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${variant === "destructive" ? "bg-red-50 text-red-600" : "bg-muted-gold text-gold"}`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <Dialog.Title className="font-display text-base text-ink">{title}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate leading-relaxed">{description}</Dialog.Description>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button variant={variant === "destructive" ? "default" : "gold"} loading={loading} onClick={onConfirm} className={variant === "destructive" ? "bg-red-600 hover:bg-red-700 text-white" : ""}>
                    {confirmLabel}
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
