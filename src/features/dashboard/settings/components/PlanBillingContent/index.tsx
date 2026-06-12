"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Receipt, CreditCard, Check, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import SettingsSection from "@/components/settings-section";
import SettingRow from "../SettingRow";

interface Plan { id: string; name: string; price: string; interval: string; features: string[]; }
interface Sub { plan_name: string; price: number; features: string[]; status: string; current_period_end?: string; }
interface BillingRecord { id: string; plan_name: string; amount: string; status: string; description: string; invoice_date: string; }
interface CardRecord { id: string; cardHolder: string; cardNumber: string; cardType: string; }

export default function PlanBillingContent() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [sub, setSub] = useState<Sub | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<BillingRecord[]>([]);
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [showPlans, setShowPlans] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    fetch("/api/subscriptions/me", { headers: h }).then(r => r.ok ? r.json() : null).then(d => d && setSub(d)).catch(() => {});
    fetch("/api/plans").then(r => r.ok ? r.json() : []).then(setPlans).catch(() => {});
    fetch("/api/billing/history", { headers: h }).then(r => r.ok ? r.json() : []).then(setHistory).catch(() => {});
    fetch("/api/cards", { headers: h }).then(r => r.ok ? r.json() : []).then((d: any) => {
      const arr = Array.isArray(d) ? d : d.cards || [];
      setCards(arr);
    }).catch(() => {});
  }, [token]);

  const [managingPortal, setManagingPortal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

 // Check URL params for Stripe redirect results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      setSuccessMsg("Plan upgraded successfully! It may take a moment to reflect.");
 // Refresh subscription data
      if (token) {
        const h = { Authorization: `Bearer ${token}` };
        fetch("/api/subscriptions/me", { headers: h }).then(r => r.ok ? r.json() : null).then(d => d && setSub(d)).catch(() => {});
        fetch("/api/billing/history", { headers: h }).then(r => r.ok ? r.json() : []).then(setHistory).catch(() => {});
      }
 // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setSuccessMsg(null), 5000);
    }
    if (params.get("cancelled") === "true") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [token]);

  const handleUpgrade = async (planId: string) => {
    if (!token) return;
    setUpgrading(planId);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      const err = await res.json().catch(() => ({}));
      console.error("Checkout error:", err);
    } catch (e) { console.error("Checkout error:", e); } finally { setUpgrading(null); }
  };

  const handleManageSubscription = async () => {
    if (!token) return;
    setManagingPortal(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) { window.location.href = data.url; return; }
      }
    } catch (e) { console.error("Portal error:", e); } finally { setManagingPortal(false); }
  };

  const currentPlan = sub?.plan_name || "Free";
  const currentPrice = sub?.price || 0;

  return (
    <div className="space-y-8">
      <SettingsSection title="Current Plan" description="Manage your subscription and payment methods">
        <div className="rounded-xl border border-[var(--color-border-primary)] p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-lg text-[var(--color-text-primary)]">{currentPlan} Plan</p>
              <p className="text-sm text-[var(--color-text-secondary)]">${currentPrice}/Month</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 uppercase">{sub?.status || "active"}</span>
          </div>
          <ul className="space-y-1.5 mt-3">
            {(sub?.features || ["1 Virtual Card", "Basic Transactions", "Email Support"]).map((f: string) => (
              <li key={f} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {successMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-3">
            <p className="text-sm text-emerald-400 font-medium">{successMsg}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setShowPlans(!showPlans)}>
            {showPlans ? "Hide Plans" : "Upgrade Plan"}
          </Button>
          {currentPlan !== "Free" && (
            <Button variant="outline" className="flex-1" onClick={handleManageSubscription} disabled={managingPortal}>
              {managingPortal ? "Loading..." : "Manage Subscription"}
            </Button>
          )}
        </div>

        {showPlans && (
          <div className="grid gap-3 mt-4">
            {plans.filter(p => p.name !== currentPlan).map(plan => (
              <div key={plan.id} className="rounded-xl border border-[var(--color-border-primary)] p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[var(--color-text-primary)]">{plan.name}</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">${plan.price}/{plan.interval}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {plan.features.map((f: string) => (
                      <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">{f}</span>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={() => handleUpgrade(plan.id)} disabled={upgrading === plan.id}>
                  {upgrading === plan.id ? "Upgrading..." : "Select"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 mt-3">
          <Button variant="outline" className="w-full" onClick={() => setShowCards(!showCards)}>
            {showCards ? "Hide Payment Methods" : "View Payment Methods"}
          </Button>
          {showCards && (
            <div className="space-y-2 mt-2">
              {cards.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-3">No payment methods found</p>
              ) : cards.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border-primary)]">
                  <CreditCard className="w-5 h-5 text-[var(--color-text-muted)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{c.cardHolder}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{c.cardType} **** {(c.cardNumber || "").slice(-4)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Hide Billing History" : "Billing History"}
          </Button>
          {showHistory && (
            <div className="space-y-2 mt-2">
              {history.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-3">No billing records yet</p>
              ) : history.map(h => (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border-primary)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{h.description}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{new Date(h.invoice_date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">${h.amount}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{h.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
