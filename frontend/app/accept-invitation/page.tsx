"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, MailCheck, Heart, ShieldCheck } from "lucide-react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { api, setTokens } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/lib/toast";

function AcceptInner() {
  const params = useSearchParams();
  const router = useRouter();
  const setUser = useAuthStore(s=>s.setUser);
  const { toast } = useToast();
  const token = params.get("token") ?? "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (!token) { setErr("We can’t find your invite link — please open the link from your email (it looks like …?token=...)."); return; }
    if (fullName.trim().length < 2) { setErr("Tell us your name — at least 2 characters, so teammates know who you are."); return; }
    setLoading(true);
    try {
      const tokens = await api.acceptInvitation({ token, full_name: fullName, password });
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await api.me();
      setUser(me);
      toast(`Welcome to the team, ${me.full_name.split(" ")[0]}! We’ve saved your spot.`, "success");
      router.push("/dashboard");
    } catch (ex:any) {
      const m = (ex.message||"").toLowerCase();
      if (m.includes("invalid")||m.includes("already used")) setErr("This invitation has already been used or expired (7-day, single-use). Ask your Admin to re-invite you — it safely replaces the old link.");
      else if (m.includes("already exists")) setErr("You already have an account with this email — try signing in instead.");
      else if (m.includes("suspended")) setErr("This organization is paused — ask your Admin for help.");
      else setErr(ex.message || "Invitation acceptance failed — let’s try again.");
    }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {err && <Alert variant="destructive">{err}</Alert>}
      {!token && <Alert variant="destructive">We don’t see an invite code. Open the invitation link from your email — it should look like <span className="font-mono">/accept-invitation?token=...</span></Alert>}
      {token && (
        <div className="rounded-lg bg-sage-light border border-sage/20 p-3 flex gap-2 text-sm text-sage">
          <MailCheck className="h-4 w-4 shrink-0 mt-0.5" /> Good news: your email is already verified via this invite — no extra steps.
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Your full name</Label>
        <Input id="name" placeholder="Bob Recruiter — how teammates will see you" value={fullName} onChange={e=>setFullName(e.target.value)} required minLength={2} autoComplete="name" />
        <p className="text-xs text-slate">This is how you’ll appear on the team roster.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pwd">Create a password</Label>
        <div className="relative">
          <Input id="pwd" type={show?"text":"password"} placeholder="A friendly, memorable phrase" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} className="pr-10" autoComplete="new-password" />
          <button type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide":"Show"} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-black/5 text-slate">{show?<EyeOff className="h-4 w-4" />:<Eye className="h-4 w-4" />}</button>
        </div>
        <p className="text-xs text-slate flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-sage" /> We’ll keep it safe — bcrypt, 72-byte limit. Emoji count as 4 bytes.</p>
      </div>
      <Button type="submit" loading={loading} variant="gold" className="w-full">Join your team <Heart className="h-4 w-4 ml-1" /></Button>
      <p className="text-center text-xs text-slate">By joining, you’ll be part of a tenant-isolated workspace — your team’s data stays with your team.</p>
      <p className="text-center text-sm text-slate">Already have an account? <Link href="/login" className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4">Sign in</Link></p>
    </form>
  );
}

export default function AcceptInvitationPage() {
  return (
    <AuthSplitLayout title="You’re invited — we saved you a seat!" subtitle="One click from your email, and you’re in. Just tell us your name and choose a password — we’ll handle the rest.">
      <Suspense fallback={<div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />}>
        <AcceptInner />
      </Suspense>
    </AuthSplitLayout>
  );
}
