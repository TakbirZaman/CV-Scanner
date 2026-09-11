"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-ink text-white hover:bg-ink/90 shadow-sm",
        gold: "bg-gold text-ink hover:bg-gold-hover shadow-sm",
        ghost: "bg-transparent hover:bg-black/5 text-ink",
        outline: "border border-borderhair bg-white hover:bg-paper text-ink",
      },
      size: { default: "h-10 px-5 py-2", sm: "h-8 px-3", lg: "h-11 px-8", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart">, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -0.5 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={loading || props.disabled}
      {...(props as HTMLMotionProps<"button">)}
    >
      {loading && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </motion.button>
  );
}
