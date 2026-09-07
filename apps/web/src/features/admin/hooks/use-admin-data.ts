import { useCallback, useEffect, useState } from "react";

import {
  addAdminSupportMessage,
  errorText,
  getAdminDatasets,
  getAdminPayments,
  getAdminSupportTickets,
  getAdminSummary,
  getAdminSystemHealth,
  getAdminTransactions,
  getAdminUsers,
  getAdminWorkflows,
  updateAdminSupportTicket,
  updateAdminUserRole,
  updateAdminUserStatus,
} from "@/lib/api-client";
import type {
  AdminHealthCheck,
  AdminPayments,
  AdminSummary,
  AdminTransactionRecord,
  AdminUserRecord,
  AdminWorkflowRecord,
  SupportPriority,
  SupportTicket,
  SupportTicketStatus,
} from "@/types";

import type { Loadable } from "../admin.types";

type AdminUsersPage = { items: AdminUserRecord[]; total: number; page: number; page_size: number };
type AdminTransactionsPage = { items: AdminTransactionRecord[]; page: number; page_size: number; partial: boolean; unavailable: string[] };
type AdminWorkflowsPage = { items: AdminWorkflowRecord[]; total: number; page: number; page_size: number };
type AdminDatasets = { items: AdminSummary["datasets"] };
type AdminHealth = { items: AdminHealthCheck[] };
type AdminSupport = { items: SupportTicket[]; total: number };

export interface AdminDataState {
  summary: Loadable<AdminSummary>;
  users: Loadable<AdminUsersPage>;
  transactions: Loadable<AdminTransactionsPage>;
  payments: Loadable<AdminPayments>;
  workflows: Loadable<AdminWorkflowsPage>;
  datasets: Loadable<AdminDatasets>;
  health: Loadable<AdminHealth>;
  support: Loadable<AdminSupport>;
}

export function useAdminData() {
  const [data, setData] = useState<AdminDataState>({
    summary: { loading: true },
    users: { loading: true },
    transactions: { loading: true },
    payments: { loading: true },
    workflows: { loading: true },
    datasets: { loading: true },
    health: { loading: true },
    support: { loading: true },
  });
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const requests = await Promise.allSettled([
      getAdminSummary(),
      getAdminUsers(1, 100),
      getAdminTransactions(),
      getAdminPayments(),
      getAdminWorkflows(),
      getAdminDatasets(),
      getAdminSystemHealth(),
      getAdminSupportTickets(),
    ]);
    const [summary, users, transactions, payments, workflows, datasets, health, support] = requests;
    setData({
      summary: loadable(summary),
      users: loadable(users),
      transactions: loadable(transactions),
      payments: loadable(payments),
      workflows: loadable(workflows),
      datasets: loadable(datasets),
      health: loadable(health),
      support: loadable(support),
    });
    setLastCheckedAt(Date.now());
    setRefreshing(false);
  }, []);

  const fetchUsers = useCallback(async (page = 1, pageSize = 20) => {
    setData((current) => ({ ...current, users: { ...current.users, loading: true, error: undefined } }));
    try {
      const result = await getAdminUsers(page, pageSize);
      setData((current) => ({ ...current, users: { loading: false, data: result } }));
    } catch (error) {
      setData((current) => ({ ...current, users: { loading: false, error: errorText(error) } }));
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const result = await getAdminSystemHealth();
      setData((current) => ({ ...current, health: { loading: false, data: result } }));
      setLastCheckedAt(Date.now());
    } catch (error) {
      setData((current) => ({ ...current, health: { loading: false, error: errorText(error) } }));
    }
  }, []);

  const refreshTransactions = useCallback(async () => {
    setData((current) => ({ ...current, transactions: { ...current.transactions, loading: true, error: undefined } }));
    try {
      const result = await getAdminTransactions();
      setData((current) => ({ ...current, transactions: { loading: false, data: result } }));
    } catch (error) {
      setData((current) => ({ ...current, transactions: { loading: false, error: errorText(error) } }));
    }
  }, []);

  const refreshWorkflows = useCallback(async () => {
    setData((current) => ({ ...current, workflows: { ...current.workflows, loading: true, error: undefined } }));
    try {
      const result = await getAdminWorkflows();
      setData((current) => ({ ...current, workflows: { loading: false, data: result } }));
    } catch (error) {
      setData((current) => ({ ...current, workflows: { loading: false, error: errorText(error) } }));
    }
  }, []);

  const updateTicket = useCallback(async (id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }) => {
    try {
      const updated = await updateAdminSupportTicket(id, patch);
      setData((current) => ({
        ...current,
        support: {
          ...current.support,
          data: current.support.data
            ? { ...current.support.data, items: current.support.data.items.map((ticket) => ticket.id === id ? updated : ticket) }
            : current.support.data,
        },
      }));
    } catch (error) {
      setData((current) => ({ ...current, support: { ...current.support, error: errorText(error) } }));
    }
  }, []);

  const addTicketMessage = useCallback(async (id: string, message: string) => {
    try {
      const updated = await addAdminSupportMessage(id, message);
      setData((current) => ({
        ...current,
        support: {
          ...current.support,
          data: current.support.data
            ? { ...current.support.data, items: current.support.data.items.map((ticket) => ticket.id === id ? updated : ticket) }
            : current.support.data,
        },
      }));
      return updated;
    } catch (error) {
      setData((current) => ({ ...current, support: { ...current.support, error: errorText(error) } }));
      throw error;
    }
  }, []);

  const updateUserStatus = useCallback(async (id: string, status: "active" | "suspended") => {
    try {
      const updated = await updateAdminUserStatus(id, status);
      setData((current) => ({
        ...current,
        users: {
          ...current.users,
          data: current.users.data
            ? {
                ...current.users.data,
                items: current.users.data.items.map((u) => (u.id === id ? { ...u, status: updated.status } : u)),
              }
            : current.users.data,
        },
      }));
      return updated;
    } catch (error) {
      setData((current) => ({ ...current, users: { ...current.users, error: errorText(error) } }));
      throw error;
    }
  }, []);

  const updateUserRole = useCallback(async (id: string, role: AdminUserRecord["role"]) => {
    try {
      const updated = await updateAdminUserRole(id, role);
      setData((current) => ({
        ...current,
        users: {
          ...current.users,
          data: current.users.data
            ? {
                ...current.users.data,
                items: current.users.data.items.map((u) => (u.id === id ? { ...u, role: updated.role } : u)),
              }
            : current.users.data,
        },
      }));
      return updated;
    } catch (error) {
      setData((current) => ({ ...current, users: { ...current.users, error: errorText(error) } }));
      throw error;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...data, refreshing, lastCheckedAt, load, fetchUsers, updateUserStatus, updateUserRole, refreshHealth, refreshTransactions, refreshWorkflows, updateTicket, addTicketMessage };
}

function loadable<T>(result: PromiseSettledResult<T>): Loadable<T> {
  return result.status === "fulfilled" ? { data: result.value, loading: false } : { loading: false, error: errorText(result.reason) };
}

