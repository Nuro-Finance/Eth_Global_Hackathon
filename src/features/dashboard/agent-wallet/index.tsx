"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectWallet, useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { DataStatusPill, InlineAlert, PageHeader, PageTitle } from "@/components";
import { CreateWalletModal } from "@/components/CreateWalletModal";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import type { DataState } from "@/lib/dataState";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function AgentWalletFeature() {
  const { privyEnabled } = usePrivyRuntime();
  const { ready } = usePrivy();
  const [isCreating, setIsCreating] = useState(false);
  const { online } = useOnlineStatus();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!online) return;
    if (!privyEnabled) return;
    if (!ready) return;
    setLastUpdatedAt(Date.now());
  }, [online, privyEnabled, ready]);

  const dataState = useMemo<DataState>(() => {
    const meta = { lastUpdatedAt, source: "privy" };
    if (!online) return { status: "offline", meta };
    if (!privyEnabled) return { status: "error", error: "Wallet services are unavailable.", meta };
    if (!ready) return { status: "loading", meta };
    return { status: "success", meta };
  }, [lastUpdatedAt, online, privyEnabled, ready]);

  const { connectWallet } = useConnectWallet({
    onError: (error) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[Agent Wallet] connectWallet", error, { message: String(error) });
      }
    },
  });

  const { createWallet } = useCreateWallet({
    onError: (error) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[Agent Wallet] createWallet", error, { message: String(error) });
      }
    },
  });

  const handleConnectWallet = useCallback(() => {
    if (!privyEnabled || !ready) return;
    try {
      connectWallet({
        description: "Connect a wallet to use with your Nuro account.",
      });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Agent Wallet] connectWallet (sync throw)", error, {
          message: String(error),
        });
      }
    }
  }, [connectWallet]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateWallet = useCallback(() => {
    if (isCreating) return;
    setIsModalOpen(true);
  }, [isCreating]);

  const handleConfirmCreate = async () => {
    setIsCreating(true);
    try {
      await createWallet();
      setIsModalOpen(false);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Agent Wallet] createWallet (throw)", error, { message: String(error) });
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <PageHeader
        className="mb-2 md:mb-4"
        leftSection={
          <PageTitle
            title="Agent Wallet"
            subtitle="Connect an existing wallet or create a new one."
          />
        }
        rightSection={ready && privyEnabled ? <DataStatusPill state={dataState} /> : null}
      />

      {dataState.status === "offline" && (
        <InlineAlert
          tone="offline"
          title="You're offline"
          description="Reconnect to continue."
        />
      )}

      {dataState.status === "error" && (
        <InlineAlert
          tone="error"
          title="Wallet unavailable"
          description="Wallet services aren't available right now."
        />
      )}

      <section
        className="flex w-full flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10 md:py-12 min-h-[min(70dvh,calc(100dvh-13rem))]"
        aria-labelledby="agent-wallet-heading"
      >
        <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6 sm:gap-7 md:gap-8">
          <div className="relative mx-auto w-full max-w-[220px] shrink-0">
            <Image
              src="/Nuro Wallet Update.svg"
              alt="Wallet illustration"
              width={220}
              height={220}
              className="mx-auto block h-auto w-full object-contain"
              priority
            />
          </div>

          <div className="flex w-full max-w-md flex-col items-center gap-2 px-0 text-center sm:px-2">
            <h1
              id="agent-wallet-heading"
              className="max-w-full whitespace-nowrap text-center text-xl font-semibold tracking-tight text-[var(--color-text-primary)] min-[380px]:text-2xl sm:text-3xl"
            >
              Set Up Agent Wallet
            </h1>
            <h2 className="w-full max-w-md text-pretty text-sm font-normal leading-relaxed text-[var(--color-text-muted)] sm:text-base">
              <span className="block">Link a wallet you already use, or create a new,</span>
              <span className="mt-1 block sm:mt-1.5">
                one to hold and move funds from this dashboard.
              </span>
            </h2>
          </div>

          <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center sm:gap-3">
            <Button
              type="button"
              variant="default"
              className="h-11 min-h-11 w-full px-6 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] rounded-[10px] text-white sm:h-10 sm:min-h-10 sm:min-w-0 sm:flex-1"
              onClick={handleConnectWallet}
              disabled={!online || !privyEnabled || !ready}
            >
              Connect wallet
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11 w-full border-[1px] border-solid border-[var(--color-primary)] bg-transparent dark:bg-transparent px-6 text-[var(--color-text-primary)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] hover:bg-transparent dark:hover:bg-transparent hover:shadow-[inset_0_0_16px_2px_rgba(13,144,255,0.85)] dark:border-[var(--color-primary)] rounded-[10px] sm:h-10 sm:min-h-10 sm:min-w-0 sm:flex-1"
              disabled={isCreating || !online}
              onClick={() => handleCreateWallet()}
            >
              Create wallet
            </Button>
          </div>
        </div>
      </section>

      <CreateWalletModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Setup Agent Wallet"
      >
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="relative w-full max-w-[80px] mb-8">
            <Image
              src="/Nuro Wallet Update.svg"
              alt="Wallet illustration"
              width={80}
              height={80}
              className="mx-auto block h-auto w-full object-contain"
              priority
            />
          </div>
          <h3 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3">Create Agent Wallet</h3>
          <p className="text-[var(--color-text-muted)] text-base max-w-[400px]">
            We'll create a secure, multi-chain, non-custodial wallet linked to your account.
          </p>
        </div>
      </CreateWalletModal>
    </div>
  );
}
