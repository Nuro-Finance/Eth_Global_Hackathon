"use client";

import { useState } from "react";
import { Camera, Copy, Check } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { motion, AnimatePresence } from "framer-motion";
import { DEFAULT_USER } from "../config";

interface ProfileHeaderProps {
  name: string;
  email: string;
  nuroId: string;
  profileImage: string | null;
  onChangePhoto: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  changePhotoLabel: string;
}

export function ProfileHeader({
  name,
  email,
  nuroId,
  profileImage,
  onChangePhoto,
  fileInputRef,
  onImageChange,
  changePhotoLabel,
}: ProfileHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const handleCopy = () => {
    copyToClipboard(nuroId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  return (
    <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-6">
      <div className="relative group">
        <div className="w-20 h-20 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center overflow-hidden">
          {profileImage ? (
            <Image
              src={profileImage}
              alt="Profile"
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[var(--color-primary)] text-[28px] font-semibold uppercase">
              {DEFAULT_USER.initials}
            </span>
          )}
        </div>
        <button
          onClick={onChangePhoto}
          className="absolute inset-0 w-20 h-20 rounded-full bg-[var(--color-bg-modal-overlay)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Camera className="w-6 h-6 text-[var(--color-text-primary)]" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onImageChange}
          className="hidden"
        />
      </div>
      <div className="flex-1">
        <h3 className="text-[var(--color-text-primary)] text-[20px] font-normal">
          {DEFAULT_USER.name}
        </h3>
        <p className="text-[var(--color-text-muted)] text-[14px]">
          {DEFAULT_USER.email}
        </p>
      </div>
      <div className="shrink-0">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleCopy}
          className="group/copy relative overflow-hidden transition-all duration-300 px-4 !backdrop-blur-none !dark:bg-white/3"
        >
          <span className={cn(
            "transition-all duration-300",
            isCopied ? "blur-[3px] opacity-0" : "group-hover/copy:blur-[3px]"
          )}>
            {nuroId}
          </span>

          <AnimatePresence mode="wait">
            <motion.div
              key={isCopied ? "copied" : "copy"}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-tertiary)] dark:bg-white/[0.04] backdrop-blur-none pointer-events-none"
              style={{ opacity: isCopied ? 1 : undefined }}
            >
              <div className={cn(
                "flex items-center justify-center w-full h-full transition-opacity duration-300",
                !isCopied && "opacity-0 group-hover/copy:opacity-100"
              )}>
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5 text-[var(--color-success)]" strokeWidth={1.5} />
                    <span className="text-[11px] uppercase font-bold tracking-widest text-[var(--color-success)]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-2 text-[var(--color-text-primary)]" strokeWidth={1.5} />
                    <span className="text-[11px] uppercase font-bold tracking-widest text-[var(--color-text-primary)]">Copy</span>
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </Button>
      </div>
    </div>
  );
}
