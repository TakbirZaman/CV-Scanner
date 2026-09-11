"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTokens } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();
  useEffect(()=>{
    const { access } = getTokens();
    router.replace(access ? "/dashboard" : "/login");
  },[router]);
  return <div className="min-h-screen grid place-items-center bg-paper"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>;
}
