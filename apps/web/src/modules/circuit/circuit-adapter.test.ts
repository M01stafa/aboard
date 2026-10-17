import { describe, expect, it, vi } from "vitest";
import { CircuitAdapter } from "./circuit-adapter";
import type { CircuitJS1Api, CircuitWindow } from "./types";

function createMockCircuitApi(): CircuitJS1Api {
  let simRunning = true;
  let circuitText = "$ 1 0.000005 10 50 5 0.5";

  return {
    setSimRunning: vi.fn((run: boolean) => {
      simRunning = run;
    }),
    isRunning: vi.fn(() => simRunning),
    getTime: vi.fn(() => 0.012),
    getTimeStep: vi.fn(() => 5e-6),
    setTimeStep: vi.fn(),
    getMaxTimeStep: vi.fn(() => 1e-5),
    setMaxTimeStep: vi.fn(),
    getNodeVoltage: vi.fn((label: string) => (label === "out" ? 3.3 : 0)),
    setExtVoltage: vi.fn(),
    getElements: vi.fn(() => [{ type: "Resistor" }]),
    getCircuitAsSVG: vi.fn(function (this: CircuitJS1Api) {
      if (this.onsvgrendered) {
        this.onsvgrendered(this, "<svg>mock</svg>");
      }
    }),
    exportCircuit: vi.fn(() => circuitText),
    importCircuit: vi.fn((text: string) => {
      circuitText = text;
    }),
    runCommand: vi.fn(),
    getCircuitAsPNG: vi.fn(() => "data:image/png;base64,mockpng"),
    onupdate: null,
    ontimestep: null,
    onanalyze: null,
    onsvgrendered: null,
  };
}

describe("CircuitAdapter (Task 24 / CIRC-1, CIRC-4)", () => {
  it("attaches immediately when contentWindow.CircuitJS1 is already present", () => {
    const adapter = new CircuitAdapter();
    const mockApi = createMockCircuitApi();
    const mockWindow = {
      CircuitJS1: mockApi,
    } as unknown as CircuitWindow;

    expect(adapter.isAttached()).toBe(false);
    adapter.attach(mockWindow as unknown as Window);

    expect(adapter.isAttached()).toBe(true);
    expect(adapter.getApi()).toBe(mockApi);
    expect(typeof mockApi.onanalyze).toBe("function");
    expect(typeof mockApi.onupdate).toBe("function");
    expect(typeof mockApi.ontimestep).toBe("function");
    expect(typeof mockApi.onsvgrendered).toBe("function");
  });

  it("attaches via oncircuitjsloaded hook when CircuitJS1 loads asynchronously", () => {
    const adapter = new CircuitAdapter();
    const mockWindow = {} as CircuitWindow;

    adapter.attach(mockWindow as unknown as Window);
    expect(adapter.isAttached()).toBe(false);
    expect(typeof mockWindow.oncircuitjsloaded).toBe("function");

    // Simulator loads asynchronously
    const mockApi = createMockCircuitApi();
    mockWindow.CircuitJS1 = mockApi;
    mockWindow.oncircuitjsloaded!();

    expect(adapter.isAttached()).toBe(true);
    expect(adapter.getApi()).toBe(mockApi);
  });

  it("owns single callback slots and fans events out to multiple subscribers", () => {
    const adapter = new CircuitAdapter();
    const mockApi = createMockCircuitApi();
    adapter.attach({ CircuitJS1: mockApi } as unknown as Window);

    const analyze1 = vi.fn();
    const analyze2 = vi.fn();
    const unsubscribe1 = adapter.onAnalyze(analyze1);
    const unsubscribe2 = adapter.onAnalyze(analyze2);

    const update1 = vi.fn();
    const update2 = vi.fn();
    adapter.onUpdate(update1);
    adapter.onUpdate(update2);

    // Trigger simulator callbacks
    mockApi.onanalyze!(mockApi);
    expect(analyze1).toHaveBeenCalledTimes(1);
    expect(analyze1).toHaveBeenCalledWith(mockApi);
    expect(analyze2).toHaveBeenCalledTimes(1);
    expect(analyze2).toHaveBeenCalledWith(mockApi);

    mockApi.onupdate!(mockApi);
    expect(update1).toHaveBeenCalledTimes(1);
    expect(update2).toHaveBeenCalledTimes(1);

    // Unsubscribe works
    unsubscribe1();
    mockApi.onanalyze!(mockApi);
    expect(analyze1).toHaveBeenCalledTimes(1); // not called again
    expect(analyze2).toHaveBeenCalledTimes(2);

    unsubscribe2();
    mockApi.onanalyze!(mockApi);
    expect(analyze2).toHaveBeenCalledTimes(2);
  });

  it("handles requestSVG() promise wrapping getCircuitAsSVG and onsvgrendered", async () => {
    const adapter = new CircuitAdapter();
    const mockApi = createMockCircuitApi();
    adapter.attach({ CircuitJS1: mockApi } as unknown as Window);

    const svgPromise = adapter.requestSVG();
    const svgResult = await svgPromise;

    expect(mockApi.getCircuitAsSVG).toHaveBeenCalledTimes(1);
    expect(svgResult).toBe("<svg>mock</svg>");
  });

  it("is idempotent and handles React Strict Mode detach and re-attach cleanly", () => {
    const adapter = new CircuitAdapter();
    const mockApi = createMockCircuitApi();
    const mockWindow = { CircuitJS1: mockApi } as unknown as CircuitWindow;

    // First mount
    adapter.attach(mockWindow as unknown as Window);
    expect(adapter.isAttached()).toBe(true);
    expect(typeof mockApi.onanalyze).toBe("function");

    // Strict Mode unmount (detach)
    adapter.detach();
    expect(adapter.isAttached()).toBe(false);
    expect(mockApi.onanalyze).toBeNull();
    expect(mockApi.onupdate).toBeNull();
    expect(mockApi.onsvgrendered).toBeNull();

    // Strict Mode remount
    adapter.attach(mockWindow as unknown as Window);
    expect(adapter.isAttached()).toBe(true);
    expect(typeof mockApi.onanalyze).toBe("function");
  });

  it("forwards simulator controls, import, and export", () => {
    const adapter = new CircuitAdapter();
    const mockApi = createMockCircuitApi();
    adapter.attach({ CircuitJS1: mockApi } as unknown as Window);

    expect(adapter.isRunning()).toBe(true);
    adapter.setSimRunning(false);
    expect(mockApi.setSimRunning).toHaveBeenCalledWith(false);
    expect(adapter.isRunning()).toBe(false);

    expect(adapter.exportCircuit()).toBe("$ 1 0.000005 10 50 5 0.5");
    adapter.importCircuit("$ 2 0.000010 20 60 10 1.0");
    expect(mockApi.importCircuit).toHaveBeenCalledWith("$ 2 0.000010 20 60 10 1.0", false);
    expect(adapter.exportCircuit()).toBe("$ 2 0.000010 20 60 10 1.0");

    adapter.runCommand("main", "ResistorElm");
    expect(mockApi.runCommand).toHaveBeenCalledWith("main", "ResistorElm");

    expect(adapter.getCircuitAsPNG()).toBe("data:image/png;base64,mockpng");
  });
});
