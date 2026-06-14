import type { User } from "@/store/slices/authSlice";

export function persistAppUser(user: User, tokenMarker = "nextauth"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("auth_token", tokenMarker);
    localStorage.setItem("user", JSON.stringify(user));
  } catch {
    /* private mode / quota */
  }
}

export function userFromSession(sessionUser: {
  id?: string;
  email?: string | null;
  name?: string | null;
}): User | null {
  const email = sessionUser.email?.trim();
  if (!email) return null;
  const name =
    sessionUser.name?.trim() || email.split("@")[0] || "User";
  return {
    id: sessionUser.id?.trim() || email,
    email,
    name,
    role: "user",
  };
}
