"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "@/workspace/types";
import { useI18n } from "@/i18n/provider";
import { projectService } from "@/core/storage";
import { CircuitAdapter } from "./circuit-adapter";
import { buildCircuitUrl } from "./circuit-url";

export interface CircuitPaneProps {
  projectId: string;
  tab: Tab;
  visible: boolean;
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
  onMount,
  pauseWhenHiddenDefault,
}: CircuitPaneProps) {
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

  // Per-tab "pause when hidden" option: default ON on mobile, OFF on desktop per CIRC-4
  const [pauseWhenHidden, setPauseWhenHidden] = useState<boolean>(() => {
    return pauseWhenHiddenDefault ?? isMobileEnvironment();
  });

  // Track if simulation was running before being paused by hidden state
  const wasRunningBeforeHiddenRef = useRef<boolean>(false);

  // Track simulation state for UI indicator badge
  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);

  // Preserve circuit text during theme reload
  const preservedCircuitRef = useRef<string | null>(null);

  // Track previous theme to trigger reload on changes
  const prevThemeRef = useRef(resolvedTheme);
  const prevLangRef = useRef(language);

  // Iframe URL state based on current theme and language
  const [iframeSrc, setIframeSrc] = useState(() => {
    return buildCircuitUrl({ theme: resolvedTheme, lang: language });
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
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    adapter.attach(iframe.contentWindow);
  }, [adapter]);

  // Track if initial circuit restoration is complete
  const initialLoadDoneRef = useRef(false);

  // Set up ready & analyze listeners
  useEffect(() => {
    // 1. When the simulator is ready: sync running state and pause-when-hidden
    const unsubscribeReady = adapter.onReady((api) => {
      setIsSimRunning(api.isRunning());

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
  }, [adapter, projectId, tab.itemId, tab.title]);

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

      initialLoadDoneRef.current = false;

      // Reload iframe with new URL parameters
      setIframeSrc(buildCircuitUrl({ theme: resolvedTheme, lang: language }));
    }
  }, [resolvedTheme, language, adapter, projectId, tab.itemId, tab.title]);

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

  // Clean up adapter on unmount
  useEffect(() => {
    return () => {
      adapter.detach();
    };
  }, [adapter]);

  return (
    <div
      data-testid={`pane-circuit-${tab.id}`}
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
      {/* Top Chrome Strip (Tokens only, multiple of 8px) */}
      <div
        data-testid="circuit-pane-header"
        style={{
          blockSize: "var(--control-sm)",
          minBlockSize: "var(--control-sm)",
          paddingInline: "var(--space-2)",
          backgroundColor: "var(--bg-subtle)",
          borderBlockEnd: "1px solid var(--border-card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          fontFamily: "var(--font-sans)",
          color: "var(--text-muted)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontWeight: "var(--weight-semibold)", color: "var(--text-main)" }}>
            {tab.title}
          </span>
          <span
            data-testid="sim-status-badge"
            style={{
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono)",
              display: "inline-flex",
              alignItems: "center",
              paddingInline: "var(--space-1)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: isSimRunning ? "var(--badge-tech-bg)" : "var(--bg-surface)",
              color: isSimRunning ? "var(--badge-tech-fg)" : "var(--text-muted)",
              border: `1px solid ${isSimRunning ? "var(--badge-tech-bd)" : "var(--border-card)"}`,
            }}
          >
            {isSimRunning ? t("circuit.simRunning") : t("circuit.simPaused")}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <label
            data-testid="pause-when-hidden-label"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              cursor: "pointer",
              fontSize: "0.75rem",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              data-testid="pause-when-hidden-checkbox"
              checked={pauseWhenHidden}
              onChange={(e) => setPauseWhenHidden(e.target.checked)}
              style={{
                accentColor: "var(--brand-primary)",
                cursor: "pointer",
              }}
            />
            <span>{t("circuit.pauseWhenHidden")}</span>
          </label>
        </div>
      </div>

      {/* Same-origin Iframe (fills the pane) */}
      <div style={{ flex: 1, inlineSize: "100%", position: "relative" }}>
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={tab.title}
          data-testid="circuit-iframe"
          onLoad={handleIframeLoad}
          style={{
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
