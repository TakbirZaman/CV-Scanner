import * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, variant="default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default"|"gold"|"sage"|"slate" }) {
  const map: Record<string,string> = {
    default: "bg-ink text-white",
    gold: "bg-gold text-ink",
    sage: "bg-sage text-white",
    slate: "bg-slate/10 text-slate border border-slate/20",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", map[variant], className)} {...props} />;
}
