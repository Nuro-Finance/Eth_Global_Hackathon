import type { User as PrivyUser } from "@privy-io/react-auth";
import type { User } from "@/store/slices/authSlice";

export function mapPrivyUserToAppUser(p: PrivyUser): User {
  const google = p.google;
  const tg = p.telegram;
  const emailAddr =
    p.email?.address ??
    google?.email ??
    (tg?.username
      ? `${tg.username.replace(/^@/, "")}@telegram.local`
      : `privy_${p.id.slice(0, 12)}@privy.local`);

  const isPrivyDefault = emailAddr.startsWith("privy_") || emailAddr.includes(".local");
  
  const displayName =
    (google?.name && google.name.trim()) ||
    (tg?.username ? `@${tg.username.replace(/^@/, "")}` : null) ||
    (!isPrivyDefault ? emailAddr.split("@")[0] : null) ||
    `Nuro User ${p.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0).toString().padEnd(10, "0")}`;

  return {
    id: p.id,
    email: emailAddr,
    name: displayName,
    avatar: tg?.photoUrl ?? undefined,
    role: "user",
  };
}
