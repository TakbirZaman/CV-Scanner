"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { api, setTokens } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";

function humanizeError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid email or password")) return "Hmm, that email or password doesn’t match. Check for typos or try resetting your password.";
  if (lower.includes("suspended")) return "This organization has been paused. Contact your admin or platform support for help.";
  if (lower.includes("deactivated")) return "This account has been deactivated. Reach out to your organization admin.";
  if (lower.includes("too many requests")) return "Too many tries — take a 60 second breather, then try again. We’re protecting your account.";
  return msg;
}

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const setUser = useAuthStore(s=>s.setUser);
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string| null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true);
    try {
      const tokens = await api.login({ email, password });
      setTokens(tokens.access_token, tokens.refresh_token);
      const user = await api.me();
      setUser(user);
      qc.invalidateQueries();
      toast(`Welcome back, ${user.full_name.split(" ")[0]}! Taking you to your dashboard.`, "success");
      router.push("/dashboard");
    } catch (ex:any) { setErr(humanizeError(ex.message || "Login failed")); }
    finally { setLoading(false); }
  }

  function fillDemo(){ setEmail("sarah.chen@novatech.io"); setPassword("admin123"); toast("Demo credentials filled — just hit Sign in", "info"); }

  return (
    <AuthSplitLayout title="Welcome back" subtitle="Sign in to your organization. Friendly by default, secure by design — your team is one sign-in away.">
      <form onSubmit={onSubmit} className="space-y-5">
        {err && <Alert variant="destructive">{err}</Alert>}
        <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.05}} className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" />
          <p className="text-xs text-slate">We’re case-insensitive — Alice@Acme.com works just like alice@acme.com.</p>
        </motion.div>
        <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="space-y-2">
          <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs text-slate hover:text-ink underline-offset-4 hover:underline">Forgot?</Link></div>
          <div className="relative">
            <Input id="password" type={show ? "text":"password"} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" className="pr-10" />
            <button type="button" aria-label={show?"Hide password":"Show password"} onClick={()=>setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-black/5 text-slate">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </motion.div>
        <Button type="submit" loading={loading} className="w-full" variant="default">Sign in</Button>
        <button type="button" onClick={fillDemo} className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-gold/30 bg-muted-gold/40 py-2.5 text-sm text-ink hover:bg-muted-gold transition-colors">
          <Sparkles className="h-4 w-4 text-gold" /> Try demo — fill example credentials
        </button>
        <p className="text-center text-sm text-slate">No account? <Link href="/register" className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold">Create organization in 30 seconds</Link></p>
        <p className="text-center text-xs text-slate/70">Stuck? Your org admin can re-invite you, or reach platform support.</p>
      </form>
    </AuthSplitLayout>
  );
}
