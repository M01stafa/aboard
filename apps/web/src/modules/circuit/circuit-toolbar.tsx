"use client";

import React, { useState, useRef, useEffect } from "react";
import { useI18n } from "@/i18n/provider";
import type { I18nKey } from "@/i18n/types";
import type { CircuitAdapter } from "./circuit-adapter";

export type CircuitSpeed = "slow" | "normal" | "fast";

export interface ComponentItem {
  id: string;
  className: string;
  labelKey: I18nKey;
  category: "basic" | "sources" | "semiconductors" | "outputs";
  iconSvg: React.ReactNode;
}

export const CIRCUIT_COMPONENTS: readonly ComponentItem[] = [
  // Basic Components
  {
    id: "wire",
    className: "WireElm",
    labelKey: "circuit.compWire",
    category: "basic",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="3" y1="12" x2="21" y2="12" />
        <circle cx="3" cy="12" r="2" fill="currentColor" />
        <circle cx="21" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "resistor",
    className: "ResistorElm",
    labelKey: "circuit.compResistor",
    category: "basic",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h4l2.5-6 4 12 4-12 2.5 6h5" />
      </svg>
    ),
  },
  {
    id: "capacitor",
    className: "CapacitorElm",
    labelKey: "circuit.compCapacitor",
    category: "basic",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="2" y1="12" x2="9" y2="12" />
        <line x1="9" y1="5" x2="9" y2="19" />
        <line x1="15" y1="5" x2="15" y2="19" />
        <line x1="15" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: "inductor",
    className: "InductorElm",
    labelKey: "circuit.compInductor",
    category: "basic",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 14h2a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0h2" />
      </svg>
    ),
  },
  {
    id: "switch",
    className: "SwitchElm",
    labelKey: "circuit.compSwitch",
    category: "basic",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="5" cy="14" r="2" />
        <circle cx="19" cy="14" r="2" />
        <line x1="7" y1="13" x2="17" y2="7" />
        <line x1="2" y1="14" x2="3" y2="14" />
        <line x1="21" y1="14" x2="22" y2="14" />
      </svg>
    ),
  },
  {
    id: "ground",
    className: "GroundElm",
    labelKey: "circuit.compGround",
    category: "basic",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="3" x2="12" y2="13" />
        <line x1="5" y1="13" x2="19" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
        <line x1="10" y1="21" x2="14" y2="21" />
      </svg>
    ),
  },

  // Sources & Inputs
  {
    id: "dc-voltage",
    className: "DCVoltageElm",
    labelKey: "circuit.compDcVoltage",
    category: "sources",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="10" y1="9" x2="14" y2="9" />
        <line x1="12" y1="7" x2="12" y2="11" />
        <line x1="10" y1="15" x2="14" y2="15" />
      </svg>
    ),
  },
  {
    id: "ac-voltage",
    className: "ACVoltageElm",
    labelKey: "circuit.compAcVoltage",
    category: "sources",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <path d="M8 12c1.5-3 2.5-3 4 0s2.5 3 4 0" />
      </svg>
    ),
  },

  // Semiconductors
  {
    id: "diode",
    className: "DiodeElm",
    labelKey: "circuit.compDiode",
    category: "semiconductors",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="2" y1="12" x2="8" y2="12" />
        <polygon points="8 6, 8 18, 16 12" fill="currentColor" />
        <line x1="16" y1="6" x2="16" y2="18" />
        <line x1="16" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: "led",
    className: "LEDElm",
    labelKey: "circuit.compLed",
    category: "semiconductors",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="6 8, 6 16, 12 12" fill="currentColor" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="12" y1="12" x2="18" y2="12" />
        <line x1="14" y1="6" x2="17" y2="3" />
        <line x1="17" y1="8" x2="20" y2="5" />
      </svg>
    ),
  },
  {
    id: "transistor",
    className: "NTransistorElm",
    labelKey: "circuit.compNTransistor",
    category: "semiconductors",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="2" y1="12" x2="10" y2="12" />
        <line x1="10" y1="6" x2="10" y2="18" />
        <line x1="10" y1="9" x2="18" y2="4" />
        <line x1="10" y1="15" x2="18" y2="20" />
        <polyline points="15 19, 18 20, 18 17" fill="currentColor" />
      </svg>
    ),
  },

  // Outputs & Tools
  {
    id: "probe",
    className: "ProbeElm",
    labelKey: "circuit.compProbe",
    category: "outputs",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M9 10l3 6 3-6" />
      </svg>
    ),
  },
  {
    id: "select",
    className: "Select",
    labelKey: "circuit.compSelect",
    category: "outputs",
    iconSvg: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="5 3, 19 12, 12 14, 8 20" fill="currentColor" />
      </svg>
    ),
  },
] as const;

export interface CircuitToolbarProps {
  adapter: CircuitAdapter;
  isSimRunning: boolean;
  onToggleRun: () => void;
  onReset: () => void;
  onSelectComponent: (className: string, name: string) => void;
  selectedComponent: string | null;
  speed: CircuitSpeed;
  onChangeSpeed: (speed: CircuitSpeed) => void;
  onToggleAdvancedMenu: () => void;
}

export function CircuitToolbar({
  isSimRunning,
  onToggleRun,
  onReset,
  onSelectComponent,
  selectedComponent,
  speed,
  onChangeSpeed,
  onToggleAdvancedMenu,
}: CircuitToolbarProps) {
  const { t } = useI18n();

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSpeedOpen, setIsSpeedOpen] = useState(false);

  const paletteRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside or escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setIsPaletteOpen(false);
      }
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setIsSpeedOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsPaletteOpen(false);
        setIsSpeedOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const speedLabels: Record<CircuitSpeed, string> = {
    slow: t("circuit.speedSlow"),
    normal: t("circuit.speedNormal"),
    fast: t("circuit.speedFast"),
  };

  const selectedItem = CIRCUIT_COMPONENTS.find(
    (c) => c.className === selectedComponent
  );

  return (
    <div
      role="toolbar"
      aria-label="Circuit Simulator Toolbar"
      data-testid="circuit-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-8)",
        padding: "var(--space-8) var(--space-16)",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-card)",
        boxSizing: "border-box",
        minHeight: "var(--control-md)",
        position: "relative",
        zIndex: 20,
      }}
    >
      {/* Primary Actions Group: Run/Pause, Reset, Speed, Component Palette */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
          flexWrap: "wrap",
        }}
      >
        {/* Run / Pause Button */}
        <button
          type="button"
          data-testid="circuit-run-pause-btn"
          onClick={onToggleRun}
          aria-label={isSimRunning ? t("circuit.pauseSim") : t("circuit.runSim")}
          title={isSimRunning ? t("circuit.pauseSim") : t("circuit.runSim")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-8)",
            height: "var(--control-sm)",
            paddingInline: "var(--space-16)",
            borderRadius: "var(--radius-sm)",
            border: isSimRunning
              ? "1px solid var(--border-card)"
              : "1px solid var(--accent-primary, #3b82f6)",
            backgroundColor: isSimRunning ? "var(--bg-subtle)" : "var(--bg-surface)",
            color: isSimRunning ? "var(--text-main)" : "var(--accent-primary, #3b82f6)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
        >
          {isSimRunning ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3, 19 12, 5 21" />
            </svg>
          )}
          <span>{isSimRunning ? t("circuit.pauseSim") : t("circuit.runSim")}</span>
        </button>

        {/* Reset Button */}
        <button
          type="button"
          data-testid="circuit-reset-btn"
          onClick={onReset}
          aria-label={t("circuit.reset")}
          title={t("circuit.resetTooltip")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-8)",
            height: "var(--control-sm)",
            paddingInline: "var(--space-12)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background-color 150ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>{t("circuit.reset")}</span>
        </button>

        {/* Time Step / Speed Dropdown */}
        <div ref={speedRef} style={{ position: "relative" }}>
          <button
            type="button"
            data-testid="circuit-speed-dropdown-btn"
            onClick={() => {
              setIsSpeedOpen((prev) => !prev);
              setIsPaletteOpen(false);
            }}
            aria-haspopup="true"
            aria-expanded={isSpeedOpen}
            aria-label={t("circuit.speed")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-8)",
              height: "var(--control-sm)",
              paddingInline: "var(--space-12)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: isSpeedOpen ? "var(--bg-subtle)" : "var(--bg-surface)",
              color: "var(--text-main)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{speedLabels[speed]}</span>
            <span style={{ fontSize: "10px", opacity: 0.7 }}>▾</span>
          </button>

          {isSpeedOpen && (
            <div
              role="menu"
              data-testid="circuit-speed-menu"
              style={{
                position: "absolute",
                top: "calc(100% + var(--space-8))",
                insetInlineStart: 0,
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
                padding: "var(--space-8)",
                minWidth: "calc(var(--space-32) * 4)",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
              }}
            >
              {(["slow", "normal", "fast"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`circuit-speed-${s}-btn`}
                  onClick={() => {
                    onChangeSpeed(s);
                    setIsSpeedOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-8) var(--space-12)",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    backgroundColor: speed === s ? "var(--bg-subtle)" : "transparent",
                    color: speed === s ? "var(--accent-primary, #3b82f6)" : "var(--text-main)",
                    fontWeight: speed === s ? 600 : 400,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "start",
                  }}
                >
                  <span>{speedLabels[s]}</span>
                  {speed === s && <span style={{ fontSize: "12px" }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Component Palette Mega-Menu */}
        <div ref={paletteRef} style={{ position: "relative" }}>
          <button
            type="button"
            data-testid="circuit-palette-btn"
            onClick={() => {
              setIsPaletteOpen((prev) => !prev);
              setIsSpeedOpen(false);
            }}
            aria-haspopup="true"
            aria-expanded={isPaletteOpen}
            aria-label={t("circuit.components")}
            title={t("circuit.paletteTooltip")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-8)",
              height: "var(--control-sm)",
              paddingInline: "var(--space-12)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: isPaletteOpen ? "var(--bg-subtle)" : "var(--bg-surface)",
              color: "var(--text-main)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="1" x2="9" y2="4" />
              <line x1="15" y1="1" x2="15" y2="4" />
              <line x1="9" y1="20" x2="9" y2="23" />
              <line x1="15" y1="20" x2="15" y2="23" />
              <line x1="20" y1="9" x2="23" y2="9" />
              <line x1="20" y1="14" x2="23" y2="14" />
              <line x1="1" y1="9" x2="4" y2="9" />
              <line x1="1" y1="14" x2="4" y2="14" />
            </svg>
            <span>{t("circuit.components")}</span>
            <span style={{ fontSize: "10px", opacity: 0.7 }}>▾</span>
          </button>

          {isPaletteOpen && (
            <div
              role="menu"
              data-testid="circuit-palette-dropdown"
              style={{
                position: "absolute",
                top: "calc(100% + var(--space-8))",
                insetInlineStart: 0,
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.25)",
                padding: "var(--space-16)",
                width: "calc(var(--space-32) * 11)",
                zIndex: 100,
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-16)",
                boxSizing: "border-box",
              }}
            >
              {/* Category: Basic Components */}
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-8)",
                  }}
                >
                  {t("circuit.catBasic")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "var(--space-8)",
                  }}
                >
                  {CIRCUIT_COMPONENTS.filter((c) => c.category === "basic").map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`circuit-comp-${item.id}-btn`}
                      onClick={() => {
                        onSelectComponent(item.className, t(item.labelKey));
                        setIsPaletteOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-8)",
                        padding: "var(--space-8) var(--space-12)",
                        borderRadius: "var(--radius-sm)",
                        border: selectedComponent === item.className
                          ? "1px solid var(--accent-primary, #3b82f6)"
                          : "1px solid var(--border-card)",
                        backgroundColor: selectedComponent === item.className
                          ? "var(--bg-subtle)"
                          : "var(--bg-surface)",
                        color: "var(--text-main)",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "start",
                      }}
                    >
                      <span style={{ color: "var(--accent-primary, #3b82f6)", display: "flex" }}>
                        {item.iconSvg}
                      </span>
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category: Sources & Inputs */}
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-8)",
                  }}
                >
                  {t("circuit.catSources")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "var(--space-8)",
                  }}
                >
                  {CIRCUIT_COMPONENTS.filter((c) => c.category === "sources").map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`circuit-comp-${item.id}-btn`}
                      onClick={() => {
                        onSelectComponent(item.className, t(item.labelKey));
                        setIsPaletteOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-8)",
                        padding: "var(--space-8) var(--space-12)",
                        borderRadius: "var(--radius-sm)",
                        border: selectedComponent === item.className
                          ? "1px solid var(--accent-primary, #3b82f6)"
                          : "1px solid var(--border-card)",
                        backgroundColor: selectedComponent === item.className
                          ? "var(--bg-subtle)"
                          : "var(--bg-surface)",
                        color: "var(--text-main)",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "start",
                      }}
                    >
                      <span style={{ color: "var(--accent-primary, #3b82f6)", display: "flex" }}>
                        {item.iconSvg}
                      </span>
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category: Semiconductors */}
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-8)",
                  }}
                >
                  {t("circuit.catSemiconductors")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "var(--space-8)",
                  }}
                >
                  {CIRCUIT_COMPONENTS.filter((c) => c.category === "semiconductors").map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`circuit-comp-${item.id}-btn`}
                      onClick={() => {
                        onSelectComponent(item.className, t(item.labelKey));
                        setIsPaletteOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-8)",
                        padding: "var(--space-8) var(--space-12)",
                        borderRadius: "var(--radius-sm)",
                        border: selectedComponent === item.className
                          ? "1px solid var(--accent-primary, #3b82f6)"
                          : "1px solid var(--border-card)",
                        backgroundColor: selectedComponent === item.className
                          ? "var(--bg-subtle)"
                          : "var(--bg-surface)",
                        color: "var(--text-main)",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "start",
                      }}
                    >
                      <span style={{ color: "var(--accent-primary, #3b82f6)", display: "flex" }}>
                        {item.iconSvg}
                      </span>
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category: Outputs & Tools */}
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: "var(--space-8)",
                  }}
                >
                  {t("circuit.catOutputs")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "var(--space-8)",
                  }}
                >
                  {CIRCUIT_COMPONENTS.filter((c) => c.category === "outputs").map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`circuit-comp-${item.id}-btn`}
                      onClick={() => {
                        onSelectComponent(item.className, t(item.labelKey));
                        setIsPaletteOpen(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-8)",
                        padding: "var(--space-8) var(--space-12)",
                        borderRadius: "var(--radius-sm)",
                        border: selectedComponent === item.className
                          ? "1px solid var(--accent-primary, #3b82f6)"
                          : "1px solid var(--border-card)",
                        backgroundColor: selectedComponent === item.className
                          ? "var(--bg-subtle)"
                          : "var(--bg-surface)",
                        color: "var(--text-main)",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "start",
                      }}
                    >
                      <span style={{ color: "var(--accent-primary, #3b82f6)", display: "flex" }}>
                        {item.iconSvg}
                      </span>
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Tool Badge */}
        {selectedItem && (
          <div
            data-testid="circuit-active-tool-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-8)",
              padding: "0 var(--space-8)",
              height: "var(--control-sm)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-card)",
              fontSize: "12px",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
              {t("circuit.activeTool")}: {t(selectedItem.labelKey)}
            </span>
            <span style={{ opacity: 0.8 }}>({t("circuit.activeToolHint")})</span>
          </div>
        )}
      </div>

      {/* Secondary / Advanced Toggle Group */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
        <button
          type="button"
          data-testid="circuit-advanced-toggle-btn"
          onClick={onToggleAdvancedMenu}
          aria-label={t("circuit.advancedMenu")}
          title={t("circuit.advancedMenuTooltip")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-8)",
            height: "var(--control-sm)",
            paddingInline: "var(--space-12)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background-color 150ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{t("circuit.advancedMenu")}</span>
        </button>
      </div>
    </div>
  );
}
