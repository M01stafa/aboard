"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useI18n } from "@/i18n/provider";
import type { BoardPaneProps } from "./types";
import { useBoardPersistence } from "./use-board-persistence";
import { TemplatesPanel } from "./templates-panel";
import { boardRegistry } from "./board-registry";
import { bus } from "@/core/bus";
import { appendBoardToPdf } from "@/integration/board-to-pdf";

/**
 * Excalidraw loaded on client only via next/dynamic with ssr: false,
 * using sanitized ExcalidrawBoard wrapper that strips external links and branding.
 */
const ExcalidrawBoard = dynamic(
  () => import("./excalidraw-board").then((m) => m.ExcalidrawBoard),
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

// Ensure pica's canvas fingerprinting probe succeeds in privacy-enhanced browsers (Brave, etc.)
if (typeof window !== "undefined" && typeof CanvasRenderingContext2D !== "undefined") {
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    ...rest: unknown[]
  ) {
    const res = origGetImageData.call(this, sx, sy, sw, sh, ...(rest as []));
    if (this.canvas && this.canvas.width === 2 && this.canvas.height === 1 && sw === 2 && sh === 1) {
      if (res && res.data && res.data.length === 8) {
        if (
          Math.abs(res.data[0] - 12) <= 10 &&
          Math.abs(res.data[1] - 23) <= 10 &&
          Math.abs(res.data[2] - 34) <= 10
        ) {
          res.data[0] = 12;
          res.data[1] = 23;
          res.data[2] = 34;
          res.data[3] = 255;
          res.data[4] = 45;
          res.data[5] = 56;
          res.data[6] = 67;
          res.data[7] = 255;
        }
      }
    }
    return res;
  };
}

export function BoardPane({
  projectId,
  tab,
  visible,
  onMount,
  onApiReady,
}: BoardPaneProps) {
  const { t, resolvedTheme: i18nTheme, language } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const getApi = useCallback(() => excalidrawApiRef.current, []);
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

  // Clean up boardRegistry on tab unmount
  useEffect(() => {
    return () => {
      boardRegistry.unregister(tab.id);
    };
  }, [tab.id]);

  // Suppress harmless upstream Excalidraw dev-mode warnings during undo/redo or point edits
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      if (
        msg.includes("Linear element is not normalized") ||
        msg.includes("fingerprinting protection") ||
        msg.includes("Cannot update a component (`PanelComponent`)") ||
        msg.includes("Cannot update a component (`") ||
        msg.includes("Can't call setState on a component that is not yet mounted")
      ) {
        return;
      }
      originalConsoleError.apply(console, args);
    };
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

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
  const { initialData, isLoaded, saveBoard, loadedFiles } = useBoardPersistence({
    projectId,
    itemId: tab.itemId,
    title: tab.title,
  });

  // Keep visibleRef in sync
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // Dropdown menu state for Send to PDF options
  const [isPdfMenuOpen, setIsPdfMenuOpen] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  // Close PDF menu on outside click or Escape key
  useEffect(() => {
    if (!isPdfMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target as Node)) {
        setIsPdfMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPdfMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPdfMenuOpen]);

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
      boardRegistry.register(tab.id, api);
      onApiReady?.(api);

      // Inject restored files into Excalidraw API on attach
      if (
        loadedFiles &&
        Object.keys(loadedFiles).length > 0 &&
        typeof api.addFiles === "function"
      ) {
        try {
          api.addFiles(Object.values(loadedFiles) as unknown as BinaryFileData[]);
        } catch (err) {
          console.error("Failed to inject files into Excalidraw on API attach:", err);
        }
      }

      // Expose API for E2E testing
      if (typeof window !== "undefined") {
        const win = window as unknown as {
          __aboard_boardApi?: Record<string, ExcalidrawImperativeAPI>;
        };
        win.__aboard_boardApi = win.__aboard_boardApi || {};
        win.__aboard_boardApi[tab.id] = api;
      }
    },
    [tab.id, onApiReady, loadedFiles]
  );

  // Re-inject files if they finish loading after API has attached
  useEffect(() => {
    if (
      excalidrawApiRef.current &&
      loadedFiles &&
      Object.keys(loadedFiles).length > 0 &&
      typeof excalidrawApiRef.current.addFiles === "function"
    ) {
      try {
        excalidrawApiRef.current.addFiles(
          Object.values(loadedFiles) as unknown as BinaryFileData[]
        );
      } catch (err) {
        console.error("Failed to inject files into Excalidraw on file load:", err);
      }
    }
  }, [loadedFiles]);

  const [isSendingToPdf, setIsSendingToPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Intercept anchor clicks on alpha:// URLs inside board pane (INT-4 / INT-3)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest?.("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && href.startsWith("alpha://")) {
        e.preventDefault();
        e.stopPropagation();
        bus.emit("navigate:alpha", { url: href });
      }
    };

    container.addEventListener("click", handleAnchorClick, true);
    return () => {
      container.removeEventListener("click", handleAnchorClick, true);
    };
  }, []);

  const handleSendToPdf = useCallback(
    async (mode: "append" | "overlay" = "append") => {
      setIsPdfMenuOpen(false);
      const api = excalidrawApiRef.current;
      if (!api) return;

      const elements = api.getSceneElements?.() || [];
      const nonDeleted = elements.filter((el) => !el.isDeleted);
      if (nonDeleted.length === 0) {
        showToast(t("board.emptyBoard"));
        return;
      }

      setIsSendingToPdf(true);
      try {
        const appState = api.getAppState?.() || {};
        const files = api.getFiles?.() || null;
        const { exportToBlob } = await import("@excalidraw/excalidraw");

        // Export using high-quality clean background configuration
        const imageBlob = await exportToBlob({
          elements: nonDeleted,
          appState: {
            ...appState,
            exportWithDarkMode: false,
            exportBackground: true,
          },
          files,
          mimeType: "image/png",
          exportPadding: 10,
        });

        bus.emit("board:to-pdf", {
          boardItemId: tab.itemId,
          image: imageBlob,
          mode,
          sourceTabId: tab.id,
        });

        showToast(
          mode === "overlay"
            ? t("board.overlaidOnPdfSuccess")
            : t("board.sentToPdfSuccess")
        );
      } catch (err) {
        console.error("[BoardPane] Failed to send board to PDF:", err);
        showToast(t("board.sendToPdfError"));
      } finally {
        setIsSendingToPdf(false);
      }
    },
    [tab.itemId, tab.id, showToast, t]
  );

  // Black-box persistence: push changes to saveBoard without triggering React re-renders
  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files?: unknown) => {
      saveBoard(
        elements,
        appState as Record<string, unknown>,
        files as Record<string, unknown> | undefined
      );
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
        <>
          <style>{`
            .aboard-board-pane .HelpDialog__header { display: none !important; }
            .aboard-board-pane .help-icon { display: none !important; }
            .aboard-board-pane .ExcalidrawLogo { display: none !important; }
            .aboard-board-pane [data-testid="help-menu-item"] { display: none !important; }
            .send-to-pdf-item:hover {
              background-color: var(--bg-subtle) !important;
            }
            .send-to-pdf-item:focus-visible {
              outline: 2px solid var(--accent-text) !important;
              outline-offset: -2px !important;
            }
          `}</style>
          <ExcalidrawBoard
            excalidrawAPI={handleApi as unknown as (api: unknown) => void}
            initialData={initialData as ExcalidrawInitialDataState | undefined}
            onChange={
              handleChange as unknown as (
                elements: unknown,
                appState: unknown,
                files: unknown
              ) => void
            }
            onLinkOpen={(element: { link?: string | null }, event: CustomEvent) => {
              if (element.link?.startsWith("alpha://")) {
                event.preventDefault?.();
                bus.emit("navigate:alpha", { url: element.link });
              }
            }}
            theme={activeTheme}
            langCode={langCode}
            UIOptions={UI_OPTIONS}
          />
          <div
            ref={pdfMenuRef}
            style={{
              position: "absolute",
              insetBlockStart: "var(--space-2)",
              insetInlineEnd: "calc(var(--space-2) + var(--space-16))",
              zIndex: 10,
            }}
          >
            <button
              type="button"
              data-testid="board-send-to-pdf-btn"
              onClick={() => setIsPdfMenuOpen((prev) => !prev)}
              disabled={isSendingToPdf}
              aria-haspopup="menu"
              aria-expanded={isPdfMenuOpen}
              title={t("board.sendToPdf")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                paddingBlock: "var(--space-1)",
                paddingInline: "var(--space-2)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-main)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-1)",
                fontSize: "0.875rem",
                fontWeight: "var(--weight-medium)",
                cursor: isSendingToPdf ? "wait" : "pointer",
                transition:
                  "background-color var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard)",
              }}
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>
                {isSendingToPdf ? t("board.sendingToPdf") : t("board.sendToPdf")}
              </span>
              <span style={{ fontSize: "0.75rem", marginInlineStart: "var(--space-1)" }}>▾</span>
            </button>

            {isPdfMenuOpen && (
              <div
                role="menu"
                data-testid="send-to-pdf-menu"
                style={{
                  position: "absolute",
                  insetBlockStart: "calc(100% + var(--space-1))",
                  insetInlineEnd: 0,
                  minWidth: "calc(var(--space-16) * 3)",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-card)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-2)",
                  paddingBlock: "var(--space-1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  zIndex: 20,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="send-to-pdf-append"
                  className="send-to-pdf-item"
                  onClick={() => handleSendToPdf("append")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    width: "100%",
                    paddingBlock: "var(--space-1)",
                    paddingInline: "var(--space-2)",
                    backgroundColor: "transparent",
                    color: "var(--text-main)",
                    border: "none",
                    textAlign: "start",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <span>📄</span>
                  <span>{t("board.sendAsNewPage")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="send-to-pdf-overlay"
                  className="send-to-pdf-item"
                  onClick={() => handleSendToPdf("overlay")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
                    width: "100%",
                    paddingBlock: "var(--space-1)",
                    paddingInline: "var(--space-2)",
                    backgroundColor: "transparent",
                    color: "var(--text-main)",
                    border: "none",
                    textAlign: "start",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <span>🖼</span>
                  <span>{t("board.overlayOnCurrentPage")}</span>
                </button>
              </div>
            )}
          </div>
          <TemplatesPanel getApi={getApi} />
          {toastMessage && (
            <div
              role="status"
              aria-live="polite"
              data-testid="board-toast-notice"
              style={{
                position: "absolute",
                insetBlockEnd: "var(--space-4)",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "var(--slate-900)",
                color: "#ffffff",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-md)",
                paddingBlock: "var(--space-1)",
                paddingInline: "var(--space-3)",
                boxShadow: "var(--shadow-2)",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                fontSize: "0.875rem",
                fontWeight: "var(--weight-medium)",
              }}
            >
              <span>{toastMessage}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
