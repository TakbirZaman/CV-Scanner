"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Check } from "lucide-react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { api, setTokens } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useToast } from "@/lib/toast";

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore(s=>s.setUser);
  const { toast } = useToast();
  const [form, setForm] = useState({ organization_name: "", full_name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const update = (k: string, v: string) => setForm(f=>({ ...f, [k]: v }));

  const strength = useMemo(()=>{
    const p = form.password;
    if (!p) return { label: "", color: "", width: "0%" };
    const bytes = new TextEncoder().encode(p).length;
    if (bytes > 72) return { label: "Too long — over 72 bytes (emoji count as 4)", color: "bg-red-500", width: "100%" };
    if (p.length < 8) return { label: "Keep going — 8 characters minimum", color: "bg-gold", width: "35%" };
    if (p.length < 11) return { label: "Good — add a bit more for extra security", color: "bg-gold", width: "60%" };
    return { label: "Great password — you’re all set!", color: "bg-sage", width: "100%" };
  }, [form.password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true);
    try {
      await api.register(form);
      const tokens = await api.login({ email: form.email, password: form.password });
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await api.me();
      setUser(me);
      toast(`Welcome, ${me.full_name.split(" ")[0]}! Your organization “${form.organization_name}” is ready.`, "success");
      router.push("/dashboard");
    } catch (ex:any) {
      const msg = ex.message || "Registration failed";
      if (msg.includes("409") || msg.toLowerCase().includes("already exists")) setErr("That email already has an account — try signing in instead, or use a different email.");
      else if (msg.includes("422") || msg.toLowerCase().includes("72 bytes")) setErr("That password is a bit too long (72 byte limit). Try shortening it — emoji count as 4 bytes each.");
      else if (msg.toLowerCase().includes("too many requests")) setErr("Easy — you’ve tried a few times. Wait a minute and try again.");
      else setErr(msg);
    } finally { setLoading(false); }
  }

  return (
    <AuthSplitLayout title="Create your organization" subtitle="You’ll be the admin — invite your team right after. Takes 30 seconds, no credit card.">
      <form onSubmit={onSubmit} className="space-y-4">
        {err && <Alert variant="destructive">{err}</Alert>}
        <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.05}} className="space-y-2">
          <Label htmlFor="org">Organization name</Label>
          <Input id="org" placeholder="Acme Recruiting" value={form.organization_name} onChange={e=>update("organization_name", e.target.value)} required minLength={2} />
          <p className="text-xs text-slate">We’ll make your URL-friendly name automatically — Acme Recruiting → acme-recruiting.</p>
        </motion.div>
        <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.08}} className="space-y-2">
          <Label htmlFor="name">Your full name</Label>
          <Input id="name" placeholder="Alice Admin" value={form.full_name} onChange={e=>update("full_name", e.target.value)} required minLength={2} />
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.11}} className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" placeholder="alice@acme.com" value={form.email} onChange={e=>update("email", e.target.value)} required />
          </motion.div>
          <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.14}} className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={show ? "text":"password"} placeholder="At least 8 characters" value={form.password} onChange={e=>update("password", e.target.value)} required minLength={8} className="pr-10" />
              <button type="button" aria-label={show?"Hide":"Show"} onClick={()=>setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-black/5 text-slate">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </motion.div>
        </div>
        {form.password && (
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden"><div className={`h-full transition-all ${strength.color}`} style={{ width: strength.width }} /></div>
            <p className="text-xs text-slate flex items-center gap-1">{strength.label.includes("Great") && <Check className="h-3 w-3 text-sage" />} {strength.label}</p>
          </div>
        )}
        <p className="text-xs text-slate leading-relaxed">Tip: a longer passphrase (“correct horse battery staple”) is both friendlier and stronger than a short complex one.</p>
        <Button type="submit" loading={loading} variant="gold" className="w-full">Create organization & continue →</Button>
        <p className="text-center text-sm text-slate">Already have an account? <Link href="/login" className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4">Sign in</Link></p>
      </form>
    </AuthSplitLayout>
  );
}
