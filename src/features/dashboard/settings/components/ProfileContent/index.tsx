"use client";

import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { useAppSession } from "@/hooks/useAppSession";
import { RootState } from "@/store/store";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  SETTINGS_CTA_BUTTON_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_LABEL_CLASS,
} from "@/features/dashboard/settings/settingsStyles";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

function profileAvatarLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "G";
}

export default function ProfileContent() {
  const { data: session, update: updateSession } = useAppSession();
  const { user } = useSelector((state: RootState) => state.auth);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setName(data.name ?? "");
        setEmail(data.email ?? "");
        setPhone(data.phone ?? "");
      })
      .catch(() => {
        setName(session?.user?.name ?? "");
        setEmail(session?.user?.email ?? "");
      });
  }, [session?.accessToken, session?.user?.email, session?.user?.name]);

  const handleSave = async () => {
    if (!session?.accessToken) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ name, email, phone }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      await updateSession({ name });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    e.target.value = "";
  };


  const sessionImage =
    session?.user && "image" in session.user
      ? (session.user.image as string | null | undefined)
      : undefined;

  const displayName = name || user?.name || session?.user?.name || "";
  const avatarLetter = profileAvatarLetter(displayName);

  return (
    <section className="space-y-8">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)] lg:gap-10">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
            aria-label="Change avatar"
          >
            <Avatar
              src={avatarPreview ?? sessionImage ?? undefined}
              alt={name || "Profile avatar"}
              className="h-28 w-28 sm:h-32 sm:w-32"
              fallback={
                <div className="flex h-full w-full items-center justify-center bg-[var(--color-primary)]/20 text-2xl font-semibold uppercase text-[var(--color-primary)] sm:text-3xl">
                  {avatarLetter}
                </div>
              }
            />
          </button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 shrink-0 rounded-[10px] border-none bg-white/[0.04] px-4 text-sm font-medium text-[var(--color-text-primary)] shadow-none hover:bg-white/[0.05]"
            onClick={() => avatarInputRef.current?.click()}
          >
            Change avatar
          </Button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="sr-only"
            onChange={handleAvatarChange}
          />
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)] lg:justify-self-end lg:text-right">
          Update your avatar
          <br />
          288×288 px recommended.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="profile-name" className={SETTINGS_LABEL_CLASS}>
            Full Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className={SETTINGS_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="profile-username" className={SETTINGS_LABEL_CLASS}>
            Username
          </label>
          <input
            id="profile-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username"
            className={SETTINGS_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="profile-email" className={SETTINGS_LABEL_CLASS}>
            Email Address
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={SETTINGS_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="profile-phone" className={SETTINGS_LABEL_CLASS}>
            Phone Number
          </label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
            className={SETTINGS_INPUT_CLASS}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className={SETTINGS_CTA_BUTTON_CLASS}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>
    </section>
  );
}
