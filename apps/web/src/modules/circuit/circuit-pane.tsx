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

export const CircuitPane = React.memo(
  function CircuitPane({
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
      const iframe = iframeRef.current;
      const cw = iframe?.contentWindow;
      if (cw && typeof cw.dispatchEvent === "function") {
        // Clamping check: ensure meaningful non-zero dimensions to avoid scope wave distortion
        const isVisibleInDom = !!iframe && iframe.offsetWidth > 0 && iframe.offsetHeight > 0;
        const winWidth = iframe?.offsetWidth || cw.innerWidth || iframe?.clientWidth || 0;
        const winHeight = iframe?.offsetHeight || cw.innerHeight || iframe?.clientHeight || 0;
        if (isVisibleInDom && winWidth >= 200 && winHeight >= 150) {
          cw.dispatchEvent(new Event("resize"));
          const gwtObj = (cw as unknown as { CircuitJS1?: { setCanvasSize?: () => void; refresh?: () => void } }).CircuitJS1;
          if (typeof gwtObj?.setCanvasSize === "function") {
            try {
              gwtObj.setCanvasSize();
            } catch {
              // ignore
            }
          }
        } else if (winWidth > 0 && winHeight > 0) {
          cw.dispatchEvent(new Event("resize"));
        }
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastDispatchTime = 0;
    const THROTTLE_MS = 100;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Clamp to non-zero, meaningful dimensions
        if (width >= 200 && height >= 150) {
          const now = Date.now();
          if (now - lastDispatchTime >= THROTTLE_MS) {
            lastDispatchTime = now;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              dispatchResize();
            });
          }
          // Debounced trailing dispatch so settled dimensions are accurately reflected
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            dispatchResize();
          }, 150);
        }
      }
    });

    observer.observe(container);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [dispatchResize]);

  // When pane becomes visible (tab switch or split view toggle), dispatch resize to update canvas dimensions
  useEffect(() => {
    if (visible) {
      const rafId = requestAnimationFrame(() => {
        dispatchResize();
      });
      const timer50 = setTimeout(() => {
        dispatchResize();
      }, 50);
      const timer150 = setTimeout(() => {
        dispatchResize();
      }, 150);
      const timer200 = setTimeout(() => {
        dispatchResize();
      }, 200);
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timer50);
        clearTimeout(timer150);
        clearTimeout(timer200);
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
  const [isCircuitEmpty, setIsCircuitEmpty] = useState<boolean>(() => {
    return adapter.getElements().length === 0;
  });

  // Circuit Toolbar state (Task 42)
  const [isAdvancedMenu, setIsAdvancedMenu] = useState<boolean>(false);
  const [speed, setSpeed] = useState<CircuitSpeed>("normal");
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const handleSendToBoard = useCallback(async () => {
    if (!isBoardOpen || !isAttached || isExportingToBoard || isCircuitEmpty) return;
    setIsExportingToBoard(true);
    try {
      const svg = await adapter.requestSVG();
      bus.emit("circuit:to-board", {
        circuitItemId: tab.itemId,
        svg,
        sourceTabId: tab.id,
      });
    } catch (err) {
      console.warn("[CircuitPane] Failed to send circuit to board:", err);
    } finally {
      setIsExportingToBoard(false);
    }
  }, [isBoardOpen, isAttached, isExportingToBoard, isCircuitEmpty, adapter, tab.itemId, tab.id]);

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
    setTimeout(() => {
      dispatchResize();
    }, 50);
    setTimeout(() => {
      dispatchResize();
    }, 150);
  }, [adapter, dispatchResize]);

  // Track if initial circuit restoration is complete
  const initialLoadDoneRef = useRef(false);

  // Set up ready & analyze listeners
  useEffect(() => {
    // 1. When the simulator is ready: sync running state and pause-when-hidden
    const unsubscribeReady = adapter.onReady((api) => {
      setIsAttached(true);
      setIsSimRunning(api.isRunning());
      setIsCircuitEmpty((api.getElements?.()?.length ?? 0) === 0);
      requestAnimationFrame(() => {
        dispatchResize();
      });
      setTimeout(() => {
        dispatchResize();
      }, 50);
      setTimeout(() => {
        dispatchResize();
      }, 150);

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
      setIsCircuitEmpty((sim.getElements?.()?.length ?? 0) === 0);

      // On initial setup completion: restore preserved circuit from theme reload or load saved circuit
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;

        const applyCircuitWithLayoutStabilization = (circuitText: string) => {
          try {
            // Recalculate dimensions before import to ensure proper canvas bounds
            dispatchResize();
            adapter.importCircuit(circuitText, false);

            // Force immediate recalculation of canvas dimensions and internal state per Requirement 2
            dispatchResize();
            const maybeSim = sim as unknown as { refresh?: () => void };
            if (typeof maybeSim.refresh === "function") {
              try {
                maybeSim.refresh();
              } catch {
                // Non-fatal
              }
            }

            // Small delays (RAF and timers) after iframe load and circuit import per Requirement 3
            if (typeof requestAnimationFrame === "function") {
              requestAnimationFrame(() => {
                dispatchResize();
              });
            }
            setTimeout(() => {
              dispatchResize();
            }, 50);
            setTimeout(() => {
              dispatchResize();
            }, 150);
            setTimeout(() => {
              dispatchResize();
            }, 200);
            setTimeout(() => {
              dispatchResize();
            }, 300);
          } catch (err) {
            console.error("Failed to import circuit:", err);
          }
        };

        // If we preserved circuit text during a theme reload, restore it
        if (preservedCircuitRef.current) {
          const circuitToRestore = preservedCircuitRef.current;
          preservedCircuitRef.current = null;
          applyCircuitWithLayoutStabilization(circuitToRestore);
          return;
        }

        // Otherwise load from ProjectService storage
        try {
          const savedPayload = await projectService.readItem(projectId, tab.itemId);
          if (savedPayload && savedPayload.trim().length > 0) {
            applyCircuitWithLayoutStabilization(savedPayload);
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
        isCircuitEmpty={isCircuitEmpty}
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
          zIndex: 1,
          minHeight: "calc(var(--space-8) * 3)",
          minWidth: "calc(var(--space-8) * 4)",
          minBlockSize: "calc(var(--space-8) * 3)",
          minInlineSize: "calc(var(--space-8) * 4)",
          overflow: "hidden",
          contain: "strict",
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
            minWidth: "calc(var(--space-8) * 4)",
            minHeight: "calc(var(--space-8) * 3)",
          }}
        />
      </div>
    </div>
  );
},
(prev, next) => {
  return (
    prev.projectId === next.projectId &&
    prev.tab.id === next.tab.id &&
    prev.tab.itemId === next.tab.itemId &&
    prev.tab.title === next.tab.title &&
    prev.tab.kind === next.tab.kind &&
    prev.visible === next.visible &&
    prev.hasBoardOpen === next.hasBoardOpen &&
    prev.hasBoardTab === next.hasBoardTab &&
    prev.pauseWhenHiddenDefault === next.pauseWhenHiddenDefault
  );
});
