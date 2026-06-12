"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import DemoCard from "../DemoCard";

const getStatusBadge = (status: string, t: any) => {
  switch (status) {
    case "Paid":
      return <Badge variant="success">{t("table.paid")}</Badge>;
    case "Pending":
      return <Badge variant="warning">{t("table.pending")}</Badge>;
    case "Unpaid":
      return <Badge variant="error">{t("table.unpaid")}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function TableDemo() {
  const t = useTranslations("UIComponent");

  const invoices = [
    {
      id: "INV001",
      customer: "John Doe",
      email: "john@example.com",
      status: "Paid",
      method: t("table.creditCard"),
      date: "2026-01-15",
      amount: "$250.00",
    },
    {
      id: "INV002",
      customer: "Jane Smith",
      email: "jane@example.com",
      status: "Pending",
      method: t("table.payPal"),
      date: "2026-01-14",
      amount: "$150.00",
    },
    {
      id: "INV003",
      customer: "Bob Johnson",
      email: "bob@example.com",
      status: "Unpaid",
      method: t("table.bankTransfer"),
      date: "2026-01-13",
      amount: "$350.00",
    },
    {
      id: "INV004",
      customer: "Alice Brown",
      email: "alice@example.com",
      status: "Paid",
      method: t("table.creditCard"),
      date: "2026-01-12",
      amount: "$450.00",
    },
    {
      id: "INV005",
      customer: "Charlie Wilson",
      email: "charlie@example.com",
      status: "Paid",
      method: t("table.payPal"),
      date: "2026-01-11",
      amount: "$550.00",
    },
  ];

  const products = [
    {
      sku: "SKU001",
      name: t("table.productA"),
      category: t("table.electronics"),
      stock: 45,
      price: "$199.00",
    },
    {
      sku: "SKU002",
      name: t("table.productB"),
      category: t("table.clothing"),
      stock: 120,
      price: "$49.00",
    },
    {
      sku: "SKU003",
      name: t("table.productC"),
      category: t("table.homeGarden"),
      stock: 8,
      price: "$89.00",
    },
    {
      sku: "SKU004",
      name: t("table.productD"),
      category: t("table.sports"),
      stock: 67,
      price: "$129.00",
    },
    {
      sku: "SKU005",
      name: "Product E",
      category: t("table.electronics"),
      stock: 23,
      price: "$299.00",
    },
    {
      sku: "SKU006",
      name: "Product F",
      category: t("table.clothing"),
      stock: 95,
      price: "$79.00",
    },
  ];

  return (
    <DemoCard title={t("table.title")} description={t("table.description")}>
      {/* Basic Table */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("table.basicTable")}
        </h4>
        <div className="rounded-lg border border-[var(--color-border-primary)] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.invoice")}</TableHead>
                <TableHead>{t("table.user")}</TableHead>
                <TableHead>{t("table.email")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.method")}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">
                  {t("table.amount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.id}</TableCell>
                  <TableCell>{invoice.customer}</TableCell>
                  <TableCell className="text-[var(--color-text-muted)]">
                    {invoice.email}
                  </TableCell>
                  <TableCell>{getStatusBadge(invoice.status, t)}</TableCell>
                  <TableCell>{invoice.method}</TableCell>
                  <TableCell className="text-[var(--color-text-muted)]">
                    {invoice.date}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {invoice.amount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Striped Table */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("table.stripedRows")}
        </h4>
        <div className="rounded-lg border border-[var(--color-border-primary)] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>{t("table.product")}</TableHead>
                <TableHead>{t("table.category")}</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-right">{t("table.price")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:nth-child(even)]:bg-[var(--color-bg-tertiary)]">
              {products.map((product) => (
                <TableRow key={product.sku}>
                  <TableCell className="text-[var(--color-text-muted)]">
                    {product.sku}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={
                        product.stock < 20
                          ? "error"
                          : product.stock < 50
                          ? "warning"
                          : "success"
                      }
                      size="sm"
                    >
                      {product.stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {product.price}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Compact Table */}
      <div>
        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
          {t("table.compactTable")}
        </h4>
        <div className="rounded-lg border border-[var(--color-border-primary)] overflow-hidden w-fit">
          <Table fullWidth={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="py-2 px-4 text-xs">
                  {t("table.id")}
                </TableHead>
                <TableHead className="py-2 px-4 text-xs">
                  {t("table.name")}
                </TableHead>
                <TableHead className="py-2 px-4 text-xs">
                  {t("table.status")}
                </TableHead>
                <TableHead className="py-2 px-4 text-xs text-right">
                  {t("table.value")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  <TableCell className="py-2 px-4 text-xs">{i}</TableCell>
                  <TableCell className="py-2 px-4 text-xs">
                    {t("table.item")} {i}
                  </TableCell>
                  <TableCell className="py-2 px-4 text-xs">
                    <Badge
                      variant={i % 2 === 0 ? "success" : "outline"}
                      size="sm"
                    >
                      {i % 2 === 0 ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-4 text-xs text-right">
                    ${i * 10}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </DemoCard>
  );
}
