// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CircuitToolbar, type CircuitToolbarProps } from "./circuit-toolbar";
import { CircuitAdapter } from "./circuit-adapter";
import { I18nProvider } from "@/i18n/provider";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("CircuitToolbar (Task 42 / CIRC-5)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let adapter: CircuitAdapter;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    adapter = new CircuitAdapter();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const createDefaultProps = (overrides: Partial<CircuitToolbarProps> = {}): CircuitToolbarProps => ({
    adapter,
    isSimRunning: true,
    onToggleRun: vi.fn(),
    onReset: vi.fn(),
    onSelectComponent: vi.fn(),
    selectedComponent: null,
    speed: "normal",
    onChangeSpeed: vi.fn(),
    onToggleAdvancedMenu: vi.fn(),
    ...overrides,
  });

  it("renders all toolbar controls", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps()} />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="circuit-toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="circuit-run-pause-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="circuit-reset-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="circuit-speed-dropdown-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="circuit-palette-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="circuit-advanced-toggle-btn"]')).not.toBeNull();
  });

  it("toggles simulation running state on run/pause button click", () => {
    const onToggleRun = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ isSimRunning: true, onToggleRun })} />
        </I18nProvider>
      );
    });

    const runPauseBtn = container.querySelector('[data-testid="circuit-run-pause-btn"]') as HTMLButtonElement;
    expect(runPauseBtn.textContent).toContain("Pause");

    act(() => {
      runPauseBtn.click();
    });
    expect(onToggleRun).toHaveBeenCalledTimes(1);

    // When paused
    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ isSimRunning: false, onToggleRun })} />
        </I18nProvider>
      );
    });
    expect(runPauseBtn.textContent).toContain("Run");
  });

  it("triggers onReset when clicking reset button", () => {
    const onReset = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ onReset })} />
        </I18nProvider>
      );
    });

    const resetBtn = container.querySelector('[data-testid="circuit-reset-btn"]') as HTMLButtonElement;
    act(() => {
      resetBtn.click();
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("opens speed dropdown and changes simulation speed", () => {
    const onChangeSpeed = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ onChangeSpeed, speed: "normal" })} />
        </I18nProvider>
      );
    });

    const speedBtn = container.querySelector('[data-testid="circuit-speed-dropdown-btn"]') as HTMLButtonElement;
    expect(container.querySelector('[data-testid="circuit-speed-menu"]')).toBeNull();

    // Open speed menu
    act(() => {
      speedBtn.click();
    });
    expect(container.querySelector('[data-testid="circuit-speed-menu"]')).not.toBeNull();

    // Select slow
    const slowBtn = container.querySelector('[data-testid="circuit-speed-slow-btn"]') as HTMLButtonElement;
    act(() => {
      slowBtn.click();
    });
    expect(onChangeSpeed).toHaveBeenCalledWith("slow");
    expect(container.querySelector('[data-testid="circuit-speed-menu"]')).toBeNull();
  });

  it("opens component palette and selects a component tool", () => {
    const onSelectComponent = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ onSelectComponent })} />
        </I18nProvider>
      );
    });

    const paletteBtn = container.querySelector('[data-testid="circuit-palette-btn"]') as HTMLButtonElement;
    expect(container.querySelector('[data-testid="circuit-palette-dropdown"]')).toBeNull();

    // Open palette
    act(() => {
      paletteBtn.click();
    });
    expect(container.querySelector('[data-testid="circuit-palette-dropdown"]')).not.toBeNull();

    // Click Resistor
    const resistorBtn = container.querySelector('[data-testid="circuit-comp-resistor-btn"]') as HTMLButtonElement;
    expect(resistorBtn).not.toBeNull();
    act(() => {
      resistorBtn.click();
    });
    expect(onSelectComponent).toHaveBeenCalledWith("ResistorElm", "Resistor");
    expect(container.querySelector('[data-testid="circuit-palette-dropdown"]')).toBeNull();

    // Reopen and select Ground
    act(() => {
      paletteBtn.click();
    });
    const groundBtn = container.querySelector('[data-testid="circuit-comp-ground-btn"]') as HTMLButtonElement;
    expect(groundBtn).not.toBeNull();
    act(() => {
      groundBtn.click();
    });
    expect(onSelectComponent).toHaveBeenCalledWith("GroundElm", "Ground");
  });

  it("displays active tool badge when a component is selected", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ selectedComponent: "CapacitorElm" })} />
        </I18nProvider>
      );
    });

    const badge = container.querySelector('[data-testid="circuit-active-tool-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("Capacitor");
  });

  it("triggers onToggleAdvancedMenu when clicking advanced button", () => {
    const onToggleAdvancedMenu = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <CircuitToolbar {...createDefaultProps({ onToggleAdvancedMenu })} />
        </I18nProvider>
      );
    });

    const advancedBtn = container.querySelector('[data-testid="circuit-advanced-toggle-btn"]') as HTMLButtonElement;
    expect(advancedBtn).not.toBeNull();

    act(() => {
      advancedBtn.click();
    });
    expect(onToggleAdvancedMenu).toHaveBeenCalledTimes(1);
  });
});
