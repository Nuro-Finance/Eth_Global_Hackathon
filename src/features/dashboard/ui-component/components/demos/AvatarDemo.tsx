"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import DemoCard from "../DemoCard";

// Avatar images from public folder
const AVATAR_IMAGES = {
  person1: "/assets/images/avatar/person/person.png",
  person2: "/assets/images/avatar/person/person-2.png",
  female1: "/assets/images/avatar/person/person-female.png",
  female2: "/assets/images/avatar/person/person-female-2.png",
};

export default function AvatarDemo() {
  const t = useTranslations("UIComponent");

  return (
    <DemoCard title={t("avatar.title")} description={t("avatar.description")}>
      {/* With Image */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("avatar.withImage")}
        </h4>
        <div className="flex items-center gap-4">
          <Avatar src={AVATAR_IMAGES.person1} alt="User 1" />
          <Avatar src={AVATAR_IMAGES.person2} alt="User 2" />
          <Avatar src={AVATAR_IMAGES.female1} alt="User 3" />
          <Avatar src={AVATAR_IMAGES.female2} alt="User 4" />
        </div>
      </div>

      {/* Fallback */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("avatar.fallback")}
        </h4>
        <div className="flex items-center gap-4">
          <Avatar fallback="JD" />
          <Avatar
            fallback={
              <span className="bg-blue-500 text-[var(--color-text-primary)] w-full h-full flex items-center justify-center text-sm font-medium">
                AB
              </span>
            }
          />
          <Avatar
            fallback={
              <span className="bg-[var(--color-success)] text-[var(--color-button-text)] w-full h-full flex items-center justify-center text-sm font-medium">
                CD
              </span>
            }
          />
          <Avatar
            fallback={
              <span className="bg-purple-500 text-[var(--color-text-primary)] w-full h-full flex items-center justify-center text-sm font-medium">
                EF
              </span>
            }
          />
        </div>
      </div>

      {/* Sizes */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("avatar.sizes")}
        </h4>
        <div className="flex items-end gap-4">
          <Avatar size="xs" src={AVATAR_IMAGES.person1} alt="Extra Small" />
          <Avatar size="sm" src={AVATAR_IMAGES.person2} alt="Small" />
          <Avatar size="md" src={AVATAR_IMAGES.female1} alt="Medium" />
          <Avatar size="lg" src={AVATAR_IMAGES.female2} alt="Large" />
          <Avatar size="xl" src={AVATAR_IMAGES.person1} alt="Extra Large" />
        </div>
      </div>

      {/* Variants */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.variants")}
        </h4>
        <div className="flex items-center gap-4">
          <Avatar variant="rounded" src={AVATAR_IMAGES.person1} alt="Rounded" />
          <Avatar variant="square" src={AVATAR_IMAGES.person2} alt="Square" />
          <Avatar variant="soft" src={AVATAR_IMAGES.female1} alt="Soft" />
        </div>
      </div>

      {/* Borders */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.variants")}
        </h4>
        <div className="flex items-center gap-4">
          <Avatar border="none" src={AVATAR_IMAGES.person1} alt="No Border" />
          <Avatar
            border="default"
            src={AVATAR_IMAGES.person2}
            alt="Default Border"
          />
          <Avatar
            border="primary"
            src={AVATAR_IMAGES.female1}
            alt="Primary Border"
          />
        </div>
      </div>

      {/* Avatar Group */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("common.variants")}
        </h4>
        <div className="flex -space-x-3">
          <Avatar
            border="primary"
            src={AVATAR_IMAGES.person1}
            alt="User 1"
            className="ring-2 ring-[var(--color-bg-primary)]"
          />
          <Avatar
            border="primary"
            src={AVATAR_IMAGES.person2}
            alt="User 2"
            className="ring-2 ring-[var(--color-bg-primary)]"
          />
          <Avatar
            border="primary"
            src={AVATAR_IMAGES.female1}
            alt="User 3"
            className="ring-2 ring-[var(--color-bg-primary)]"
          />
          <Avatar
            fallback={
              <span className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] w-full h-full flex items-center justify-center text-xs">
                +5
              </span>
            }
            className="ring-2 ring-[var(--color-bg-primary)]"
          />
        </div>
      </div>

      {/* With Status */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("avatar.withStatus")}
        </h4>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar src={AVATAR_IMAGES.person1} alt="Online" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[var(--color-success)] ring-2 ring-[var(--color-bg-primary)]"></span>
          </div>
          <div className="relative">
            <Avatar src={AVATAR_IMAGES.person2} alt="Away" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-yellow-500 ring-2 ring-[var(--color-bg-primary)]"></span>
          </div>
          <div className="relative">
            <Avatar src={AVATAR_IMAGES.female1} alt="Offline" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-gray-400 ring-2 ring-[var(--color-bg-primary)]"></span>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}
