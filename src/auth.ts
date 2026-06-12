import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { DESIGN_MODE, isDevDesignLoginBypass } from "@/config/design-mode"
import {
  DEMO_CREDENTIALS,
  isDemoLoginEmail,
} from "@/features/auth/components/DemoCredentialsCard/config"

function designModeAuthorizeUser(email: string) {
  return {
    id: "design-demo-user",
    name: email.split("@")[0] || "Demo",
    email,
    accessToken: "design-mode-session-token",
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
 // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
 // Email/password login via Nuro API
    Credentials({
      id: "credentials",
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
        const password = String(credentials?.password ?? "")

        if (DESIGN_MODE && isDevDesignLoginBypass()) {
          return designModeAuthorizeUser(email || DEMO_CREDENTIALS.email)
        }

        if (isDevDesignLoginBypass() && isDemoLoginEmail(email)) {
          return designModeAuthorizeUser(email.trim() || DEMO_CREDENTIALS.email)
        }

        try {
          const res = await fetch(`${process.env.CASHLY_API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })
          if (!res.ok) return null
          const { accessToken, user } = await res.json()
          return { ...user, accessToken }
        } catch {
          return null
        }
      },
    }),
 // Moltbook bot identity verification
    Credentials({
      id: "moltbook",
      credentials: {
        token: {},
      },
      async authorize(credentials) {
        try {
          const appKey = process.env.MOLTBOOK_APP_KEY
          if (!appKey) return null

          const res = await fetch("https://moltbook.com/api/v1/agents/verify-identity", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Moltbook-App-Key": appKey,
            },
            body: JSON.stringify({ token: credentials.token }),
          })
          if (!res.ok) return null

          const profile = await res.json()
 // Map Moltbook bot profile to next-auth user shape
          return {
            id: profile.id ?? profile.username,
            name: profile.name ?? profile.username,
            email: profile.email ?? `${profile.username}@moltbook.com`,
            image: profile.avatar ?? null,
            accessToken: credentials.token as string,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
 // First sign-in: `user` and `account` are populated. Subsequent requests
 // arrive with only `token` so we persist everything we need on the token.
      if (user && account?.provider === "google") {
 // Google OAuth — we forward Google's id_token (signed JWT) to the
 // backend, which verifies signature + audience + email_verified
 // against Google's JWKS before trusting any claim. This replaces an
 // earlier version that trusted {email, name} from the request body.
 // If id_token is ever missing (shouldn't be for OIDC), we fail shut.
        const idToken = (account as any).id_token
        if (!idToken) {
          console.error("[auth.jwt] Google account missing id_token — refusing to mint Nuro JWT")
          return token
        }
        try {
          const res = await fetch(`${process.env.CASHLY_API_URL}/auth/social-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "google",
              id_token: idToken,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            token.accessToken = data.accessToken
            token.id = data.user.id
            token.name = data.user.name
            token.email = data.user.email
          } else {
            const body = await res.text().catch(() => "")
            console.error("[auth.jwt] social-login HTTP", res.status, body.slice(0, 200))
          }
        } catch (err) {
          console.error("[auth.jwt] social-login fetch error", err)
        }
      } else if (user) {
 // Credentials / Moltbook path — authorize() already returned accessToken
        token.accessToken = (user as any).accessToken
        token.name = user.name
        token.id = (user as any).id
        token.email = user.email
      }
      return token
    },
    session({ session, token }) {
      if (token.name) session.user.name = token.name as string
      if (token.email) session.user.email = token.email as string
      ;(session as any).accessToken = token.accessToken
      ;(session.user as any).id = token.id
      return session
    },
  },
  pages: {
    signIn: "/en/login",
  },
  trustHost: true,
 // Session 29 — NextAuth v5 renamed NEXTAUTH_SECRET → AUTH_SECRET. The .env
 // file still has the v4 name; accept BOTH so operators don't silently fall
 // through to the insecure hardcoded fallback. Fallback kept ONLY so local
 // dev doesn't crash when no env is set; NEVER rely on it in prod.
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "fallback_nuro_secret_key_for_local_env",
})
