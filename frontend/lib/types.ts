export type UserRole = "super_admin" | "org_admin" | "recruiter" | "hiring_manager";

export interface UserPublic {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  is_email_verified: boolean;
}
export interface OrganizationPublic {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "trial";
  created_at: string;
}
export interface TeamPublic {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}
export interface InvitationPublic {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
