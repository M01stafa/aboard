"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { slotOf, type LayoutState, type ModuleKind, type SplitMode, type Tab } from "./types";
import { IframePlaceholder, StaticPlaceholder } from "./placeholders";
import { SaveStatusIndicator } from "./save-status";
import { CircuitPane } from "@/modules/circuit";
import { BoardPane } from "@/modules/board";
import { PdfPane } from "@/modules/pdf";
import { ExportDialog } from "@/core/alpha/export-dialog";
import { ModeSwitchModal } from "@/components/mode-switch-modal";
import { DriveStatusBanner } from "@/components/drive-status-banner";
import { bus, type AppEvents } from "@/core/bus";
import { selectTargetBoard } from "@/integration/target-board";
import {
  insertImageIntoBoard,
  insertCircuitSvgIntoBoard,
  insertTextNoteIntoBoard,
} from "@/integration/board-insertion";
import { formatAlphaLink, parseAlphaLink } from "@/integration/alpha-link";
import { appendBoardToPdf } from "@/integration/board-to-pdf";
import { projectService as defaultProjectService } from "@/core/storage";

/*
 * Tab Bar & Divider Keyboard Interaction Map
 * -------------------------------------------
 * Tab Bar:
 * - ArrowRight: Move focus to next tab (LTR) / previous tab (RTL)
 * - ArrowLeft:  Move focus to previous tab (LTR) / next tab (RTL)
 * - Home:       Jump focus to the first tab in the tab bar
 * - End:        Jump focus to the last tab in the tab bar
 * - Enter/Space: Activate the focused tab as the primary pane
 * - Delete:     Close the focused tab (if multiple tabs exist)
 *
 * Split Divider:
 * - ArrowLeft/ArrowRight (Vertical split): Adjust divider ratio by 8px (direction flips in RTL)
 * - ArrowUp/ArrowDown (Horizontal split): Adjust divider ratio by 8px
 * - Home: Snap divider to minimum ratio (0.2 / 320px min width)
 * - End:  Snap divider to maximum ratio (0.8)
 *
 * All keyboard controls use :focus-visible per DESIGN.md R5.
 */

export interface WorkspaceHostProps {
  projectId?: string | null;
  initialKind?: ModuleKind | null;
  onPaneMount?: (tabId: string, token: string) => void;
  // For Vitest testing: allows injecting layout directly or test controls
  initialLayout?: Partial<LayoutState>;
}

export function WorkspaceHost({
  projectId,
  initialKind,
  onPaneMount,
  initialLayout,
}: WorkspaceHostProps) {
  const { t, dir } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Initialize tabs and layout state
  const [layout, setLayout] = useState<LayoutState>(() => {
    if (initialLayout?.tabs && initialLayout.tabs.length > 0) {
      return {
        tabs: initialLayout.tabs,
        tabBarOrder: initialLayout.tabBarOrder ?? initialLayout.tabs.map((t) => t.id),
        primary: initialLayout.primary ?? initialLayout.tabs[0]?.id ?? null,
        secondary: initialLayout.secondary ?? (initialLayout.tabs[1]?.id ?? null),
        split: initialLayout.split ?? "none",
        ratio: initialLayout.ratio ?? 0.5,
      };
    }

    const defaultTabs: Tab[] = [
      {
        id: "tab-1",
        kind: initialKind || "board",
        itemId: "item-1",
        title:
          initialKind === "circuit"
            ? t("workspace.circuitTabTitle", { n: "1" })
            : initialKind === "pdf"
            ? t("workspace.pdfTabTitle", { n: "1" })
            : t("workspace.boardTabTitle", { n: "1" }),
      },
      {
        id: "tab-2",
        kind: "circuit",
        itemId: "item-2",
        title: t("workspace.iframePlaceholderTitle"),
        isIframe: true,
      },
      {
        id: "tab-3",
        kind: "pdf",
        itemId: "item-3",
        title: t("workspace.pdfTabTitle", { n: "2" }),
      },
    ];

    return {
      tabs: defaultTabs,
      tabBarOrder: defaultTabs.map((t) => t.id),
      primary: "tab-1",
      secondary: "tab-2",
      split: "none",
      ratio: 0.5,
    };
  });

  const [isMobile, setIsMobile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showModeSwitch, setShowModeSwitch] = useState(false);
  const [projectInfo, setProjectInfo] = useState<{ title: string; storage: "local" | "drive" } | null>(null);
  const previousSplitRef = useRef<SplitMode>("none");

  // Load project storage info for mode switching
  useEffect(() => {
    if (!projectId || typeof projectId !== "string") return;
    const currentId: string = projectId;
    let cancelled = false;
    async function loadInfo() {
      try {
        const { getDb } = await import("@/core/db");
        const db = getDb();
        if (db) {
          const row = await db.projects.get(currentId);
          if (row && !cancelled) {
            setProjectInfo({
              title: row.title || "Project",
              storage: (row.storage as "local" | "drive") || "local",
            });
          }
        }
      } catch {
        // Fallback
      }
    }
    loadInfo();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Track responsive screen width for split view (< 768px breakpoint md)
  useEffect(() => {
    if (typeof window === "undefined") return;

    function checkWidth() {
      const mobile = window.innerWidth < 768;
      setIsMobile((prev) => {
        if (!prev && mobile) {
          // Collapse to single view on resize down below 768px, keeping active tab
          setLayout((current) => {
            if (current.split !== "none") {
              previousSplitRef.current = current.split;
              return { ...current, split: "none" };
            }
            return current;
          });
        }
        return mobile;
      });
    }

    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  useEffect(() => {
    const handleOpenExport = () => setShowExportDialog(true);
    bus.on("drive:open-export-dialog", handleOpenExport);
    return () => {
      bus.off("drive:open-export-dialog", handleOpenExport);
    };
  }, []);

  // Track layout in ref for event bus handlers
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Track most recently used board tabs
  const mruBoardTabsRef = useRef<string[]>([]);
  useEffect(() => {
    if (mruBoardTabsRef.current.length === 0) {
      const boards = layout.tabs.filter((t) => t.kind === "board").map((t) => t.id);
      const visible = [layout.primary, layout.secondary].filter(Boolean) as string[];
      const visibleBoards = boards.filter((id) => visible.includes(id));
      const hiddenBoards = boards.filter((id) => !visible.includes(id));
      mruBoardTabsRef.current = [...visibleBoards, ...hiddenBoards];
    }
  }, [layout]);

  const handleNavigateAlpha = useCallback(
    async (url: string) => {
      const parsed = parseAlphaLink(url);
      if (!parsed || parsed.type !== "pdf") return;

      const currentLayout = layoutRef.current;
      // 1. Check if the PDF tab is already open
      const existingTab = currentLayout.tabs.find(
        (t) => t.kind === "pdf" && (t.itemId === parsed.itemId || t.id === parsed.itemId)
      );

      if (existingTab) {
        // PDF is already open! Make sure it's visible
        const isVisible =
          currentLayout.primary === existingTab.id ||
          (currentLayout.split !== "none" && currentLayout.secondary === existingTab.id);

        if (!isVisible) {
          setLayout((prev) => {
            if (prev.split !== "none") {
              return { ...prev, secondary: existingTab.id };
            }
            return { ...prev, primary: existingTab.id };
          });
        }

        // Navigate to the target page
        bus.emit("pdf:navigate-page", {
          itemId: parsed.itemId,
          page: parsed.page,
        });
      } else {
        // 2. Tab is not open, open it in workspace
        let title = t("workspace.pdfTabTitle", { n: `${currentLayout.tabs.length + 1}` });
        try {
          const item = await defaultProjectService.readItem(projectId || "default", parsed.itemId);
          if (item) {
            const parsedItem = JSON.parse(item) as { name?: string };
            if (parsedItem.name) {
              title = parsedItem.name;
            }
          }
        } catch {
          // Fallback title
        }

        const newPdfTabId = `tab-${Date.now()}`;
        const newTab: Tab = {
          id: newPdfTabId,
          kind: "pdf",
          itemId: parsed.itemId,
          title,
        };

        setLayout((prev) => {
          let nextPrimary = prev.primary;
          let nextSecondary = prev.secondary;
          let nextSplit = prev.split;

          if (prev.split !== "none") {
            nextSecondary = newPdfTabId;
          } else {
            nextPrimary = newPdfTabId;
          }

          return {
            ...prev,
            tabs: [...prev.tabs, newTab],
            tabBarOrder: [...prev.tabBarOrder, newPdfTabId],
            primary: nextPrimary,
            secondary: nextSecondary,
            split: nextSplit,
          };
        });

        setTimeout(() => {
          bus.emit("pdf:navigate-page", {
            itemId: parsed.itemId,
            page: parsed.page,
          });
        }, 300);
      }
    },
    [projectId, t]
  );

  // Intercept anchor clicks on alpha:// links at workspace window level (INT-4)
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && href.startsWith("alpha://")) {
        e.preventDefault();
        e.stopPropagation();
        handleNavigateAlpha(href);
      }
    };

    window.addEventListener("click", handleAnchorClick, true);
    return () => {
      window.removeEventListener("click", handleAnchorClick, true);
    };
  }, [handleNavigateAlpha]);

  // Cross-tool integration: listen for Send to Board events (INT-1, INT-2, INT-4)
  useEffect(() => {
    const handlePdfToBoard = async (event: AppEvents["pdf:page-to-board"]) => {
      const currentLayout = layoutRef.current;
      const decision = selectTargetBoard({
        explicitTabId: event.targetBoardTabId,
        sourceTabId: event.sourceTabId,
        layout: currentLayout,
        mruBoardTabIds: mruBoardTabsRef.current,
      });

      let targetTabId: string;

      if (decision.type === "create") {
        const newBoardId = `tab-${Date.now()}`;
        const newItemId = `item-${Date.now()}`;
        const newTab: Tab = {
          id: newBoardId,
          kind: "board",
          itemId: newItemId,
          title: t("workspace.boardTabTitle", { n: `${currentLayout.tabs.length + 1}` }),
        };

        setLayout((prev) => {
          const isMobileWidth = typeof window !== "undefined" && window.innerWidth < 768;
          let nextSplit = prev.split;
          let nextPrimary = prev.primary;
          let nextSecondary = prev.secondary;

          if (isMobileWidth) {
            nextPrimary = newBoardId;
          } else if (prev.split === "none") {
            nextSplit = "vertical";
            nextSecondary = newBoardId;
          } else {
            if (event.sourceTabId && prev.secondary === event.sourceTabId) {
              nextPrimary = newBoardId;
            } else {
              nextSecondary = newBoardId;
            }
          }

          return {
            ...prev,
            tabs: [...prev.tabs, newTab],
            tabBarOrder: [...prev.tabBarOrder, newBoardId],
            primary: nextPrimary,
            secondary: nextSecondary,
            split: nextSplit,
          };
        });

        targetTabId = newBoardId;
        mruBoardTabsRef.current = [newBoardId, ...mruBoardTabsRef.current.filter((id) => id !== newBoardId)];
      } else {
        targetTabId = decision.tabId;
        mruBoardTabsRef.current = [targetTabId, ...mruBoardTabsRef.current.filter((id) => id !== targetTabId)];

        setLayout((prev) => {
          const isVisible =
            prev.primary === targetTabId ||
            (prev.split !== "none" && prev.secondary === targetTabId);

          if (isVisible) return prev;

          const isMobileWidth = typeof window !== "undefined" && window.innerWidth < 768;
          if (isMobileWidth) {
            return { ...prev, primary: targetTabId };
          }

          if (prev.split === "none") {
            return {
              ...prev,
              split: "vertical",
              secondary: targetTabId,
            };
          } else {
            if (event.sourceTabId && prev.secondary === event.sourceTabId) {
              return { ...prev, primary: targetTabId };
            } else {
              return { ...prev, secondary: targetTabId };
            }
          }
        });
      }

      try {
        await insertImageIntoBoard({
          projectId: projectId || "demo",
          tabId: targetTabId,
          blob: event.image,
          mimeType: event.image.type || "image/webp",
          ["width"]: event.width,
          ["height"]: event.height,
          locked: true,
        });
      } catch (err) {
        console.error("[WorkspaceHost] Failed to insert PDF page into board:", err);
      }
    };

    const handleCircuitToBoard = async (event: AppEvents["circuit:to-board"]) => {
      const currentLayout = layoutRef.current;
      const decision = selectTargetBoard({
        explicitTabId: event.targetBoardTabId,
        sourceTabId: event.sourceTabId,
        layout: currentLayout,
        mruBoardTabIds: mruBoardTabsRef.current,
      });

      let targetTabId: string;

      if (decision.type === "create") {
        const newBoardId = `tab-${Date.now()}`;
        const newItemId = `item-${Date.now()}`;
        const newTab: Tab = {
          id: newBoardId,
          kind: "board",
          itemId: newItemId,
          title: t("workspace.boardTabTitle", { n: `${currentLayout.tabs.length + 1}` }),
        };

        setLayout((prev) => {
          const isMobileWidth = typeof window !== "undefined" && window.innerWidth < 768;
          let nextSplit = prev.split;
          let nextPrimary = prev.primary;
          let nextSecondary = prev.secondary;

          if (isMobileWidth) {
            nextPrimary = newBoardId;
          } else if (prev.split === "none") {
            nextSplit = "vertical";
            nextSecondary = newBoardId;
          } else {
            if (event.sourceTabId && prev.secondary === event.sourceTabId) {
              nextPrimary = newBoardId;
            } else {
              nextSecondary = newBoardId;
            }
          }

          return {
            ...prev,
            tabs: [...prev.tabs, newTab],
            tabBarOrder: [...prev.tabBarOrder, newBoardId],
            primary: nextPrimary,
            secondary: nextSecondary,
            split: nextSplit,
          };
        });

        targetTabId = newBoardId;
        mruBoardTabsRef.current = [newBoardId, ...mruBoardTabsRef.current.filter((id) => id !== newBoardId)];
      } else {
        targetTabId = decision.tabId;
        mruBoardTabsRef.current = [targetTabId, ...mruBoardTabsRef.current.filter((id) => id !== targetTabId)];

        setLayout((prev) => {
          const isVisible =
            prev.primary === targetTabId ||
            (prev.split !== "none" && prev.secondary === targetTabId);

          if (isVisible) return prev;

          const isMobileWidth = typeof window !== "undefined" && window.innerWidth < 768;
          if (isMobileWidth) {
            return { ...prev, primary: targetTabId };
          }

          if (prev.split === "none") {
            return {
              ...prev,
              split: "vertical",
              secondary: targetTabId,
            };
          } else {
            if (event.sourceTabId && prev.secondary === event.sourceTabId) {
              return { ...prev, primary: targetTabId };
            } else {
              return { ...prev, secondary: targetTabId };
            }
          }
        });
      }

      try {
        await insertCircuitSvgIntoBoard({
          projectId: projectId || "demo",
          tabId: targetTabId,
          svg: event.svg,
        });
      } catch (err) {
        console.error("[WorkspaceHost] Failed to insert circuit SVG into board:", err);
      }
    };

    const handlePdfSelectionToBoard = async (event: AppEvents["pdf:selection"]) => {
      const currentLayout = layoutRef.current;
      const decision = selectTargetBoard({
        explicitTabId: event.targetBoardTabId,
        sourceTabId: event.sourceTabId,
        layout: currentLayout,
        mruBoardTabIds: mruBoardTabsRef.current,
      });

      let targetTabId: string;

      if (decision.type === "create") {
        const newBoardId = `tab-${Date.now()}`;
        const newItemId = `item-${Date.now()}`;
        const newTab: Tab = {
          id: newBoardId,
          kind: "board",
          itemId: newItemId,
          title: t("workspace.boardTabTitle", { n: `${currentLayout.tabs.length + 1}` }),
        };

        setLayout((prev) => {
          const isMobileWidth = typeof window !== "undefined" && window.innerWidth < 768;
          let nextSplit = prev.split;
          let nextPrimary = prev.primary;
          let nextSecondary = prev.secondary;

          if (isMobileWidth) {
            nextPrimary = newBoardId;
          } else if (prev.split === "none") {
            nextSplit = "vertical";
            nextSecondary = newBoardId;
          } else {
            if (event.sourceTabId && prev.secondary === event.sourceTabId) {
              nextPrimary = newBoardId;
            } else {
              nextSecondary = newBoardId;
            }
          }

          return {
            ...prev,
            tabs: [...prev.tabs, newTab],
            tabBarOrder: [...prev.tabBarOrder, newBoardId],
            primary: nextPrimary,
            secondary: nextSecondary,
            split: nextSplit,
          };
        });

        targetTabId = newBoardId;
        mruBoardTabsRef.current = [newBoardId, ...mruBoardTabsRef.current.filter((id) => id !== newBoardId)];
      } else {
        targetTabId = decision.tabId;
        mruBoardTabsRef.current = [targetTabId, ...mruBoardTabsRef.current.filter((id) => id !== targetTabId)];

        setLayout((prev) => {
          const isVisible =
            prev.primary === targetTabId ||
            (prev.split !== "none" && prev.secondary === targetTabId);

          if (isVisible) return prev;

          const isMobileWidth = typeof window !== "undefined" && window.innerWidth < 768;
          if (isMobileWidth) {
            return { ...prev, primary: targetTabId };
          }

          if (prev.split === "none") {
            return {
              ...prev,
              split: "vertical",
              secondary: targetTabId,
            };
          } else {
            if (event.sourceTabId && prev.secondary === event.sourceTabId) {
              return { ...prev, primary: targetTabId };
            } else {
              return { ...prev, secondary: targetTabId };
            }
          }
        });
      }

      const link = formatAlphaLink({
        type: "pdf",
        itemId: event.docItemId,
        page: event.page,
      });

      try {
        await insertTextNoteIntoBoard({
          projectId: projectId || "demo",
          tabId: targetTabId,
          text: event.text,
          link,
        });
      } catch (err) {
        console.error("[WorkspaceHost] Failed to insert text note into board:", err);
      }
    };

    const handleBoardToPdf = async (event: AppEvents["board:to-pdf"]) => {
      const currentLayout = layoutRef.current;
      let targetPdfItemId = event.targetPdfItemId;

      if (!targetPdfItemId) {
        // Priority 1: The other visible pane if it is a PDF
        const otherPaneTabId =
          currentLayout.split !== "none"
            ? (event.sourceTabId === currentLayout.primary ? currentLayout.secondary : currentLayout.primary)
            : null;
        const otherTab = otherPaneTabId
          ? currentLayout.tabs.find((t) => t.id === otherPaneTabId)
          : null;

        if (otherTab && otherTab.kind === "pdf") {
          targetPdfItemId = otherTab.itemId;
        } else {
          // Priority 2: Any open PDF tab in layout
          const openPdfTab = currentLayout.tabs.find((t) => t.kind === "pdf");
          if (openPdfTab) {
            targetPdfItemId = openPdfTab.itemId;
          }
        }
      }

      try {
        await appendBoardToPdf({
          projectId: projectId || "default",
          targetPdfItemId,
          imageBlob: event.image,
        });
      } catch (err) {
        console.error("[WorkspaceHost] Failed to append board to PDF:", err);
      }
    };

    const handleNavigateAlphaEvent = (evt: AppEvents["navigate:alpha"]) => {
      handleNavigateAlpha(evt.url);
    };

    bus.on("pdf:page-to-board", handlePdfToBoard);
    bus.on("circuit:to-board", handleCircuitToBoard);
    bus.on("board:to-pdf", handleBoardToPdf);
    bus.on("pdf:selection", handlePdfSelectionToBoard);
    bus.on("navigate:alpha", handleNavigateAlphaEvent);

    return () => {
      bus.off("pdf:page-to-board", handlePdfToBoard);
      bus.off("circuit:to-board", handleCircuitToBoard);
      bus.off("board:to-pdf", handleBoardToPdf);
      bus.off("pdf:selection", handlePdfSelectionToBoard);
      bus.off("navigate:alpha", handleNavigateAlphaEvent);
    };
  }, [handleNavigateAlpha, projectId, t]);

  // Action: Open a tab or activate if already open
  const openTab = useCallback((tab: Tab) => {
    setLayout((prev) => {
      const exists = prev.tabs.some((t) => t.id === tab.id);
      if (exists) {
        return { ...prev, primary: tab.id };
      }
      // Stable DOM order: append to tabs, append to tabBarOrder
      return {
        ...prev,
        tabs: [...prev.tabs, tab],
        tabBarOrder: [...prev.tabBarOrder, tab.id],
        primary: tab.id,
      };
    });
  }, []);

  // Action: Activate tab in primary slot
  const activateTab = useCallback((tabId: string) => {
    const tab = layoutRef.current.tabs.find((t) => t.id === tabId);
    if (tab?.kind === "board") {
      mruBoardTabsRef.current = [tabId, ...mruBoardTabsRef.current.filter((id) => id !== tabId)];
    }
    setLayout((prev) => {
      if (prev.primary === tabId) return prev;
      // If activating the tab currently in secondary slot, swap them
      if (prev.split !== "none" && prev.secondary === tabId) {
        return {
          ...prev,
          primary: tabId,
          secondary: prev.primary,
        };
      }
      return { ...prev, primary: tabId };
    });
  }, []);

  // Action: Close tab
  const closeTab = useCallback((tabId: string) => {
    mruBoardTabsRef.current = mruBoardTabsRef.current.filter((id) => id !== tabId);
    setLayout((prev) => {
      if (prev.tabs.length <= 1) return prev; // Keep at least one tab

      const nextTabs = prev.tabs.filter((t) => t.id !== tabId);
      const nextTabBarOrder = prev.tabBarOrder.filter((id) => id !== tabId);

      let nextPrimary = prev.primary;
      let nextSecondary = prev.secondary;
      let nextSplit = prev.split;

      if (prev.primary === tabId) {
        if (prev.split !== "none" && prev.secondary && prev.secondary !== tabId) {
          nextPrimary = prev.secondary;
          nextSecondary = null;
          nextSplit = "none";
        } else {
          nextPrimary = nextTabBarOrder[0] || null;
        }
      } else if (prev.secondary === tabId) {
        nextSecondary = null;
        nextSplit = "none";
      }

      return {
        ...prev,
        tabs: nextTabs,
        tabBarOrder: nextTabBarOrder,
        primary: nextPrimary,
        secondary: nextSecondary,
        split: nextSplit,
      };
    });
  }, []);

  // Action: Toggle split mode
  const setSplit = useCallback(
    (mode: SplitMode) => {
      if (isMobile && mode !== "none") return;
      setLayout((prev) => {
        if (mode === "none") {
          return { ...prev, split: "none" };
        }
        // If enabling split and secondary is not set or same as primary, pick another tab
        let nextSecondary = prev.secondary;
        if (!nextSecondary || nextSecondary === prev.primary) {
          const alternate = prev.tabBarOrder.find((id) => id !== prev.primary);
          nextSecondary = alternate || null;
        }
        return {
          ...prev,
          split: mode,
          secondary: nextSecondary,
        };
      });
    },
    [isMobile]
  );

  // Action: Swap panes
  const swapPanes = useCallback(() => {
    setLayout((prev) => {
      if (prev.split === "none" || !prev.secondary || !prev.primary) return prev;
      return {
        ...prev,
        primary: prev.secondary,
        secondary: prev.primary,
      };
    });
  }, []);

  // Action: Set ratio with min width 320px constraint
  const updateRatio = useCallback((newRatio: number) => {
    setLayout((prev) => {
      const gridEl = gridRef.current;
      const gridWidth = gridEl ? gridEl.getBoundingClientRect().width : 0;
      const minRatio = gridWidth >= 640 ? Math.max(0.2, 320 / gridWidth) : 0.2;
      const maxRatio = gridWidth >= 640 ? Math.min(0.8, 1 - 320 / gridWidth) : 0.8;
      const clamped = Math.max(minRatio, Math.min(maxRatio, newRatio));
      return { ...prev, ratio: clamped };
    });
  }, []);

  // Action: Add new placeholder tab
  const handleAddNewTab = useCallback(() => {
    const nextIdx = layout.tabs.length + 1;
    const newTabObj: Tab = {
      id: `tab-${Date.now()}`,
      kind: nextIdx % 3 === 1 ? "board" : nextIdx % 3 === 2 ? "pdf" : "circuit",
      itemId: `item-${Date.now()}`,
      title: `${t("workspace.title")} ${nextIdx}`,
    };
    openTab(newTabObj);
  }, [layout.tabs.length, openTab, t]);

  // Tab bar keyboard navigation
  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const count = layout.tabBarOrder.length;
    let nextIndex = index;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = dir === "rtl" ? (index - 1 + count) % count : (index + 1) % count;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = dir === "rtl" ? (index + 1) % count : (index - 1 + count) % count;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = count - 1;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateTab(layout.tabBarOrder[index]);
      return;
    } else if (e.key === "Delete") {
      e.preventDefault();
      closeTab(layout.tabBarOrder[index]);
      return;
    } else {
      return;
    }

    tabRefs.current[nextIndex]?.focus();
  };

  // Divider pointer drag handling
  const handleDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);

    const isVertical = layout.split === "vertical";
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const gridRect = gridEl.getBoundingClientRect();

    const onPointerMove = (moveEv: PointerEvent) => {
      if (isVertical) {
        const total = gridRect.width;
        if (total <= 0) return;
        const offset =
          dir === "rtl"
            ? gridRect.right - moveEv.clientX
            : moveEv.clientX - gridRect.left;
        const newRatio = offset / total;
        updateRatio(newRatio);
      } else {
        const total = gridRect.height;
        if (total <= 0) return;
        const offset = moveEv.clientY - gridRect.top;
        const newRatio = offset / total;
        updateRatio(newRatio);
      }
    };

    const onPointerUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Divider keyboard handling (8px steps, Home/End)
  const handleDividerKeyDown = (e: React.KeyboardEvent) => {
    const gridEl = gridRef.current;
    if (!gridEl) return;
    const gridRect = gridEl.getBoundingClientRect();
    const isVertical = layout.split === "vertical";
    let totalDim = gridRect.height;
    if (isVertical) {
      totalDim = gridRect.width;
    }
    const stepRatio = totalDim > 0 ? 8 / totalDim : 0.02;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = dir === "rtl" ? stepRatio : -stepRatio;
      updateRatio(layout.ratio + delta);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const delta = dir === "rtl" ? -stepRatio : stepRatio;
      updateRatio(layout.ratio + delta);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      updateRatio(layout.ratio - stepRatio);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      updateRatio(layout.ratio + stepRatio);
    } else if (e.key === "Home") {
      e.preventDefault();
      updateRatio(0.2);
    } else if (e.key === "End") {
      e.preventDefault();
      updateRatio(0.8);
    }
  };

  return (
    <div
      data-testid="workspace-host"
      style={{
        display: "flex",
        flexDirection: "column",
        inlineSize: "100%",
        blockSize: "100vh",
        backgroundColor: "var(--bg-body)",
        color: "var(--text-main)",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .ws-grid {
          position: relative;
          inline-size: 100%;
          flex: 1;
          min-block-size: 0;
          display: grid;
          overflow: hidden;
          background-color: var(--bg-surface);
        }
        .ws-grid[data-split="none"] {
          grid-template-columns: 1fr;
          grid-template-rows: 1fr;
          grid-template-areas: "primary";
        }
        .ws-grid[data-split="vertical"] {
          grid-template-columns: calc(var(--ratio) * 100% - 4px) 8px calc((1 - var(--ratio)) * 100% - 4px);
          grid-template-rows: 1fr;
          grid-template-areas: "primary divider secondary";
        }
        [dir="rtl"] .ws-grid[data-split="vertical"] {
          grid-template-columns: calc((1 - var(--ratio)) * 100% - 4px) 8px calc(var(--ratio) * 100% - 4px);
          grid-template-areas: "secondary divider primary";
        }
        .ws-grid[data-split="horizontal"] {
          grid-template-columns: 1fr;
          grid-template-rows: calc(var(--ratio) * 100% - 4px) 8px calc((1 - var(--ratio)) * 100% - 4px);
          grid-template-areas: "primary" "divider" "secondary";
        }
        .pane[data-slot="primary"] {
          grid-area: primary;
          position: relative;
          inline-size: 100%;
          block-size: 100%;
          visibility: visible;
          z-index: 1;
          overflow: hidden;
          box-sizing: border-box;
        }
        .pane[data-slot="secondary"] {
          grid-area: secondary;
          position: relative;
          inline-size: 100%;
          block-size: 100%;
          visibility: visible;
          z-index: 1;
          overflow: hidden;
          box-sizing: border-box;
        }
        .pane[data-slot="hidden"] {
          position: absolute;
          inset: 0;
          inline-size: 100%;
          block-size: 100%;
          visibility: hidden;
          pointer-events: none;
          z-index: -1;
          box-sizing: border-box;
        }
        .ws-divider {
          grid-area: divider;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          touch-action: none;
          z-index: 10;
          background-color: transparent;
          outline: none;
          box-sizing: border-box;
        }
        .ws-divider::after {
          content: "";
          position: absolute;
          background-color: var(--border-card);
          transition: background-color var(--motion-fast) var(--ease-standard);
        }
        .ws-divider[data-split="vertical"] {
          cursor: col-resize;
          inline-size: 8px;
          block-size: 100%;
        }
        .ws-divider[data-split="vertical"]::after {
          inline-size: 2px;
          block-size: 100%;
        }
        .ws-divider[data-split="horizontal"] {
          cursor: row-resize;
          inline-size: 100%;
          block-size: 8px;
        }
        .ws-divider[data-split="horizontal"]::after {
          inline-size: 100%;
          block-size: 2px;
        }
        .ws-divider:hover::after,
        .ws-divider:focus-visible::after,
        .ws-divider[data-dragging="true"]::after {
          background-color: var(--focus-ring);
        }
        .ws-divider:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
        .ws-tab-btn {
          height: var(--control-lg);
          padding-inline: var(--space-3);
          border: 0;
          background: transparent;
          color: var(--text-muted);
          font-family: var(--font-sans);
          font-size: 0.875rem;
          font-weight: var(--weight-medium);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          position: relative;
          box-sizing: border-box;
          white-space: nowrap;
          border-block-end: 2px solid transparent;
          transition: color var(--motion-fast) var(--ease-standard),
                      background-color var(--motion-fast) var(--ease-standard);
        }
        .ws-tab-btn:hover {
          color: var(--text-main);
          background-color: var(--bg-surface);
        }
        .ws-tab-btn[data-active="true"] {
          color: var(--text-main);
          background-color: var(--bg-surface);
          border-block-end-color: var(--accent-text);
          font-weight: var(--weight-semibold);
        }
        .ws-tab-btn:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: -2px;
        }
        .ws-tool-btn {
          inline-size: var(--control-sm);
          block-size: var(--control-sm);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-sm);
          background-color: var(--bg-subtle);
          color: var(--text-main);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-sizing: border-box;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .ws-tool-btn:hover:not(:disabled) {
          background-color: var(--bg-surface);
          border-color: var(--border-input);
        }
        .ws-tool-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .ws-tool-btn:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
        .drag-shield {
          position: fixed;
          inset: 0;
          z-index: 9999;
          cursor: col-resize;
        }
        .ws-grid[data-split="horizontal"] .drag-shield {
          cursor: row-resize;
        }
      `}</style>

      {/* Global Drive error / quota banner */}
      <DriveStatusBanner onExportClick={() => setShowExportDialog(true)} />

      {/* Pane Toolbar (48px height per DESIGN.md §4.2) */}
      <header
        style={{
          blockSize: "var(--control-lg)",
          paddingInline: "var(--space-3)",
          borderBlockEnd: "1px solid var(--border-card)",
          backgroundColor: "var(--bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxSizing: "border-box",
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              color: "var(--text-main)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: "var(--weight-semibold)",
            }}
          >
            <span
              style={{
                inlineSize: "24px",
                blockSize: "24px",
                borderRadius: "var(--radius-sm)",
                background: "var(--gradient-accent)",
                color: "var(--btn-gold-text)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: "var(--weight-bold)",
              }}
            >
              α
            </span>
            <span>{t("common.appName")}</span>
          </Link>

          <span
            style={{
              fontSize: "0.8125rem",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-subtle)",
              paddingBlock: "var(--space-1)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              boxSizing: "border-box",
            }}
          >
            <bdi dir="ltr">{projectId || "demo"}</bdi>
          </span>

          <SaveStatusIndicator />
        </div>

        {/* Split and layout controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <button
            type="button"
            onClick={() => setSplit("none")}
            disabled={layout.split === "none"}
            className="ws-tool-btn"
            title={t("workspace.singleView")}
            aria-label={t("workspace.singleView")}
            data-testid="split-none-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setSplit("vertical")}
            disabled={isMobile || layout.split === "vertical"}
            className="ws-tool-btn"
            title={isMobile ? t("workspace.splitDisabledMobile") : t("workspace.verticalSplit")}
            aria-label={t("workspace.verticalSplit")}
            data-testid="split-vertical-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="12" x2="12" y1="3" y2="21" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setSplit("horizontal")}
            disabled={isMobile || layout.split === "horizontal"}
            className="ws-tool-btn"
            title={isMobile ? t("workspace.splitDisabledMobile") : t("workspace.horizontalSplit")}
            aria-label={t("workspace.horizontalSplit")}
            data-testid="split-horizontal-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="3" x2="21" y1="12" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            onClick={swapPanes}
            disabled={layout.split === "none"}
            className="ws-tool-btn"
            title={t("workspace.swapPanes")}
            aria-label={t("workspace.swapPanes")}
            data-testid="swap-panes-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m16 3 4 4-4 4" />
              <path d="M20 7H4" />
              <path d="m8 21-4-4 4-4" />
              <path d="M4 17h16" />
            </svg>
          </button>

          <div
            style={{
              inlineSize: "1px",
              blockSize: "24px",
              backgroundColor: "var(--border-card)",
              marginInline: "var(--space-1)",
            }}
          />

          {projectId && (
            <button
              type="button"
              onClick={() => setShowModeSwitch(true)}
              className="ws-tool-btn"
              title={
                projectInfo?.storage === "drive"
                  ? t("modeSwitch.moveToLocal")
                  : t("modeSwitch.moveToDrive")
              }
              aria-label={
                projectInfo?.storage === "drive"
                  ? t("modeSwitch.moveToLocal")
                  : t("modeSwitch.moveToDrive")
              }
              data-testid="workspace-mode-switch-btn"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {projectInfo?.storage === "drive" ? (
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                ) : (
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                )}
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowExportDialog(true)}
            className="ws-tool-btn"
            title={t("export.title")}
            aria-label={t("export.title")}
            data-testid="workspace-export-btn"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tab Bar (48px height per DESIGN.md §4.2) */}
      <nav
        aria-label="Workspace tabs"
        style={{
          blockSize: "var(--control-lg)",
          backgroundColor: "var(--bg-subtle)",
          borderBlockEnd: "1px solid var(--border-card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingInline: "var(--space-2)",
          boxSizing: "border-box",
          overflowX: "auto",
        }}
      >
        <div role="tablist" style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          {layout.tabBarOrder.map((tabId, idx) => {
            const tab = layout.tabs.find((t) => t.id === tabId);
            if (!tab) return null;
            const isPrimary = layout.primary === tabId;
            const isSecondary = layout.split !== "none" && layout.secondary === tabId;

            return (
              <button
                key={tabId}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                onClick={() => activateTab(tabId)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className="ws-tab-btn"
                data-active={isPrimary}
                data-secondary={isSecondary}
                data-testid={`tab-btn-${tabId}`}
                aria-selected={isPrimary}
              >
                <span>{tab.title}</span>

                {layout.tabs.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`${t("workspace.closeTab")} ${tab.title}`}
                    data-testid={`tab-close-${tabId}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tabId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        closeTab(tabId);
                      }
                    }}
                    style={{
                      inlineSize: "16px",
                      blockSize: "16px",
                      borderRadius: "var(--radius-sm)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      marginInlineStart: "var(--space-1)",
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddNewTab}
          className="ws-tool-btn"
          title={t("workspace.newTab")}
          aria-label={t("workspace.newTab")}
          data-testid="add-tab-btn"
          style={{ flexShrink: 0 }}
        >
          +
        </button>
      </nav>

      {/* Workspace Grid with Stable DOM Panes and CSS Grid Placement */}
      <div
        ref={gridRef}
        className="ws-grid"
        data-split={layout.split}
        data-testid="ws-grid"
        style={
          {
            "--ratio": layout.ratio,
          } as React.CSSProperties
        }
      >
        {/*
          MANDATORY ARCHITECTURE RULE §6.2:
          Render every tab in stable layout.tabs DOM order.
          Never re-key, never re-parent. Only data-slot changes.
        */}
        {layout.tabs.map((tab) => {
          const slot = slotOf(layout, tab.id);
          return (
            <section
              key={tab.id}
              className="pane"
              data-slot={slot}
              data-tab-id={tab.id}
              data-testid={`pane-slot-${tab.id}`}
              style={{
                backgroundColor: "var(--bg-surface)",
                boxSizing: "border-box",
              }}
            >
              {tab.isIframe ? (
                <IframePlaceholder
                  tab={tab}
                  visible={slot !== "hidden"}
                  onMount={onPaneMount}
                />
              ) : tab.kind === "circuit" ? (
                <CircuitPane
                  projectId={projectId || "demo"}
                  tab={tab}
                  visible={slot !== "hidden"}
                  onMount={onPaneMount}
                />
              ) : tab.kind === "board" ? (
                <BoardPane
                  projectId={projectId || "demo"}
                  tab={tab}
                  visible={slot !== "hidden"}
                  onMount={onPaneMount}
                />
              ) : tab.kind === "pdf" ? (
                <PdfPane
                  projectId={projectId || "demo"}
                  tab={tab}
                  visible={slot !== "hidden"}
                  onMount={onPaneMount}
                />
              ) : (
                <StaticPlaceholder
                  tab={tab}
                  visible={slot !== "hidden"}
                  onMount={onPaneMount}
                />
              )}
            </section>
          );
        })}

        {/* Draggable Divider (8px hit area, 2px visible line) */}
        {layout.split !== "none" && (
          <div
            role="separator"
            tabIndex={0}
            className="ws-divider"
            data-split={layout.split}
            data-dragging={dragging}
            data-testid="ws-divider"
            aria-label={t("workspace.dividerAriaLabel")}
            aria-valuenow={Math.round(layout.ratio * 100)}
            onPointerDown={handleDividerPointerDown}
            onKeyDown={handleDividerKeyDown}
          />
        )}

        {/* Transparent Full-Screen Drag Shield so Iframes cannot swallow pointer events */}
        {dragging && <div className="drag-shield" data-testid="drag-shield" />}
      </div>

      {/* Export .alpha dialog (Task 31 / ALPHA-6) */}
      <ExportDialog
        projectId={projectId || "demo"}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />

      {/* Mode Switch Modal (Local <-> Drive) */}
      {showModeSwitch && projectId && (
        <ModeSwitchModal
          projectId={projectId}
          projectTitle={projectInfo?.title || "Project"}
          targetMode={projectInfo?.storage === "drive" ? "local" : "drive"}
          isOpen={showModeSwitch}
          onClose={() => setShowModeSwitch(false)}
          onSuccess={() => {
            setProjectInfo((prev) =>
              prev
                ? { ...prev, storage: prev.storage === "drive" ? "local" : "drive" }
                : null
            );
            setShowModeSwitch(false);
          }}
        />
      )}
    </div>
  );
}
