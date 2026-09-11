"use client";
import { useState } from "react";
import Link from "next/link";
import { Mail, ShieldCheck, ArrowLeft } from "lucide-react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api";

export default function ForgotPasswordPage(){
  const [email,setEmail]=useState(""); const [done,setDone]=useState(false); const [loading,setLoading]=useState(false); const [err,setErr]=useState<string|null>(null);
  async function onSubmit(e:React.FormEvent){ e.preventDefault(); setErr(null); setLoading(true); try{ await api.forgotPassword(email); setDone(true);}catch(ex:any){ setErr(ex.message?.includes("too many") ? "You’ve requested a few times — wait a minute and try again. We’re protecting your inbox." : ex.message);} finally{ setLoading(false);} }
  return (
    <AuthSplitLayout title="Forgot your password? No worries." subtitle="We’ll send a friendly, single-use link that’s good for 1 hour. Everyone gets the same message, so your email stays private.">
      {done ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-sage-light border border-sage/20 p-5 flex gap-3">
            <div className="h-10 w-10 rounded-full bg-sage text-white grid place-items-center shrink-0"><Mail className="h-5 w-5" /></div>
            <div>
              <div className="font-medium text-ink">Check your inbox — and spam folder</div>
              <div className="text-sm text-slate leading-relaxed mt-1">If <b>{email}</b> is registered, we just sent a reset link. It’s single-use and expires in 1 hour. No email? You’re still safe — we never reveal who’s registered.</div>
            </div>
          </div>
          <div className="rounded-lg bg-muted-gold/50 border border-gold/20 p-3 flex gap-2 text-sm text-ink"><ShieldCheck className="h-4 w-4 text-gold shrink-0 mt-0.5" /> Tip: after you reset, we’ll sign you out everywhere for safety — just sign back in with your new password.</div>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {err && <Alert variant="destructive">{err}</Alert>}
          <div className="space-y-2"><Label htmlFor="email">Your work email</Label><Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" /><p className="text-xs text-slate">We’ll handle it gently — same message whether the email exists, for your privacy.</p></div>
          <Button type="submit" loading={loading} className="w-full">Send reset link — it takes ~10 seconds</Button>
          <p className="text-center text-xs text-slate">Remembered? <Link href="/login" className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4">Back to sign in</Link> · Didn’t get it? Check spam, or wait a minute and try again.</p>
        </form>
      )}
    </AuthSplitLayout>
  );
}
