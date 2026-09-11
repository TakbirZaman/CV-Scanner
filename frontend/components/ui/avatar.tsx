import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
import * as React from "react";
export const Avatar = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>>(({ className, ...p }, ref)=>(
  <AvatarPrimitive.Root ref={ref} className={cn("relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full", className)} {...p} />
)); Avatar.displayName="Avatar";
export const AvatarImage = AvatarPrimitive.Image;
export const AvatarFallback = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>>(({ className,...p},ref)=>(
  <AvatarPrimitive.Fallback ref={ref} className={cn("flex h-full w-full items-center justify-center rounded-full bg-ink text-white text-sm", className)} {...p} />
)); AvatarFallback.displayName="AvatarFallback";
