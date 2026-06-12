import { Shield } from "lucide-react";

export default function LoginHeader() {
  return (
    <div className="text-center mb-6">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] rounded-2xl mb-4 shadow-lg">
        <Shield className="w-7 h-7 text-[var(--color-button-text)]" />
      </div>
      <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
        Financial Dashboard
      </h1>
      <p className="text-[var(--color-text-muted)] text-sm">
        Welcome back! Please sign in to continue
      </p>
    </div>
  );
}
