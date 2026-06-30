"use client";

import { useMemo } from "react";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";

type CrudModule =
  | "products"
  | "ingredients"
  | "suppliers"
  | "customers"
  | "boms"
  | "purchase_orders"
  | "goods_receipts"
  | "stores"
  | "store_orders";

export function useModulePermissions(module: CrudModule) {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canView: can(`${module}.view`),
      canCreate: can(`${module}.create`),
      canEdit: can(`${module}.edit`),
      canDelete: can(`${module}.delete`),
      canApprove: can(`${module}.approve`),
    }),
    [can, module, session]
  );
}

export function useInvoicePermissions() {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canView: can("invoices.view"),
      canCreate: can("invoices.create"),
      canEdit: can("invoices.create") || can("invoices.reverse"),
      canApprove: can("invoices.reverse"),
      canEmail: can("invoices.email"),
      canDelete: can("invoices.reverse"),
      canReverse: can("invoices.reverse"),
    }),
    [can, session]
  );
}

export function useInventoryPermissions() {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canView: can("inventory.view"),
      canCreateCount: can("inventory.counts.create"),
      canApproveCount: can("inventory.counts.approve"),
      canPostAdjustment: can("inventory.adjustments.post"),
    }),
    [can, session]
  );
}

export function useManufacturingPermissions() {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canView: can("manufacturing.view"),
      canCreate: can("manufacturing.runs.create"),
      canStart: can("manufacturing.runs.start"),
      canComplete: can("manufacturing.runs.complete"),
      canReverse: can("manufacturing.runs.reverse"),
    }),
    [can, session]
  );
}

export function useXeroPermissions() {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canView: can("xero.view"),
      canConnect: can("xero.connect"),
      canSync: can("xero.sync"),
      canEditMapping: can("xero.mapping.edit"),
      canManage: can("xero.connect") || can("xero.sync") || can("xero.mapping.edit"),
    }),
    [can, session]
  );
}

export function useAdminPermissions() {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canCompany: can("admin.company"),
      canUsers: can("admin.users"),
      canImports: can("admin.imports"),
    }),
    [can, session]
  );
}

export function useReportsPermissions() {
  const { can, session } = useWorkspacePermissions();

  return useMemo(
    () => ({
      session,
      canView: can("reports.view"),
      canExport: can("reports.export"),
    }),
    [can, session]
  );
}