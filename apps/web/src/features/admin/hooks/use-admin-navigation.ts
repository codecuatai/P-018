import { useEffect, useState } from "react";

import { CONSOLIDATED_TABS } from "../admin-tabs";
import type { MainTabId, SubTabId } from "../admin.types";

const DEFAULT_SUBTABS: Record<MainTabId, SubTabId> = {
  overview: "summary",
  users: "user-list",
  transactions: "domain-trans",
  "ai-integrations": "api-keys",
  support: "support-queue",
  "system-logs": "logs-view",
};

export function useAdminNavigation() {
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>("overview");
  const [activeSubTab, setActiveSubTab] = useState<Record<MainTabId, SubTabId>>(DEFAULT_SUBTABS);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;

      for (const tab of CONSOLIDATED_TABS) {
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
  }, []);

  const switchMainTab = (mainTabId: MainTabId, targetSubTabId?: SubTabId) => {
    setActiveMainTab(mainTabId);
    if (targetSubTabId) setActiveSubTab((previous) => ({ ...previous, [mainTabId]: targetSubTabId }));

    const tab = CONSOLIDATED_TABS.find((item) => item.id === mainTabId);
    const sub = targetSubTabId || activeSubTab[mainTabId] || tab?.subtabs[0]?.id;
    const subDefinition = tab?.subtabs.find((item) => item.id === sub);
    updateHash(subDefinition?.hashName || mainTabId);
  };

  const switchSubTab = (subTabId: SubTabId) => {
    setActiveSubTab((previous) => ({ ...previous, [activeMainTab]: subTabId }));
    const tab = CONSOLIDATED_TABS.find((item) => item.id === activeMainTab);
    const sub = tab?.subtabs.find((item) => item.id === subTabId);
    updateHash(sub?.hashName || subTabId);
  };

  return { activeMainTab, activeSubTab, switchMainTab, switchSubTab };
}

function updateHash(value: string) {
  try {
    window.history.replaceState(null, "", `#${value}`);
  } catch {
    // Hash navigation is a progressive enhancement; rendering remains usable if unavailable.
  }
}

