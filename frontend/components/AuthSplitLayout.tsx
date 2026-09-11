"use client";
import { motion } from "framer-motion";
import { FileText, Sparkles, Users, Layers } from "lucide-react";

export function AuthSplitLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* Left: editorial brand story */}
      <div className="hidden lg:flex relative overflow-hidden bg-ink text-white flex-col justify-between p-12">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center gap-2 text-gold font-display text-xl tracking-tight">
            <Layers className="h-6 w-6" /> CV Screener
          </div>
          <p className="mt-2 text-white/60 text-sm max-w-xs">Turning unstructured talent into structured decisions.</p>
        </motion.div>

        {/* Visual: scattered -> aligned cards */}
        <div className="relative flex-1 flex items-center justify-center py-12">
          <ResumeVisual />
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="space-y-4 max-w-md">
          <blockquote className="font-display text-2xl leading-tight">“Warm and human,<br />but ruthlessly precise.”</blockquote>
          <p className="text-white/60 text-sm leading-relaxed">Multi-tenant hiring infrastructure — orgs, teams, invitations, and RBAC baked in from day one. No mocks, no stubs.</p>
          <div className="flex gap-4 pt-2 text-xs text-white/40">
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Tenant isolated</span>
            <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> RBAC enforced</span>
          </div>
        </motion.div>

        {/* subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      </div>

      {/* Right: form */}
      <div className="flex flex-col bg-paper">
        <div className="lg:hidden p-6 flex items-center gap-2 text-ink font-display text-lg"><Layers className="h-5 w-5 text-gold" /> CV Screener</div>
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="flex-1 flex flex-col justify-center px-6 py-10 lg:px-16 max-w-xl mx-auto w-full"
        >
          <div className="mb-8">
            <h1 className="font-display text-3xl lg:text-[2.2rem] leading-none text-ink">{title}</h1>
            <p className="mt-3 text-slate text-sm leading-relaxed">{subtitle}</p>
          </div>
          {children}
        </motion.div>
        <div className="p-6 text-center text-xs text-slate/60">© 2026 CV Screener — Auth & Org Foundation</div>
      </div>
    </div>
  );
}

function ResumeVisual() {
  const cards = [
    { rot: -8, y: -18, delay: 0.1 },
    { rot: 6, y: 10, delay: 0.2 },
    { rot: -3, y: 38, delay: 0.3 },
  ];
  return (
    <div className="relative w-[320px] h-[220px]">
      {/* alignment guide line animate */}
      <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.6 }} className="absolute left-0 right-0 top-[54%] h-px bg-gold/40 origin-left" />
      {cards.map((c, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 40, rotate: c.rot - 6 }}
          animate={{ opacity: 1, y: c.y, rotate: c.rot, x: i * 18 - 18 }}
          transition={{ type: "spring", stiffness: 90, damping: 14, delay: c.delay }}
          className="absolute left-[60px] w-[190px] rounded-lg bg-white text-ink shadow-[0_12px_32px_rgba(0,0,0,0.25)] border border-white/20 p-3"
          style={{ top: 20 }}
        >
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-ink flex items-center justify-center text-white"><FileText className="h-3.5 w-3.5" /></div>
            <div className="h-2 w-20 bg-ink/10 rounded-full" />
            <div className="ml-auto h-5 w-5 rounded bg-sage/20" />
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-full bg-black/10 rounded-full" />
            <div className="h-1.5 w-[85%] bg-black/10 rounded-full" />
            <div className="h-1.5 w-[65%] bg-black/5 rounded-full" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="h-5 px-2 rounded-full bg-muted-gold text-[10px] leading-5 text-ink/70">Parsed</span>
            <span className="h-5 px-2 rounded-full bg-sage-light text-[10px] leading-5 text-sage">Matched</span>
          </div>
        </motion.div>
      ))}
      {/* floating badge */}
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type:"spring"}} className="absolute -right-2 top-2 bg-gold text-ink text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
        98% structured
      </motion.div>
    </div>
  );
}
