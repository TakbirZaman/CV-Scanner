import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
export function Alert({ className, variant="default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default"|"destructive"|"success" }) {
  const variants: Record<string,string> = {
    default: "bg-muted-gold border-gold/30 text-ink",
    destructive: "bg-red-50 border-red-200 text-red-800",
    success: "bg-sage-light border-sage/30 text-sage",
  };
  return <motion.div initial={{ opacity:0, y:-6}} animate={{ opacity:1,y:0}} className={cn("rounded-md border px-4 py-3 text-sm", variants[variant], className)} {...(props as any)} />;
}
