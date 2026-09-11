"use client";
import { Suspense, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck, Check } from "lucide-react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/api";

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const strength = useMemo(()=>{
    if (!pwd) return { label: "", width: "0%", color: "" };
    const bytes = new TextEncoder().encode(pwd).length;
    if (bytes > 72) return { label: "A bit too long — over 72 bytes (emoji = 4 bytes)", width: "100%", color: "bg-red-500" };
    if (pwd.length < 8) return { label: "Keep going — 8 characters minimum", width: "35%", color: "bg-gold" };
    if (pwd.length < 11) return { label: "Good — a little longer is even friendlier & stronger", width: "65%", color: "bg-gold" };
    return { label: "Lovely — strong and friendly!", width: "100%", color: "bg-sage" };
  }, [pwd]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (pwd !== confirm) { setErr("Those two passwords don’t match — try typing them again together."); return; }
    if (pwd.length < 8) { setErr("Password needs to be at least 8 characters — a short phrase is great."); return; }
    if (!token) { setErr("We can’t see a reset link. Please open the link from your email again — it looks like ...?token=..."); return; }
    setLoading(true);
    try {
      await api.resetPassword({ token, new_password: pwd });
      setDone(true);
      setTimeout(()=>router.push("/login"), 1500);
    } catch (ex:any) {
      const m = (ex.message||"").toLowerCase();
      if (m.includes("invalid")||m.includes("expired")) setErr("This link has expired or was already used — it’s single-use and good for 1 hour. Request a fresh one from the sign-in page.");
      else if (m.includes("72")) setErr("That password is a touch too long — try a shorter phrase (emoji count as 4 bytes each).");
      else setErr(ex.message || "Reset failed — let’s try again.");
    }
    finally { setLoading(false); }
  }

  return (
    <>
      {done ? (
        <div className="rounded-xl bg-sage-light border border-sage/20 p-5 flex gap-3">
          <div className="h-10 w-10 rounded-full bg-sage text-white grid place-items-center shrink-0"><Check className="h-5 w-5" /></div>
          <div><div className="font-medium text-ink">Password updated — you’re all set!</div><div className="text-sm text-slate mt-1">We signed you out everywhere for safety. Redirecting you to sign in with your new password…</div></div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {err && <Alert variant="destructive">{err}</Alert>}
          {!token && <Alert variant="destructive">We don’t see a token here. Open the link from your email — it should look like <span className="font-mono">/reset-password?token=...</span></Alert>}
          <div className="space-y-2">
            <Label htmlFor="pwd">New password</Label>
            <div className="relative">
              <Input id="pwd" type={show?"text":"password"} value={pwd} onChange={e=>setPwd(e.target.value)} required minLength={8} placeholder="A friendly, memorable phrase" className="pr-10" />
              <button type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide":"Show"} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-black/5 text-slate">{show?<EyeOff className="h-4 w-4" />:<Eye className="h-4 w-4" />}</button>
            </div>
            {pwd && <><div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden"><div className={`h-full transition-all ${strength.color}`} style={{ width: strength.width }} /></div><p className="text-xs text-slate">{strength.label}</p></>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm it</Label>
            <Input id="confirm" type={show?"text":"password"} value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} placeholder="Type it again to be sure" />
            {confirm && pwd!==confirm && <p className="text-xs text-red-600">Doesn’t match yet — keep typing.</p>}
            {confirm && pwd===confirm && pwd.length>=8 && <p className="text-xs text-sage flex items-center gap-1"><Check className="h-3 w-3" /> They match — nice!</p>}
          </div>
          <div className="rounded-lg bg-paper border border-borderhair p-3 flex gap-2 text-xs text-slate"><ShieldCheck className="h-4 w-4 text-sage shrink-0" /> After you update, we’ll sign you out on all devices — just sign back in once. Keeps your account cozy and safe.</div>
          <Button type="submit" loading={loading} className="w-full">Update password & sign in again</Button>
          <p className="text-center text-sm text-slate"><Link href="/login" className="underline decoration-gold decoration-2 underline-offset-4">Back to sign in</Link> · <Link href="/forgot-password" className="underline decoration-gold decoration-2 underline-offset-4">Need a new link?</Link></p>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthSplitLayout title="Choose a new password" subtitle="Make it friendly and memorable — a phrase you’ll smile to type. We’ll keep it safe with bcrypt.">
      <Suspense fallback={<div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />}>
        <ResetInner />
      </Suspense>
    </AuthSplitLayout>
  );
}
