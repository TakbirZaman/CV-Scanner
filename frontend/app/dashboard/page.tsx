"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Users, Mail, Shield, LogOut, Plus, Layers, Clock, Check, Sparkles, ArrowRight, Heart } from "lucide-react";
import { api, clearTokens, getTokens } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/lib/toast";

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}
function prettyRole(r: string) {
  const map: Record<string,string> = { super_admin: "Super Admin", org_admin: "Admin", recruiter: "Recruiter", hiring_manager: "Hiring Manager" };
  return map[r] ?? r;
}
function prettyAction(a: string) {
  const map: Record<string,string> = {
    "team.create": "Created a team",
    "invitation.create": "Sent an invitation",
    "invitation.accept": "A teammate joined",
    "member.update": "Updated a teammate",
    "auth.login": "Signed in",
    "org.register": "Organization created",
    "org.status_change": "Organization status changed",
  };
  return map[a] ?? a.replace(".", " · ");
}

export default function DashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, setUser, logout } = useAuthStore();
  const { toast } = useToast();
  const [hydrated, setHydrated] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("recruiter");
  const [teamName, setTeamName] = useState("");
  const [pendingMember, setPendingMember] = useState<{ id: string; name: string; is_active: boolean } | null>(null);
  const teamInputRef = useRef<HTMLInputElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ setHydrated(true); }, []);
  useEffect(()=>{
    if (!hydrated) return;
    const { access } = getTokens();
    if (!access) { router.replace("/login"); return; }
    if (!user) {
      api.me().then(setUser).catch(()=>{ clearTokens(); router.replace("/login"); });
    }
  }, [hydrated, user, setUser, router]);

  const orgQ = useQuery({ queryKey: ["org"], queryFn: api.getOrg, enabled: !!user });
  const membersQ = useQuery({ queryKey: ["members"], queryFn: api.listMembers, enabled: !!user });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: api.listTeams, enabled: !!user });
  const invitesQ = useQuery({ queryKey: ["invites"], queryFn: api.listInvitations, enabled: !!user && user?.role === "org_admin" });
  const auditQ = useQuery({ queryKey: ["audit"], queryFn: api.listAuditLogs, enabled: !!user && user?.role === "org_admin" });

  const createTeam = useMutation({
    mutationFn: (name:string)=>api.createTeam(name),
    onSuccess: ()=>{ qc.invalidateQueries({queryKey:["teams"]}); qc.invalidateQueries({queryKey:["audit"]}); setTeamName(""); toast("Team created — your team now has a home.", "success"); },
    onError: (e:any)=> toast(e.message || "Couldn’t create team — try a different name?", "error"),
  });
  const invite = useMutation({
    mutationFn: ()=>api.invite({ email: inviteEmail, role: inviteRole }),
    onSuccess: ()=>{ qc.invalidateQueries({queryKey:["invites"]}); qc.invalidateQueries({queryKey:["audit"]}); toast(`Invitation sent to ${inviteEmail} as ${prettyRole(inviteRole)} — they’ll get a 7-day link.`, "success"); setInviteEmail(""); },
    onError: (e:any)=> toast(e.message?.includes("409") ? "That email is already on your team." : e.message, "error"),
  });

  if (!hydrated || !user) return <div className="min-h-screen grid place-items-center bg-paper"><div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" /></div>;

  const isOrgAdmin = user.role === "org_admin" || user.role === "super_admin";
  const memberCount = membersQ.data?.length ?? 0;
  const teamCount = teamsQ.data?.length ?? 0;
  const inviteCount = invitesQ.data?.length ?? 0;
  const onboardingDone = memberCount > 1 && teamCount > 0;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 bg-paper/80 backdrop-blur border-b border-borderhair">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-ink grid place-items-center text-white"><Layers className="h-4 w-4" /></div>
            <div>
              <div className="font-display font-semibold text-ink leading-none flex items-center gap-2">
                {orgQ.isLoading ? <Skeleton className="h-4 w-32" /> : orgQ.data?.name ?? "Your organization"}
                {orgQ.data?.status === "suspended" && <Badge variant="slate">Paused — contact support</Badge>}
              </div>
              <div className="text-xs text-slate">{orgQ.data?.slug ? `${orgQ.data.slug} · ${orgQ.data.status}` : "Loading workspace…"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-ink flex items-center gap-1.5 justify-end"><Heart className="h-3.5 w-3.5 text-gold" /> {user.full_name}</div>
              <div className="text-xs text-slate flex items-center gap-1.5 justify-end"><Badge variant={isOrgAdmin?"gold":"sage"}>{prettyRole(user.role)}</Badge> {user.is_email_verified ? "✓ email verified" : "• verify your email to unlock invites"}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={()=>{ logout(); toast("Signed out — see you next time!", "info"); router.push("/login"); }}><LogOut className="h-4 w-4 mr-1.5" /> Sign out</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Warm welcome + onboarding checklist */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-gradient-to-br from-ink to-[#1e2e4a] text-white p-6 md:p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="font-display text-xl md:text-2xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-gold" /> {greeting(user.full_name)}!</h1>
            <p className="mt-1.5 text-white/70 text-sm leading-relaxed max-w-xl">
              {onboardingDone ? "Your workspace is humming — invite more teammates or create another team to keep momentum." : "Let’s get your team set up — 2 quick steps and you’re ready to hire."}
            </p>
          </div>
          {!onboardingDone && isOrgAdmin && (
            <div className="bg-white/10 rounded-lg p-4 min-w-[260px] border border-white/10">
              <div className="text-xs uppercase tracking-widest text-white/60">Getting started</div>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center gap-2">{teamCount>0 ? <span className="h-5 w-5 rounded-full bg-sage grid place-items-center"><Check className="h-3 w-3 text-white" /></span> : <span className="h-5 w-5 rounded-full border border-white/30" />} <span className={teamCount>0?"text-white":"text-white/70"}>Create your first team</span></div>
                <div className="flex items-center gap-2">{memberCount>1 ? <span className="h-5 w-5 rounded-full bg-sage grid place-items-center"><Check className="h-3 w-3 text-white" /></span> : <span className="h-5 w-5 rounded-full border border-white/30" />} <span className={memberCount>1?"text-white":"text-white/70"}>Invite a teammate</span></div>
                <div className="flex items-center gap-2 opacity-60"><span className="h-5 w-5 rounded-full border border-white/20" /> <span>Review candidates (coming next)</span></div>
              </div>
              <div className="mt-3 h-1.5 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gold transition-all" style={{ width: `${(teamCount>0?50:0)+(memberCount>1?50:0)}%`}} /></div>
            </div>
          )}
        </motion.div>

        {/* Stats — friendlier copy */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-borderhair border border-borderhair rounded-xl bg-white overflow-hidden">
          <div className="p-5">
            <div className="text-xs uppercase tracking-widest text-slate flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Teammates</div>
            <div className="mt-2 font-display text-2xl text-ink">{membersQ.isLoading ? <Skeleton className="h-7 w-12" /> : memberCount}</div>
            <div className="text-xs text-slate">{memberCount===1 ? "Just you for now — invite someone to collaborate" : "People who can hire together"}</div>
          </div>
          <div className="p-5">
            <div className="text-xs uppercase tracking-widest text-slate flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Teams</div>
            <div className="mt-2 font-display text-2xl text-ink">{teamsQ.isLoading ? <Skeleton className="h-7 w-12" /> : teamCount}</div>
            <div className="text-xs text-slate">{teamCount===0 ? "Group people by hiring pod" : "Organized workspaces for focus"}</div>
          </div>
          <div className="p-5">
            <div className="text-xs uppercase tracking-widest text-slate flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Pending invites</div>
            <div className="mt-2 font-display text-2xl text-ink">{invitesQ.isLoading ? <Skeleton className="h-7 w-12" /> : inviteCount}</div>
            <div className="text-xs text-slate">Teammates who haven’t joined yet</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
          {/* Left: Team roster + audit */}
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-ink flex items-center gap-2"><Users className="h-4 w-4 text-gold" /> Your team</h2>
                <span className="text-xs text-slate">{memberCount} {memberCount===1?"person":"people"} · all in {orgQ.data?.name ?? "this org"}</span>
              </div>
              <div className="mt-4 divide-y divide-borderhair border-t border-borderhair">
                {membersQ.isLoading && <div className="py-8 space-y-3">{[0,1].map(i=><Skeleton key={i} className="h-12 w-full" />)}</div>}
                {membersQ.data?.map(m=>(
                  <div key={m.id} className="py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-ink text-white grid place-items-center text-sm font-medium shrink-0">{m.full_name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink truncate">{m.full_name} <span className="text-slate font-normal">· {m.email}</span> {m.id===user.id && <span className="ml-1 text-xs bg-muted-gold px-1.5 py-0.5 rounded">you</span>}</div>
                        <div className="text-xs text-slate flex items-center gap-1.5 mt-1 flex-wrap"><Badge variant={m.role==="org_admin"?"gold": m.role==="super_admin"?"slate":"sage"}>{prettyRole(m.role)}</Badge> {m.is_active ? <span className="text-sage inline-flex items-center gap-1"><Check className="h-3 w-3" /> active</span> : <span className="text-red-600">paused</span>} · {m.is_email_verified ? "email verified" : "needs email verify"}</div>
                      </div>
                    </div>
                    {isOrgAdmin && m.id !== user.id && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" title={`Change ${m.full_name}’s role`} onClick={async()=>{
                          const newRole = m.role === "recruiter" ? "hiring_manager" : "recruiter";
                          try{ await api.updateMember(m.id, { role: newRole }); qc.invalidateQueries({queryKey:["members"]}); qc.invalidateQueries({queryKey:["audit"]}); toast(`${m.full_name} is now ${prettyRole(newRole)}.`, "success"); } catch(e:any){ toast(e.message, "error"); }
                        }}>Switch to {m.role==="recruiter"?"Manager":"Recruiter"}</Button>
                        <Button size="sm" variant="ghost" onClick={()=> setPendingMember({ id: m.id, name: m.full_name, is_active: m.is_active })}>
                          {m.is_active ? "Pause" : "Resume"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {membersQ.data?.length===0 && <EmptyState icon="users" title="Just you here for now" description="Invite a teammate — they’ll get a friendly email with a 7-day link. Re-inviting the same address safely replaces the old link." actionLabel="Invite your first teammate" onAction={()=>inviteInputRef.current?.focus()} />}
              </div>
              <p className="mt-3 text-xs text-slate">Tip: pausing someone signs them out everywhere — useful for offboarding.</p>
            </Card>

            {isOrgAdmin && (
              <Card className="p-6">
                <h3 className="font-display text-sm uppercase tracking-widest text-slate flex items-center gap-2"><Clock className="h-4 w-4" /> What’s happened lately</h3>
                <p className="text-xs text-slate mt-1">Friendly timeline — who did what, when. Same data as compliance audit, in plain language.</p>
                <div className="mt-3 divide-y divide-borderhair border-t">
                  {auditQ.isLoading && <div className="py-6 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>}
                  {auditQ.data?.slice(0,8).map(a=>(
                    <div key={a.id} className="py-3 flex justify-between gap-4">
                      <div className="text-sm text-ink">{prettyAction(a.action)} <span className="text-slate">· {a.target_type ?? ""}</span></div>
                      <div className="text-xs text-slate whitespace-nowrap" title={new Date(a.created_at).toLocaleString()}>{new Date(a.created_at).toLocaleDateString()} · {new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                  ))}
                  {(!auditQ.data || auditQ.data.length===0) && !auditQ.isLoading && <div className="py-4 text-sm text-slate">Quiet so far — create a team or send an invite and it’ll show up here. Great for keeping everyone in the loop.</div>}
                </div>
              </Card>
            )}
          </div>

          {/* Right: Teams + Invitations */}
          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="font-display text-lg text-ink flex items-center gap-2"><Building2 className="h-4 w-4 text-gold" /> Teams</h2>
              <p className="text-xs text-slate mt-1">Teams help you organize hiring — “Engineering”, “Design”, etc. Names are unique inside your org.</p>
              <div className="mt-4 divide-y divide-borderhair border-t">
                {teamsQ.isLoading && <div className="py-6 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
                {teamsQ.data?.map(t=>(
                  <div key={t.id} className="py-3 flex justify-between items-center">
                    <div className="text-sm font-medium text-ink flex items-center gap-2"><span className="h-7 w-7 rounded-md bg-paper border border-borderhair grid place-items-center text-xs">{t.name.slice(0,2).toUpperCase()}</span> {t.name}</div>
                    <div className="text-xs text-slate" title={new Date(t.created_at).toLocaleString()}>added {new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                ))}
                {teamsQ.data?.length===0 && !teamsQ.isLoading && <EmptyState icon="teams" title="No teams yet" description="Create your first team — e.g. Engineering, Sales, or Talent Ops. You can add people to teams after inviting them." />}
              </div>
              {isOrgAdmin && (
                <form onSubmit={e=>{e.preventDefault(); if(!teamName.trim()) return; createTeam.mutate(teamName.trim());}} className="mt-4 flex gap-2">
                  <Input ref={teamInputRef} placeholder="e.g. Engineering" value={teamName} onChange={e=>setTeamName(e.target.value)} required minLength={2} aria-label="New team name" />
                  <Button type="submit" loading={createTeam.isPending} size="sm"><Plus className="h-4 w-4 mr-1" /> Create</Button>
                </form>
              )}
            </Card>

            {isOrgAdmin && (
              <Card className="p-6">
                <h2 className="font-display text-lg text-ink flex items-center gap-2"><Mail className="h-4 w-4 text-gold" /> Invite teammates</h2>
                <p className="text-xs text-slate mt-1">We’ll send a friendly email with a single-use link (valid 7 days). If they don’t see it, re-sending safely replaces the old one.</p>
                <div className="mt-4 divide-y divide-borderhair border-t">
                  {invitesQ.isLoading && <Skeleton className="h-12 w-full mt-3" />}
                  {invitesQ.data?.map(inv=>(
                    <div key={inv.id} className="py-3">
                      <div className="text-sm font-medium text-ink flex items-center gap-2">{inv.email} <Badge variant="sage">{prettyRole(inv.role)}</Badge></div>
                      <div className="text-xs text-slate">invited · expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                    </div>
                  ))}
                  {invitesQ.data?.length===0 && !invitesQ.isLoading && <EmptyState icon="mail" title="No pending invites" description="Your team is all here! When you invite someone, their invite will wait here until they accept." />}
                </div>
                <form onSubmit={e=>{e.preventDefault(); invite.mutate();}} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.9fr] gap-2">
                    <div>
                      <Label htmlFor="inv-email">Teammate’s email</Label>
                      <Input ref={inviteInputRef} id="inv-email" type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} required />
                    </div>
                    <div>
                      <Label htmlFor="inv-role">Their role</Label>
                      <select id="inv-role" value={inviteRole} onChange={e=>setInviteRole(e.target.value)} className="w-full h-10 rounded-md border border-borderhair bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30">
                        <option value="recruiter">Recruiter — can source & review</option>
                        <option value="hiring_manager">Hiring Manager — can decide</option>
                        <option value="org_admin">Admin — can manage everyone</option>
                      </select>
                    </div>
                  </div>
                  <Button type="submit" loading={invite.isPending} className="w-full" variant="gold">Send friendly invitation <ArrowRight className="h-4 w-4 ml-1" /></Button>
                  <p className="text-xs text-slate text-center">They’ll get an email with “You’re invited” — one click to join. <span className="text-ink">Need to resend? Just invite again.</span></p>
                </form>
              </Card>
            )}

            {!isOrgAdmin && (
              <Card className="p-6 bg-muted-gold/40 border-gold/20">
                <div className="flex gap-3">
                  <Shield className="h-5 w-5 text-gold shrink-0 mt-0.5" />
                  <div className="text-sm text-ink leading-relaxed">
                    You’re a <b>{prettyRole(user.role)}</b> — you can see the team, but inviting and managing teammates is for Admins. Need changes? Ask <span className="font-medium">{membersQ.data?.find(m=>m.role==="org_admin")?.full_name ?? "your Admin"}</span>.
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={!!pendingMember}
        onOpenChange={(v)=> !v && setPendingMember(null)}
        title={pendingMember?.is_active ? `Pause ${pendingMember?.name}?` : `Welcome back ${pendingMember?.name}?`}
        description={pendingMember?.is_active ? `${pendingMember.name} will be signed out everywhere and can’t sign back in until you resume them. Great for offboarding — you can always undo.` : `This will re-activate ${pendingMember?.name} so they can sign in and collaborate again.`}
        confirmLabel={pendingMember?.is_active ? "Pause access" : "Resume access"}
        variant={pendingMember?.is_active ? "destructive" : "default"}
        onConfirm={async()=>{
          if (!pendingMember) return;
          try{
            await api.updateMember(pendingMember.id, { is_active: !pendingMember.is_active });
            qc.invalidateQueries({queryKey:["members"]}); qc.invalidateQueries({queryKey:["audit"]});
            toast(pendingMember.is_active ? `${pendingMember.name} is now paused.` : `${pendingMember.name} is back — welcome!`, pendingMember.is_active ? "info" : "success");
          } catch(e:any){ toast(e.message, "error"); }
          setPendingMember(null);
        }}
      />
    </div>
  );
}
