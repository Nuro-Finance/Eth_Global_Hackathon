"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Pagination, SimplePagination } from "@/components/ui/pagination";
import DemoCard from "../DemoCard";

export default function PaginationDemo() {
  const t = useTranslations("UIComponent");

  // State for different pagination demos
  const [basicPage, setBasicPage] = useState(0);
  const [pageNumbersPage, setPageNumbersPage] = useState(0);
  const [simplePage, setSimplePage] = useState(0);

  const totalItems = 95;
  const pageSize = 10;
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <DemoCard
      title={t("pagination.title")}
      description={t("pagination.description")}
    >
      {/* Basic Pagination */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("pagination.basicPagination")}
        </h4>
        <div className="border border-[var(--color-border-primary)] rounded-lg p-4">
          <Pagination
            pagination={{
              pageIndex: basicPage,
              pageSize: pageSize,
              totalItems: totalItems,
            }}
            onPageChange={setBasicPage}
            showingLabel={t("pagination.showing")}
            toLabel={t("pagination.to")}
            ofLabel={t("pagination.of")}
            itemsLabel={t("pagination.items")}
            previousLabel={t("pagination.previous")}
            nextLabel={t("pagination.next")}
          />
        </div>
      </div>

      {/* With Page Numbers */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("pagination.withPageNumbers")}
        </h4>
        <div className="border border-[var(--color-border-primary)] rounded-lg p-4">
          <Pagination
            pagination={{
              pageIndex: pageNumbersPage,
              pageSize: pageSize,
              totalItems: totalItems,
            }}
            onPageChange={setPageNumbersPage}
            showPageNumbers={true}
            visiblePageCount={5}
            showingLabel={t("pagination.showing")}
            toLabel={t("pagination.to")}
            ofLabel={t("pagination.of")}
            itemsLabel={t("pagination.items")}
            previousLabel={t("pagination.previous")}
            nextLabel={t("pagination.next")}
          />
        </div>
      </div>

      {/* Simple Pagination */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("pagination.simplePagination")}
        </h4>
        <div className="border border-[var(--color-border-primary)] rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-muted)]">
              {t("pagination.page")} {simplePage + 1} {t("pagination.of")}{" "}
              {totalPages}
            </span>
            <SimplePagination
              canPrevious={simplePage > 0}
              canNext={simplePage < totalPages - 1}
              onPrevious={() => setSimplePage((p) => Math.max(0, p - 1))}
              onNext={() =>
                setSimplePage((p) => Math.min(totalPages - 1, p + 1))
              }
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
            />
          </div>
        </div>
      </div>

      {/* No Info */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("pagination.withoutInfo")}
        </h4>
        <div className="border border-[var(--color-border-primary)] rounded-lg p-4">
          <Pagination
            pagination={{
              pageIndex: basicPage,
              pageSize: pageSize,
              totalItems: totalItems,
            }}
            onPageChange={setBasicPage}
            showItemsInfo={false}
            showPageNumbers={true}
            previousLabel={t("pagination.previous")}
            nextLabel={t("pagination.next")}
          />
        </div>
      </div>
    </DemoCard>
  );
}
