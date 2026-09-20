import { useEffect, useState } from "react";

import { CONSOLIDATED_TABS, getConsolidatedTabs } from "../admin-tabs";
import type { MainTabId, SubTabId } from "../admin.types";

const DEFAULT_SUBTABS: Record<MainTabId, SubTabId> = {
  overview: "summary",
  users: "user-list",
  transactions: "domain-trans",
  "ai-integrations": "api-keys",
  support: "support-queue",
  "system-logs": "logs-view",
  "domain-orders": "domain-trans",
  dispatch: "dispatch",
  payments: "payments-list",
  "incident-recovery": "workflow-reconciliation",
  feedback: "feedback-ratings",
  "provider-verification": "provider-documents",
};

export function useAdminNavigation(userRole?: string) {
  const tabs = getConsolidatedTabs(userRole);
  const defaultMain: MainTabId = "overview";
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(defaultMain);
  const [activeSubTab, setActiveSubTab] = useState<Record<MainTabId, SubTabId>>(DEFAULT_SUBTABS);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;

      for (const tab of tabs) {
        if (tab.id === hash) {
          setActiveMainTab(tab.id);
          return;
        }
        for (const sub of tab.subtabs) {
          if (sub.hashName === hash || sub.id === hash) {
            setActiveMainTab(tab.id);
            setActiveSubTab((previous) => ({ ...previous, [tab.id]: sub.id }));
            return;
          }
        }
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [tabs]);

  const switchMainTab = (mainTabId: MainTabId, targetSubTabId?: SubTabId) => {
    let tab = tabs.find((item) => item.id === mainTabId);
    let effectiveMain = mainTabId;

    if (!tab && targetSubTabId) {
      const found = tabs.find((t) => t.subtabs.some((s) => s.id === targetSubTabId));
      if (found) {
        tab = found;
        effectiveMain = found.id;
      }
    }

    if (!tab) return;

    setActiveMainTab(effectiveMain);
    if (targetSubTabId) setActiveSubTab((previous) => ({ ...previous, [effectiveMain]: targetSubTabId }));

    const sub = targetSubTabId || activeSubTab[effectiveMain] || tab.subtabs[0]?.id;
    const subDefinition = tab.subtabs.find((item) => item.id === sub);
    updateHash(subDefinition?.hashName || effectiveMain);
  };

  const switchSubTab = (subTabId: SubTabId) => {
    setActiveSubTab((previous) => ({ ...previous, [activeMainTab]: subTabId }));
    const tab = tabs.find((item) => item.id === activeMainTab);
    const sub = tab?.subtabs.find((item) => item.id === subTabId);
    updateHash(sub?.hashName || subTabId);
  };

  return { activeMainTab, activeSubTab, switchMainTab, switchSubTab, tabs };
}

function updateHash(value: string) {
  try {
    window.history.replaceState(null, "", `#${value}`);
  } catch {
    // Hash navigation is a progressive enhancement; rendering remains usable if unavailable.
  }
}

