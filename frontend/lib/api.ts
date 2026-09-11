// Typed API client against the real backend contract.
// Handles refresh-token rotation race: concurrent 401s share a single refresh promise.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type FetchOptions = RequestInit & { _retry?: boolean };

let refreshPromise: Promise<string | null> | null = null;

function getTokens(): { access: string | null; refresh: string | null } {
  if (typeof window === "undefined") return { access: null, refresh: null };
  return {
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  };
}
function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}
function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function refreshTokens(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refresh } = getTokens();
    if (!refresh) return null;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) { clearTokens(); return null; }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return data.access_token as string;
    } catch { clearTokens(); return null; }
    finally { refreshPromise = null; }
  })();
  return refreshPromise;
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { access } = getTokens();
  const headers: Record<string,string> = { "Content-Type": "application/json", ...(opts.headers as Record<string,string>||{}) };
  if (access) headers["Authorization"] = `Bearer ${access}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && !opts._retry) {
    const newAccess = await refreshTokens();
    if (newAccess) {
      return apiFetch<T>(path, { ...opts, _retry: true, headers: { ...(opts.headers as Record<string,string>||{}), Authorization: `Bearer ${newAccess}` } });
    }
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(()=>({detail: res.statusText}));
    const msg = (body as {detail?: string}).detail || (body as {message?: string}).message || JSON.stringify(body);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── High-level helpers mirroring backend schemas exactly ──
import type { TokenResponse, UserPublic, OrganizationPublic, TeamPublic, InvitationPublic } from "./types";

export const api = {
  register: (payload: { organization_name: string; full_name: string; email: string; password: string }) =>
    apiFetch<UserPublic>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<TokenResponse>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => apiFetch<UserPublic>("/api/v1/auth/me"),
  forgotPassword: (email: string) =>
    apiFetch<{message:string}>("/api/v1/auth/forgot-password", { method:"POST", body: JSON.stringify({ email }) }),
  resetPassword: (payload: { token: string; new_password: string }) =>
    apiFetch<void>("/api/v1/auth/reset-password", { method:"POST", body: JSON.stringify(payload) }),
  verifyEmail: (token: string) =>
    apiFetch<void>("/api/v1/auth/verify-email", { method:"POST", body: JSON.stringify({ token }) }),
  resendVerification: (email: string) =>
    apiFetch<{message:string}>("/api/v1/auth/resend-verification", { method:"POST", body: JSON.stringify({ email }) }),
  refresh: (refresh_token: string) =>
    apiFetch<TokenResponse>("/api/v1/auth/refresh", { method:"POST", body: JSON.stringify({ refresh_token }) }),
  logout: (refresh_token: string) =>
    apiFetch<void>("/api/v1/auth/logout", { method:"POST", body: JSON.stringify({ refresh_token }) }),

  getOrg: () => apiFetch<OrganizationPublic>("/api/v1/organizations/me"),
  listTeams: () => apiFetch<TeamPublic[]>("/api/v1/organizations/teams"),
  createTeam: (name: string) => apiFetch<TeamPublic>("/api/v1/organizations/teams", { method:"POST", body: JSON.stringify({ name }) }),
  listMembers: () => apiFetch<UserPublic[]>("/api/v1/organizations/members"),
  updateMember: (userId: string, payload: { role?: string; is_active?: boolean; team_id?: string | null }) =>
    apiFetch<UserPublic>(`/api/v1/organizations/members/${userId}`, { method:"PATCH", body: JSON.stringify(payload) }),
  listInvitations: () => apiFetch<InvitationPublic[]>("/api/v1/organizations/invitations"),
  invite: (payload: { email: string; role: string }) =>
    apiFetch<InvitationPublic>("/api/v1/organizations/invitations", { method:"POST", body: JSON.stringify(payload) }),
  acceptInvitation: (payload: { token: string; full_name: string; password: string }) =>
    apiFetch<TokenResponse>("/api/v1/organizations/invitations/accept", { method:"POST", body: JSON.stringify(payload) }),
  listAuditLogs: () => apiFetch<Array<{ id:string; action:string; target_type:string | null; target_id:string | null; meta:any; created_at:string; user_id:string | null }>>("/api/v1/organizations/audit-logs"),
};

export { API_BASE, setTokens, clearTokens, getTokens };
