"use client";

import React, { useCallback, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useI18n } from "@/i18n/provider";
import { STUDY_TEMPLATES, type TemplateDefinition } from "./templates";

interface TemplatesPanelProps {
  getApi: () => ExcalidrawImperativeAPI | null;
}

export function TemplatesPanel({ getApi }: TemplatesPanelProps) {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [justInsertedId, setJustInsertedId] = useState<string | null>(null);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleInsert = useCallback(
    async (template: TemplateDefinition) => {
      const api = getApi();
      if (!api) return;

      try {
        const appState = api.getAppState();
        const zoom =
          typeof appState.zoom === "object"
            ? appState.zoom.value
            : (appState.zoom as unknown as number) || 1;
        const viewportWidth =
          typeof appState.width === "number" && appState.width > 0
            ? appState.width
            : typeof window !== "undefined"
            ? window.innerWidth
            : 800;
        const viewportHeight =
          typeof appState.height === "number" && appState.height > 0
            ? appState.height
            : typeof window !== "undefined"
            ? window.innerHeight
            : 600;

        const scrollX = typeof appState.scrollX === "number" ? appState.scrollX : 0;
        const scrollY = typeof appState.scrollY === "number" ? appState.scrollY : 0;

        // Viewport center in scene coordinates
        const sceneCenterX = -scrollX + viewportWidth / (2 * zoom);
        const sceneCenterY = -scrollY + viewportHeight / (2 * zoom);

        const originX = Math.round(sceneCenterX - template.width / 2);
        const originY = Math.round(sceneCenterY - template.height / 2);

        const skeletons = template.generate({
          lang: language === "ar" ? "ar" : "en",
          originX,
          originY,
        });

        // Dynamic import to maintain ssr: false safety
        const { convertToExcalidrawElements } = await import(
          "@excalidraw/excalidraw"
        );

        const newElements = convertToExcalidrawElements(skeletons, {
          regenerateIds: true,
        });

        const currentElements = api.getSceneElements?.() || [];
        const selectedElementIds: Record<string, true> = {};
        for (const el of newElements) {
          selectedElementIds[el.id] = true;
        }

        api.updateScene({
          elements: [...currentElements, ...newElements],
          appState: {
            selectedElementIds,
          },
        });

        setJustInsertedId(template.id);
        setTimeout(() => {
          setJustInsertedId((cur) => (cur === template.id ? null : cur));
        }, 2000);
      } catch (err) {
        console.error("Failed to insert template into whiteboard:", err);
      }
    },
    [getApi, language]
  );

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        type="button"
        data-testid="templates-panel-toggle"
        aria-expanded={isOpen}
        aria-controls="aboard-templates-drawer"
        onClick={handleToggle}
        style={{
          position: "absolute",
          insetBlockStart: "var(--space-2)",
          insetInlineEnd: "var(--space-2)",
          zIndex: 10,
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-1)",
          paddingBlock: "var(--space-1)",
          paddingInline: "var(--space-2)",
          backgroundColor: isOpen ? "var(--btn-primary-bg)" : "var(--bg-surface)",
          color: isOpen ? "var(--btn-primary-text)" : "var(--text-main)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-1)",
          fontSize: "0.875rem",
          fontWeight: "var(--weight-medium)",
          cursor: "pointer",
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
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span>{t("templates.toggleButton")}</span>
      </button>

      {/* Slide-in Unobtrusive Drawer */}
      {isOpen && (
        <aside
          id="aboard-templates-drawer"
          data-testid="aboard-templates-drawer"
          role="region"
          aria-label={t("templates.panelTitle")}
          style={{
            position: "absolute",
            insetBlockStart: 0,
            insetBlockEnd: 0,
            insetInlineEnd: 0,
            inlineSize: "320px",
            zIndex: 20,
            backgroundColor: "var(--bg-surface)",
            borderInlineStart: "1px solid var(--border-card)",
            boxShadow: "var(--shadow-3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "transform var(--motion-base) var(--ease-standard)",
          }}
        >
          {/* Drawer Header */}
          <header
            style={{
              paddingBlock: "var(--space-2)",
              paddingInline: "var(--space-3)",
              borderBlockEnd: "1px solid var(--border-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-2)",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  fontWeight: "var(--weight-semibold)",
                  color: "var(--text-main)",
                }}
              >
                {t("templates.panelTitle")}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                {t("templates.panelDescription")}
              </p>
            </div>
            <button
              type="button"
              data-testid="templates-panel-close"
              aria-label={t("templates.close")}
              onClick={handleToggle}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "var(--space-1)",
                borderRadius: "var(--radius-sm)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          {/* Templates Scroll Area */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingBlock: "var(--space-2)",
              paddingInline: "var(--space-2)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {STUDY_TEMPLATES.map((tpl) => {
              const isInserted = justInsertedId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  data-testid={`template-card-${tpl.id}`}
                  style={{
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-card)",
                    borderRadius: "var(--radius-md)",
                    paddingBlock: "var(--space-2)",
                    paddingInline: "var(--space-2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-1)",
                    transition:
                      "background-color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "var(--space-1)",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "var(--weight-semibold)",
                        fontSize: "0.875rem",
                        color: "var(--text-main)",
                      }}
                    >
                      {t(tpl.titleKey)}
                    </span>
                    {isInserted && (
                      <span
                        data-testid="template-inserted-badge"
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: "var(--weight-semibold)",
                          paddingBlock: "var(--space-1)",
                          paddingInline: "var(--space-1)",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--success-bg)",
                          color: "var(--success-text)",
                        }}
                      >
                        ✓ {t("templates.insertedNotice")}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      lineHeight: "1.25rem",
                    }}
                  >
                    {t(tpl.descKey)}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBlockStart: "var(--space-1)",
                    }}
                  >
                    <button
                      type="button"
                      data-testid={`template-insert-${tpl.id}`}
                      onClick={() => handleInsert(tpl)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        paddingBlock: "var(--space-1)",
                        paddingInline: "var(--space-2)",
                        backgroundColor: "var(--btn-primary-bg)",
                        color: "var(--btn-primary-text)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.75rem",
                        fontWeight: "var(--weight-medium)",
                        cursor: "pointer",
                        transition:
                          "background-color var(--motion-fast) var(--ease-standard)",
                      }}
                    >
                      <span>{t("templates.insert")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </>
  );
}
