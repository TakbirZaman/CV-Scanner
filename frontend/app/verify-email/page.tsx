"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle"|"loading"|"success"|"error">("idle");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMsg("We can’t find a verification code — open the link from your email (it looks like ...?token=...)."); return; }
    setStatus("loading");
    api.verifyEmail(token).then(()=>{
      setStatus("success");
    }).catch((e:any)=>{
      const m = (e.message||"").toLowerCase();
      if (m.includes("invalid")||m.includes("expired")) setMsg("This link has already been used or expired (2-day, single-use). Don’t worry — you can request a fresh one below.");
      else setMsg(e.message || "Verification failed — let’s try again.");
      setStatus("error");
    });
  }, [token]);

  return (
    <>
      {status === "loading" && <div className="flex items-center gap-3 text-slate"><div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" /> Verifying your email — just a moment…</div>}
      {status === "success" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-sage-light border border-sage/20 p-5 flex gap-3">
            <div className="h-10 w-10 rounded-full bg-sage text-white grid place-items-center shrink-0">✓</div>
            <div><div className="font-medium text-ink">You’re verified — welcome!</div><div className="text-sm text-slate mt-1">Your email is confirmed. You can now sign in and collaborate with your team.</div></div>
          </div>
          <Link href="/login"><Button className="w-full">Continue to sign in →</Button></Link>
          <p className="text-center text-xs text-slate">Tip: bookmark your sign-in page for next time.</p>
        </div>
      )}
      {status === "error" && (
        <div className="space-y-4">
          <Alert variant="destructive">{msg}</Alert>
          <p className="text-sm text-slate leading-relaxed">It happens — links are single-use and expire after 2 days. <Link href="/login" className="font-medium underline decoration-gold decoration-2 underline-offset-4">Back to sign in</Link> or request a new link below. No worries.</p>
          <form onSubmit={async (e)=>{e.preventDefault(); const form=(e.target as HTMLFormElement); const email=(form.elements.namedItem("email") as HTMLInputElement).value; try{await api.resendVerification(email); setMsg("If that email is registered and unverified, a new link has been sent — check inbox & spam!"); } catch(ex:any){ setMsg(ex.message)}}} className="flex gap-2">
            <input name="email" type="email" placeholder="you@company.com" required className="flex-1 rounded-md border border-borderhair px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30" />
            <Button type="submit" variant="outline">Send new link</Button>
          </form>
        </div>
      )}
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthSplitLayout title="Let’s verify you — quick & friendly" subtitle="One click from your email confirms it’s really you. Single-use, 2-day link — safe and simple.">
      <Suspense fallback={<div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />}>
        <VerifyInner />
      </Suspense>
    </AuthSplitLayout>
  );
}
