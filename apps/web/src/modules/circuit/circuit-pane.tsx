"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "@/workspace/types";
import { useI18n } from "@/i18n/provider";
import { projectService } from "@/core/storage";
import { bus } from "@/core/bus";
import { CircuitAdapter } from "./circuit-adapter";
import { buildCircuitUrl } from "./circuit-url";
import { CircuitToolbar, type CircuitSpeed } from "./circuit-toolbar";

export interface CircuitPaneProps {
  projectId: string;
  tab: Tab;
  visible: boolean;
  hasBoardOpen?: boolean;
  hasBoardTab?: boolean;
  onMount?: (tabId: string, token: string) => void;
  pauseWhenHiddenDefault?: boolean;
}

/**
 * Detects mobile device based on pointer coarse or viewport width < 768px.
 * Used for CIRC-4 default pause-when-hidden setting.
 */
function isMobileEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const isCoarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const isNarrow = window.innerWidth < 768;
  return isCoarse || isNarrow;
}

export function CircuitPane({
  projectId,
  tab,
  visible,
  hasBoardOpen,
  hasBoardTab,
  onMount,
  pauseWhenHiddenDefault,
}: CircuitPaneProps) {
  const isBoardOpen = hasBoardOpen ?? hasBoardTab ?? false;
  const { t, resolvedTheme: i18nTheme, language } = useI18n();

  // Track DOM data-theme attribute in addition to i18n theme context
  const [domTheme, setDomTheme] = useState<"light" | "dark">(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      setDomTheme(isDark ? "dark" : "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const resolvedTheme = domTheme === "dark" || i18nTheme === "dark" ? "dark" : "light";

  // Persistent identity token for mount-tracking & Strict Mode safety
  const [identityToken] = useState(() => {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `pane-${tab.id}-circuit`;
  });

  // Framework-agnostic adapter instance created once and maintained across renders
  const [adapter] = useState(() => new CircuitAdapter());

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Helper to trigger GWT resize calculations and canvas dimension updates
  const dispatchResize = useCallback(() => {
    try {
      const cw = iframeRef.current?.contentWindow;
      if (cw) {
        cw.dispatchEvent(new Event("resize"));
      }
    } catch {
      // Non-fatal if cross-origin or in teardown
    }
  }, []);

  // ResizeObserver on the iframe container to trigger canvas resize on layout changes / split view
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let rafId: number | null = null;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            dispatchResize();
          });
        }
      }
    });

    observer.observe(container);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [dispatchResize]);

  // When pane becomes visible (tab switch or split view toggle), dispatch resize to update canvas dimensions
  useEffect(() => {
    if (visible) {
      dispatchResize();
      const rafId = requestAnimationFrame(() => {
        dispatchResize();
      });
      const timer = setTimeout(() => {
        dispatchResize();
      }, 50);
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timer);
      };
    }
  }, [visible, dispatchResize]);

  // Per-tab "pause when hidden" option: default ON on mobile, OFF on desktop per CIRC-4
  const [pauseWhenHidden, setPauseWhenHidden] = useState<boolean>(() => {
    return pauseWhenHiddenDefault ?? isMobileEnvironment();
  });

  // Track if simulation was running before being paused by hidden state
  const wasRunningBeforeHiddenRef = useRef<boolean>(false);

  // Track simulation state for UI indicator badge and toolbar
  const [isAttached, setIsAttached] = useState<boolean>(() => adapter.isAttached());
  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  const [isExportingToBoard, setIsExportingToBoard] = useState<boolean>(false);

  // Circuit Toolbar state (Task 42)
  const [isAdvancedMenu, setIsAdvancedMenu] = useState<boolean>(false);
  const [speed, setSpeed] = useState<CircuitSpeed>("normal");
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const handleSendToBoard = useCallback(async () => {
    if (!isBoardOpen || !isAttached || isExportingToBoard) return;
    setIsExportingToBoard(true);
    try {
      const svg = await adapter.requestSVG();
      bus.emit("circuit:to-board", {
        circuitItemId: tab.itemId,
        svg,
        sourceTabId: tab.id,
      });
    } catch (err) {
      console.error("[CircuitPane] Failed to send circuit to board:", err);
    } finally {
      setIsExportingToBoard(false);
    }
  }, [isBoardOpen, isAttached, isExportingToBoard, adapter, tab.itemId, tab.id]);

  // Preserve circuit text during theme reload or advanced menu toggle
  const preservedCircuitRef = useRef<string | null>(null);

  // Track previous theme to trigger reload on changes
  const prevThemeRef = useRef(resolvedTheme);
  const prevLangRef = useRef(language);

  // Iframe URL state based on current theme, language, and advanced menu toggle
  const [iframeSrc, setIframeSrc] = useState(() => {
    return buildCircuitUrl({ theme: resolvedTheme, lang: language, hideMenu: true });
  });

  // Keep visible and pauseWhenHidden in refs for onReady callback
  const visibleRef = useRef(visible);
  const pauseWhenHiddenRef = useRef(pauseWhenHidden);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    pauseWhenHiddenRef.current = pauseWhenHidden;
  }, [pauseWhenHidden]);

  // Inform host of mount
  useEffect(() => {
    onMount?.(tab.id, identityToken);
  }, [tab.id, identityToken, onMount]);

  // Handle iframe load event and attach adapter
  const handleIframeLoad = useCallback(() => {
    // Re-enable beforeunload guard once iframe has loaded after a toggle or theme reload
    projectService.setBypassBeforeUnload(false);

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Prevent any programmatic or browser-focus scroll inside the iframe
    try {
      const cw = iframe.contentWindow;
      cw.addEventListener("scroll", () => {
        if (cw.scrollX !== 0 || cw.scrollY !== 0) {
          cw.scrollTo(0, 0);
        }
      });
    } catch {
      // cross-origin safety
    }

    adapter.attach(iframe.contentWindow);
    if (adapter.isAttached()) {
      setIsAttached(true);
    }
    requestAnimationFrame(() => {
      dispatchResize();
    });
  }, [adapter, dispatchResize]);

  // Track if initial circuit restoration is complete
  const initialLoadDoneRef = useRef(false);

  // Set up ready & analyze listeners
  useEffect(() => {
    // 1. When the simulator is ready: sync running state and pause-when-hidden
    const unsubscribeReady = adapter.onReady((api) => {
      setIsAttached(true);
      setIsSimRunning(api.isRunning());
      requestAnimationFrame(() => {
        dispatchResize();
      });

      // If initially hidden and pause-when-hidden is enabled, pause simulation
      if (!visibleRef.current && pauseWhenHiddenRef.current) {
        if (api.isRunning()) {
          wasRunningBeforeHiddenRef.current = true;
          api.setSimRunning(false);
          setIsSimRunning(false);
        }
      }
    });

    // 2. On analyze: handle initial import/restoration or auto-save through ProjectService
    const unsubscribeAnalyze = adapter.onAnalyze(async (sim) => {
      setIsSimRunning(sim.isRunning());

      // On initial setup completion: restore preserved circuit from theme reload or load saved circuit
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;

        // If we preserved circuit text during a theme reload, restore it
        if (preservedCircuitRef.current) {
          const circuitToRestore = preservedCircuitRef.current;
          preservedCircuitRef.current = null;
          try {
            adapter.importCircuit(circuitToRestore, false);
            return;
          } catch (err) {
            console.error("Failed to restore circuit after theme change:", err);
          }
        }

        // Otherwise load from ProjectService storage
        try {
          const savedPayload = await projectService.readItem(projectId, tab.itemId);
          if (savedPayload && savedPayload.trim().length > 0) {
            adapter.importCircuit(savedPayload, false);
            return;
          }
        } catch {
          // No prior circuit saved for this item yet; CircuitJS1 uses its default circuit
        }
      }

      // Normal user edit or post-import analyze: auto-save circuit through ProjectService
      try {
        const text = adapter.exportCircuit();
        if (text && text.trim().length > 0) {
          projectService.saveCircuit(projectId, tab.itemId, text, tab.title);
        }
      } catch (err) {
        console.error("Failed to auto-save circuit on analyze:", err);
      }
    });

    // 3. On update: keep status badge in sync
    const unsubscribeUpdate = adapter.onUpdate((sim) => {
      setIsSimRunning(sim.isRunning());
    });

    return () => {
      unsubscribeReady();
      unsubscribeAnalyze();
      unsubscribeUpdate();
    };
  }, [adapter, projectId, tab.itemId, tab.title, dispatchResize]);

  // Ensure beforeunload bypass is restored if component unmounts
  useEffect(() => {
    return () => {
      projectService.setBypassBeforeUnload(false);
    };
  }, []);

  // Handle Theme and Language Changes (CIRC-3)
  useEffect(() => {
    const themeChanged = prevThemeRef.current !== resolvedTheme;
    const langChanged = prevLangRef.current !== language;

    if (themeChanged || langChanged) {
      prevThemeRef.current = resolvedTheme;
      prevLangRef.current = language;

      // Export current circuit before reload to preserve user changes
      if (adapter.isAttached()) {
        try {
          const currentCircuit = adapter.exportCircuit();
          if (currentCircuit) {
            preservedCircuitRef.current = currentCircuit;
            // Also flush save to storage
            projectService.saveCircuit(projectId, tab.itemId, currentCircuit, tab.title);
          }
        } catch (err) {
          console.error("Failed to export circuit before theme reload:", err);
        }
      }

      // Explicitly flush queue and temporarily bypass beforeunload prompt on theme reload
      void projectService.flushNow();
      projectService.setBypassBeforeUnload(true);

      // Suppress iframe GWT beforeunload on theme reload
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.onbeforeunload = null;
          iframe.contentWindow.addEventListener(
            "beforeunload",
            (e) => {
              e.stopImmediatePropagation();
              delete (e as unknown as { returnValue?: unknown }).returnValue;
            },
            true
          );
        } catch {
          // Cross-origin safety
        }
      }

      initialLoadDoneRef.current = false;

      // Reload iframe with new URL parameters
      setIframeSrc(buildCircuitUrl({ theme: resolvedTheme, lang: language, hideMenu: !isAdvancedMenu }));
    }
  }, [resolvedTheme, language, isAdvancedMenu, adapter, projectId, tab.itemId, tab.title]);

  // Toolbar Actions (Task 42)
  const handleToggleRun = useCallback(() => {
    const next = !isSimRunning;
    adapter.setSimRunning(next);
    setIsSimRunning(next);
  }, [adapter, isSimRunning]);

  const handleReset = useCallback(() => {
    adapter.resetCircuit();
    setIsSimRunning(true);
  }, [adapter]);

  const handleSelectComponent = useCallback(
    (className: string) => {
      adapter.runCommand("main", className);
      setSelectedComponent(className);
    },
    [adapter]
  );

  const handleChangeSpeed = useCallback(
    (newSpeed: CircuitSpeed) => {
      setSpeed(newSpeed);
      adapter.setTimeStepSpeed(newSpeed);
    },
    [adapter]
  );

  const handleToggleAdvancedMenu = useCallback(async () => {
    const nextAdvanced = !isAdvancedMenu;

    // 1. Export current circuit before reload to preserve user changes
    if (adapter.isAttached()) {
      try {
        const currentCircuit = adapter.exportCircuit();
        if (currentCircuit) {
          preservedCircuitRef.current = currentCircuit;
          projectService.saveCircuit(projectId, tab.itemId, currentCircuit, tab.title);
        }
      } catch (err) {
        console.error("Failed to export circuit before toggling advanced menu:", err);
      }
    }

    // 2. Explicitly flush save queue to ensure all changes are written before reload
    try {
      await projectService.flushNow();
    } catch (err) {
      console.warn("Failed to flush projectService queue before toggling toolbar:", err);
    }

    // 3. Temporarily bypass beforeunload guard during toolbar toggle
    projectService.setBypassBeforeUnload(true);

    // 4. Disable iframe's GWT Window.ClosingHandler before reloading iframe
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.onbeforeunload = null;
        iframe.contentWindow.addEventListener(
          "beforeunload",
          (e) => {
            e.stopImmediatePropagation();
            delete (e as unknown as { returnValue?: unknown }).returnValue;
          },
          true
        );
      } catch {
        // Cross-origin safety
      }
    }

    initialLoadDoneRef.current = false;
    setIsAdvancedMenu(nextAdvanced);

    // 5. Reload iframe with native menu visible (hideMenu: false) or hidden (hideMenu: true)
    setIframeSrc(
      buildCircuitUrl({
        theme: resolvedTheme,
        lang: language,
        hideMenu: !nextAdvanced,
      })
    );
  }, [adapter, isAdvancedMenu, resolvedTheme, language, projectId, tab.itemId, tab.title]);

  // Handle "pause when hidden" option upon visibility changes (CIRC-4)
  useEffect(() => {
    if (!adapter.isAttached()) return;
    if (!pauseWhenHidden) return;

    if (!visible) {
      // Pane became hidden: pause simulator if it was running
      const running = adapter.isRunning();
      if (running) {
        wasRunningBeforeHiddenRef.current = true;
        adapter.setSimRunning(false);
        queueMicrotask(() => setIsSimRunning(false));
      }
    } else {
      // Pane became visible: restore simulation if it was running before being hidden
      if (wasRunningBeforeHiddenRef.current) {
        wasRunningBeforeHiddenRef.current = false;
        adapter.setSimRunning(true);
        queueMicrotask(() => setIsSimRunning(true));
      }
    }
  }, [visible, pauseWhenHidden, adapter]);

  // Clean up adapter and iframe on unmount to properly destroy instance
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe && (!iframe.src || iframe.src.endsWith("about:blank"))) {
      iframe.src = iframeSrc;
    }
    return () => {
      adapter.detach();
      if (iframe) {
        try {
          const sim = (iframe.contentWindow as unknown as { CircuitJS1?: { setSimRunning?: (run: boolean) => void } })?.CircuitJS1;
          sim?.setSimRunning?.(false);
          iframe.src = "about:blank";
        } catch {
          // Non-fatal cleanup
        }
      }
    };
  }, [adapter, iframeSrc]);

  return (
    <div
      data-testid={`pane-circuit-${tab.id}`}
      className="circuit-pane"
      data-pane-id={tab.id}
      data-identity-token={identityToken}
      style={{
        inlineSize: "100%",
        blockSize: "100%",
        backgroundColor: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Unified Single React Circuit Toolbar Header */}
      <CircuitToolbar
        adapter={adapter}
        isSimRunning={isSimRunning}
        onToggleRun={handleToggleRun}
        onReset={handleReset}
        onSelectComponent={handleSelectComponent}
        selectedComponent={selectedComponent}
        speed={speed}
        onChangeSpeed={handleChangeSpeed}
        onToggleAdvancedMenu={handleToggleAdvancedMenu}
        isAdvancedMenu={isAdvancedMenu}
        isBoardOpen={isBoardOpen}
        isExportingToBoard={isExportingToBoard}
        onSendToBoard={handleSendToBoard}
        pauseWhenHidden={pauseWhenHidden}
        onTogglePauseWhenHidden={setPauseWhenHidden}
      />

      {/* Same-origin Iframe (fills the pane) */}
      <div
        ref={containerRef}
        data-testid="circuit-iframe-container"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          inlineSize: "100%",
          blockSize: "100%",
          position: "relative",
          minHeight: 0,
          minBlockSize: 0,
          overflow: "hidden",
        }}
      >
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={tab.title}
          data-testid="circuit-iframe"
          onLoad={handleIframeLoad}
          style={{
            width: "100%",
            height: "100%",
            inlineSize: "100%",
            blockSize: "100%",
            border: "none",
            display: "block",
            backgroundColor: "var(--bg-surface)",
          }}
        />
      </div>
    </div>
  );
}
