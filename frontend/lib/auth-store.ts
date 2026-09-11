"use client";
import { create } from "zustand";
import type { UserPublic } from "./types";
import { clearTokens, getTokens } from "./api";

interface AuthState {
  user: UserPublic | null;
  hydrated: boolean;
  setUser: (u: UserPublic | null) => void;
  setHydrated: (v: boolean) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hydrated: false,
  setUser: (user) => set({ user }),
  setHydrated: (hydrated) => set({ hydrated }),
  logout: () => { clearTokens(); set({ user: null }); },
  isAuthenticated: () => !!get().user && !!getTokens().access,
}));
