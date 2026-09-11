"use client";
import { motion } from "framer-motion";
import { Inbox, Users, Building2, Mail } from "lucide-react";
import { Button } from "./button";

const icons = { inbox: Inbox, users: Users, teams: Building2, mail: Mail };

export function EmptyState({
  icon = "inbox",
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof icons;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const Icon = icons[icon];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="py-10 flex flex-col items-center text-center">
      <div className="h-12 w-12 rounded-full bg-muted-gold grid place-items-center text-gold">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display text-base text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
