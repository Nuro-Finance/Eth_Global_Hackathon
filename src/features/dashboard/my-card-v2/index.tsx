"use client";

import { useState } from "react";
import {
    TrendingUp,
    Send,
    ArrowDownLeft,
    RefreshCw,
    MoreHorizontal,
    Lock,
    Unlock,
    ShoppingCart,
    Utensils,
    Car,
    Plane,
    Zap,
    ChevronRight,
    Plus,
    ToggleLeft,
    ToggleRight,
    Home,
    Train,
    Fuel,
    Dumbbell,
    Bot,
    Wallet2,
} from "lucide-react";
import { useRecentTransactions } from "./useRecentTransactions";
import ReloadModal from "./ReloadModal";
import { WithdrawFlow } from "../my-card-1/components/WithdrawFlow";
import { CreditCard } from "@/components";
import { Button } from "@/components/ui/button";
import { PageHeader, PageTitle } from "@/components";
import { useCardsState } from "@/features/dashboard/cards/layouts/CardsGrid/hooks/useCardsState";
import type { Card } from "@/features/dashboard/cards/shared";
import { useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { CARD_SKINS } from "@/lib/cardSkins";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CardLimits } from "@/features/dashboard/my-card-1/components/CardLimits";
import { CardDetails } from "@/features/dashboard/my-card-1/components/CardDetails";
import { CardSettings } from "@/features/dashboard/my-card-1/components/CardSettings";

// ─── Mock Data ────────────────────────────────────────────────────────────────






// ─── Glass card wrapper ───────────────────────────────────────────────────────
function GlassCard({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] ${className}`}
        >
            {children}
        </div>
    );
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
function QuickActions() {
    const [depositOpen, setDepositOpen] = useState(false)
    const [withdrawOpen, setWithdrawOpen] = useState(false)
    const actions = [
        { label: "Reload", icon: TrendingUp, onClick: () => setDepositOpen(true) },
        { label: "Withdraw", icon: ArrowDownLeft, onClick: () => setWithdrawOpen(true) },
    ];

    return (
        <GlassCard className="p-5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-muted)] mb-4">
                Quick Actions
            </p>
            <div className="grid grid-cols-2 gap-4">
                {actions.map(({ label, icon: Icon, onClick }) => (
                    <button onClick={onClick}
                        key={label}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="h-11 w-11 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] bg-transparent hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)]/40 transition-all flex items-center justify-center">
                            <Icon className="h-4 w-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors" />
                        </div>
                        <span className="text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors">
                            {label}
                        </span>
                    </button>
                ))}
                  <ReloadModal open={depositOpen} onClose={() => setDepositOpen(false)} />
                  {withdrawOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setWithdrawOpen(false)}>
                      <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <WithdrawFlow onClose={() => setWithdrawOpen(false)} onBack={() => setWithdrawOpen(false)} />
                      </div>
                    </div>
                  )}
      </div>
        </GlassCard>
    );
}



// ─── Recent Transactions ──────────────────────────────────────────────────────
function RecentTransactions({ cardId }: { cardId?: string }) {
    const { transactions, isLoading: loading } = useRecentTransactions(cardId);
    return (
        <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-4">
                <p className="text-[var(--color-text-secondary)] text-[15px] font-medium">
                    Recent Transactions
                </p>
                <button className="text-[11px] text-[var(--color-primary)] hover:opacity-80 transition-opacity">
                    Sort by ›
                </button>
            </div>

            <div className="space-y-0">
                {loading ? (
                    <p className="text-[13px] text-[var(--color-text-muted)] py-4 text-center">Loading...</p>
                ) : transactions.length === 0 ? (
                    <p className="text-[13px] text-[var(--color-text-muted)] py-4 text-center">No transactions yet</p>
                ) : transactions.map(
                    ({ id, name, date, amount, icon: Icon, category }, i) => {
                        const isIncome = amount > 0;
                        return (
                            <div
                                key={id}
                                className={`flex items-center gap-3 py-3.5 ${i < transactions.length - 1
                                    ? "border-b border-[var(--color-border-primary)]/30"
                                    : ""
                                    }`}
                            >
                                <div className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-bg-glass-strong)] dark:bg-white/5 flex items-center justify-center">
                                    <Icon
                                        className={`h-4 w-4 ${isIncome
                                            ? "text-emerald-400"
                                            : "text-[var(--color-text-muted)]"
                                            }`}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
                                        {name}
                                    </p>
                                    <p className="text-[11px] text-[var(--color-text-muted)]">
                                        {date}
                                    </p>
                                </div>
                                <p
                                    className={`text-[13px] font-medium shrink-0 ${isIncome ? "text-emerald-400" : "text-[var(--color-text-primary)]"
                                        }`}
                                >
                                    {isIncome ? "+" : ""}$
                                    {Math.abs(amount).toFixed(2)}
                                </p>
                                <span className="text-[var(--color-text-muted)] opacity-40 cursor-default">
                                    <MoreHorizontal className="h-4 w-4" />
                                </span>
                            </div>
                        );
                    }
                )}
            </div>
        </GlassCard>
    );
}

// ─── Skin Picker ─────────────────────────────────────────────────────────────
function SkinPicker({ cardId, currentGradient, onSuccess }: { cardId: string; currentGradient: string; onSuccess: (g: string) => void }) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handlePick = async (gradient: string) => {
        if (saving || gradient === currentGradient) return;
        setSaving(true);
        try {
            const session = await fetch("/api/auth/session").then(r => r.json()).catch(() => ({}));
            const token = session?.accessToken ?? null;
            await fetch(`/api/cards/${cardId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ gradient }),
            });
            setSaved(true);
            setTimeout(() => { setSaved(false); onSuccess(gradient); }, 300);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex gap-2 flex-wrap">
            {CARD_SKINS.map((skin, i) => (
                <button
                    key={i}
                    onClick={() => handlePick(skin)}
                    className="w-10 h-7 rounded-lg transition-all duration-200 hover:scale-110"
                    style={{
                        background: skin,
                        border: currentGradient === skin ? "2px solid white" : "2px solid transparent",
                        boxShadow: currentGradient === skin ? "0 0 0 1px rgba(255,255,255,0.3)" : "none",
                        opacity: saving ? 0.6 : 1,
                        cursor: saving ? "wait" : "pointer",
                    }}
                />
            ))}
            {saved && <span className="text-xs text-emerald-400 self-center">✓ Saved</span>}
        </div>
    );
}
// ─── Featured Card Panel ──────────────────────────────────────────────────────
function FeaturedCardPanel({ card, onGradientChange }: { card: Card; onGradientChange: (g: string) => void }) {
    return (
        <GlassCard className="p-5 space-y-5">
            {/* Card Visual */}
            <div className="flex justify-center">
                <CreditCard
                    cardNumber={card.cardNumber}
                    cardHolder={card.cardName || card.cardHolder}
                    expiryDate={card.expiryDate}
                    gradient={card.gradient}
                    id={card.cardType}
                />
            </div>

            {/* Balance */}
            <div className="text-center">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Available Balance
                </p>
                <p className="text-[26px] font-semibold text-[var(--color-text-primary)] mt-0.5">
                    ${card.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                    USDC · ···{card.cardNumber.slice(-4)}
                </p>
            </div>


            {/* Card Skin */}
            <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Card Skin</p>
                <SkinPicker cardId={card.id} currentGradient={card.gradient} onSuccess={onGradientChange} />
            </div>
        </GlassCard>
    );
}

// ─── Card Controls Panel ──────────────────────────────────────────────────────
function CardControlsPanel({ cardId, isFrozen, onToggleFreeze, cardName, setCardName, cardColor, setCardColor }: { cardId?: string; isFrozen: boolean; onToggleFreeze: () => void; cardName: string; setCardName: (n: string) => void; cardColor: string; setCardColor: (c: string) => void; }) {
    return (
        <GlassCard className="p-6">
            <div className="flex flex-col gap-6 w-full">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Card Controls</h3>
                <Tabs defaultValue="limits" className="w-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-3 bg-[var(--color-bg-tertiary)] dark:bg-white/[0.04] border-none p-1 h-12 rounded-[14px] shrink-0 mb-6">
                        <TabsTrigger value="limits" className="rounded-[10px] data-[state=active]:bg-[var(--color-primary)]/20 data-[state=active]:border data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-white text-[var(--color-text-muted)] h-full transition-all border border-transparent">Limits</TabsTrigger>
                        <TabsTrigger value="details" className="rounded-[10px] data-[state=active]:bg-[var(--color-primary)]/20 data-[state=active]:border data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-white text-[var(--color-text-muted)] h-full transition-all border border-transparent">Details</TabsTrigger>
                        <TabsTrigger value="settings" className="rounded-[10px] data-[state=active]:bg-[var(--color-primary)]/20 data-[state=active]:border data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-white text-[var(--color-text-muted)] h-full transition-all border border-transparent">Settings</TabsTrigger>
                    </TabsList>
                    <div className="-mx-2 px-2 pb-2">
                        <TabsContent value="limits" className="m-0 data-[state=inactive]:hidden outline-none"><CardLimits cardId={cardId} /></TabsContent>
                        <TabsContent value="details" className="m-0 data-[state=inactive]:hidden outline-none"><CardDetails isFrozen={isFrozen} onToggleFreeze={onToggleFreeze} cardName={cardName} setCardName={setCardName} /></TabsContent>
                        <TabsContent value="settings" className="m-0 data-[state=inactive]:hidden outline-none"><CardSettings cardColor={cardColor} setCardColor={setCardColor} /></TabsContent>
                    </div>
                </Tabs>
            </div>
        </GlassCard>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function MyCardDashboard() {
    const { cards: rawCards, handleAddCard } = useCardsState();
    const [gradientOverrides, setGradientOverrides] = useState<Record<string, string>>({});
    const cards = rawCards.map(c => gradientOverrides[c.id] ? { ...c, gradient: gradientOverrides[c.id] } : c);
    const handleGradientChange = (cardId: string, gradient: string) =>
        setGradientOverrides(prev => ({ ...prev, [cardId]: gradient }));
    const [selectedId, setSelectedId] = useState<string>("");
    const [isFrozen, setIsFrozen] = useState(false);
    const [cardName, setCardName] = useState("");
    const [cardColor, setCardColor] = useState("");
    useEffect(() => {
        if (cards.length > 0 && !selectedId) setSelectedId(cards[0].id);
    }, [cards, selectedId]);
    const selectedCard = cards.find((c) => c.id === selectedId) ?? cards[0];
 // Sync card name from DB when selected card changes
    useEffect(() => {
        if (selectedCard) {
            setCardName(selectedCard.cardName || selectedCard.cardType || "");
            setIsFrozen(selectedCard.isLocked);
        }
    }, [selectedCard]);
 // Persist card name to backend when saved from CardDetails
    const handleSaveCardName = async (name: string) => {
        setCardName(name);
        if (!selectedCard?.id) return;
        try {
            const sess = await fetch("/api/auth/session").then(r => r.json());
            const token = sess?.accessToken;
            await fetch(`/api/cards/${selectedCard.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ card_name: name }),
            });
        } catch (err) {
            console.error("[MyCard] card name save failed:", err);
        }
    };

    if (!selectedCard || cards.length === 0) return (
        <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center p-8">
            <p className="text-[var(--color-text-primary)] text-lg font-semibold">No cards yet</p>
            <p className="text-[var(--color-text-muted)] text-sm">Complete KYC on the My Card page to get your virtual Visa card.</p>
        </div>
    );

    return (
        <div className="space-y-4 md:space-y-5">
            {/* Header */}
            <PageHeader
                breadcrumb={
                    <>
                        <Home className="h-3 w-3" />
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-[var(--color-text-muted)]">Cards</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-[var(--color-text-primary)]">My Card</span>
      </>
                }
                leftSection={
                    <PageTitle
                        title="My Card"
                        subtitle="View and manage your active card & spending"
                    />
                }
                rightSection={
                    <Button
                        variant="default"
                        size="sm"
                        className="w-auto h-9 min-h-9 px-3"
                        icon={<Plus className="w-4 h-4" />}
                        iconPosition="left"
                        onClick={handleAddCard}
                    >
                        Add Card
                    </Button>
                }
            />
            {/* Main 2-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)] gap-4">
                {/* Left column */}
                <div className="space-y-4">
                    <FeaturedCardPanel card={selectedCard} onGradientChange={(g) => handleGradientChange(selectedCard.id, g)} />
                    <QuickActions />
                    <RecentTransactions cardId={selectedCard?.id} />
                </div>
                {/* Right column - Card Controls */}
                <div className="space-y-4 lg:sticky lg:top-4">
                    <CardControlsPanel cardId={selectedCard?.id} isFrozen={isFrozen} onToggleFreeze={() => setIsFrozen(prev => !prev)} cardName={cardName} setCardName={handleSaveCardName} cardColor={cardColor} setCardColor={setCardColor} />
                </div>
            </div>
        </div>
    );
}

export default MyCardDashboard;
