"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { useI18n } from "@/i18n/provider";
import type { BoardPaneProps } from "./types";
import { useBoardPersistence } from "./use-board-persistence";

/**
 * Excalidraw loaded on client only via next/dynamic with ssr: false,
 * exactly as proven in Spike S1 and docs/specs/modules.md §7.1.
 */
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  { ssr: false }
);

/**
 * UIOptions hiding Excalidraw's own load and save-to-disk actions,
 * since file management and persistence are handled by Aboard.
 */
const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
  },
};

export function BoardPane({
  projectId,
  tab,
  visible,
  onMount,
  onApiReady,
}: BoardPaneProps) {
  const { resolvedTheme: i18nTheme, language } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const visibleRef = useRef(visible);

  // Persistent identity token for mount-tracking & Strict Mode safety
  const [identityToken] = useState(() => {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `pane-${tab.id}-board`;
  });

  // Inform workspace host of mount exactly once per tab lifetime (WS-1)
  useEffect(() => {
    onMount?.(tab.id, identityToken);
  }, [tab.id, identityToken, onMount]);

  // Track DOM data-theme attribute in addition to i18n context
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

  const activeTheme: "light" | "dark" =
    domTheme === "dark" || i18nTheme === "dark" ? "dark" : "light";
  const langCode = language === "ar" ? "ar-SA" : "en";

  // Persistence hook: loads initialData once from ProjectService and debounces saves
  const { initialData, isLoaded, saveBoard } = useBoardPersistence({
    projectId,
    itemId: tab.itemId,
    title: tab.title,
  });

  // Keep visibleRef in sync
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // 1. Call api.refresh() whenever the pane becomes visible (tab switch per §6.2)
  useEffect(() => {
    if (visible && excalidrawApiRef.current) {
      try {
        excalidrawApiRef.current.refresh();
      } catch (err) {
        console.error("Failed to refresh Excalidraw on visibility change:", err);
      }
    }
  }, [visible]);

  // 2. Attach ResizeObserver to container and call refresh() on resize (split view drag per §6.2)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    let rafId: number | null = null;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && visibleRef.current && excalidrawApiRef.current) {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }
          rafId = requestAnimationFrame(() => {
            try {
              excalidrawApiRef.current?.refresh();
            } catch (err) {
              console.error("Failed to refresh Excalidraw on resize:", err);
            }
          });
        }
      }
    });

    observer.observe(container);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, []);

  // Excalidraw API attachment
  const handleApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      excalidrawApiRef.current = api;
      onApiReady?.(api);

      // Expose API for E2E testing
      if (typeof window !== "undefined") {
        const win = window as unknown as {
          __aboard_boardApi?: Record<string, ExcalidrawImperativeAPI>;
        };
        win.__aboard_boardApi = win.__aboard_boardApi || {};
        win.__aboard_boardApi[tab.id] = api;
      }
    },
    [tab.id, onApiReady]
  );

  // Black-box persistence: push changes to saveBoard without triggering React re-renders
  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown) => {
      saveBoard(elements, appState as Record<string, unknown>);
    },
    [saveBoard]
  );

  return (
    <div
      ref={containerRef}
      className="aboard-board-pane"
      data-testid={`pane-board-${tab.id}`}
      data-pane-id={tab.id}
      data-identity-token={identityToken}
      style={
        {
          inlineSize: "100%",
          blockSize: "100%",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "var(--bg-surface)",
          // Scoped brand accent variables per docs/specs/architecture.md §15 and Spike S1 (V03)
          "--color-primary": "var(--btn-primary-bg)",
          "--color-primary-hover": "var(--btn-primary-hover)",
          "--color-brand-hover": "var(--accent-text)",
          "--color-selection": "var(--accent-text)",
          "--focus-highlight-color": "var(--focus-ring)",
        } as React.CSSProperties
      }
    >
      {isLoaded && (
        <Excalidraw
          excalidrawAPI={handleApi as unknown as (api: unknown) => void}
          initialData={initialData as ExcalidrawInitialDataState | undefined}
          onChange={handleChange as unknown as (elements: unknown, appState: unknown) => void}
          theme={activeTheme}
          langCode={langCode}
          UIOptions={UI_OPTIONS}
        />
      )}
    </div>
  );
}
