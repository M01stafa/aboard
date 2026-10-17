import type {
  CircuitEventListener,
  CircuitEventName,
  CircuitJS1Api,
  CircuitSvgListener,
  CircuitWindow,
} from "./types";

interface PendingSvgRequest {
  resolve: (svg: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * CircuitAdapter: framework-agnostic bridge between Aboard and the CircuitJS1 simulator.
 * Implements docs/specs/modules.md §7.2, §8 and ADR-4.
 *
 * Key guarantees:
 * 1. Dual attachment: attaches immediately if contentWindow.CircuitJS1 is present,
 *    or sets contentWindow.oncircuitjsloaded to catch asynchronous GWT initialization.
 * 2. Callback ownership: owns each single callback slot on the simulator and fans events out
 *    to any number of subscribers.
 * 3. Strict Mode resilience: attaches and detaches cleanly across React Strict Mode's double-mount
 *    without leaking listeners or leaving dangling callbacks.
 */
export class CircuitAdapter {
  private targetWindow: CircuitWindow | null = null;
  private api: CircuitJS1Api | null = null;
  private attached = false;

  // Subscriber sets for simulator callbacks
  private updateSubscribers = new Set<CircuitEventListener>();
  private timestepSubscribers = new Set<CircuitEventListener>();
  private analyzeSubscribers = new Set<CircuitEventListener>();
  private svgSubscribers = new Set<CircuitSvgListener>();
  private readySubscribers = new Set<(api: CircuitJS1Api) => void>();

  // Queue of pending requestSVG promises
  private pendingSvgRequests: PendingSvgRequest[] = [];

  /**
   * Attaches the adapter to an iframe's window object.
   * If already attached, cleanly detaches first.
   */
  attach(targetWindow: Window): void {
    const win = targetWindow as CircuitWindow;
    if (this.targetWindow === win && this.attached && this.api && win.CircuitJS1 === this.api) {
      return;
    }

    // Detach from previous window if any
    this.detach();

    this.targetWindow = win;

    // Immediate check
    if (win.CircuitJS1) {
      this.bindApi(win.CircuitJS1);
    } else {
      // Delayed hook check
      win.oncircuitjsloaded = () => {
        if (this.targetWindow === win && win.CircuitJS1) {
          this.bindApi(win.CircuitJS1);
        }
      };
    }
  }

  /**
   * Detaches the adapter from the simulator and window, cleaning up all callback slots.
   * Safe to call repeatedly and across React Strict Mode mounts.
   */
  detach(): void {
    // 1. Clean up window hook if we installed one
    if (this.targetWindow && this.targetWindow.oncircuitjsloaded) {
      try {
        this.targetWindow.oncircuitjsloaded = undefined;
      } catch {
        // Window may be in process of tearing down
      }
    }

    // 2. Clear callbacks on the simulator
    if (this.api) {
      try {
        this.api.onupdate = null;
        this.api.ontimestep = null;
        this.api.onanalyze = null;
        this.api.onsvgrendered = null;
      } catch {
        // Ignored during iframe tear down
      }
      this.api = null;
    }

    // 3. Reject any pending SVG requests with a cancellation error
    if (this.pendingSvgRequests.length > 0) {
      const pending = [...this.pendingSvgRequests];
      this.pendingSvgRequests = [];
      pending.forEach((req) => {
        clearTimeout(req.timer);
        req.reject(new Error("CircuitAdapter detached before SVG rendering finished"));
      });
    }

    this.targetWindow = null;
    this.attached = false;
  }

  /**
   * Internal method: binds the simulator API and installs multiplexing callback dispatchers.
   */
  private bindApi(api: CircuitJS1Api): void {
    this.api = api;
    this.attached = true;

    // Own the simulator's single callback slots
    api.onupdate = (sim: CircuitJS1Api) => {
      this.updateSubscribers.forEach((cb) => {
        try {
          cb(sim);
        } catch (err) {
          console.error("CircuitAdapter onupdate error:", err);
        }
      });
    };

    api.ontimestep = (sim: CircuitJS1Api) => {
      this.timestepSubscribers.forEach((cb) => {
        try {
          cb(sim);
        } catch (err) {
          console.error("CircuitAdapter ontimestep error:", err);
        }
      });
    };

    api.onanalyze = (sim: CircuitJS1Api) => {
      this.analyzeSubscribers.forEach((cb) => {
        try {
          cb(sim);
        } catch (err) {
          console.error("CircuitAdapter onanalyze error:", err);
        }
      });
    };

    api.onsvgrendered = (sim: CircuitJS1Api, svg: string) => {
      // Fan out to registered SVG listeners
      this.svgSubscribers.forEach((cb) => {
        try {
          cb(sim, svg);
        } catch (err) {
          console.error("CircuitAdapter onsvgrendered error:", err);
        }
      });

      // Resolve pending requestSVG promises
      if (this.pendingSvgRequests.length > 0) {
        const pending = [...this.pendingSvgRequests];
        this.pendingSvgRequests = [];
        pending.forEach((req) => {
          clearTimeout(req.timer);
          req.resolve(svg);
        });
      }
    };

    // Notify ready subscribers
    this.readySubscribers.forEach((cb) => {
      try {
        cb(api);
      } catch (err) {
        console.error("CircuitAdapter onReady error:", err);
      }
    });
  }

  /**
   * Returns true if the adapter is currently connected to a live CircuitJS1 instance.
   */
  isAttached(): boolean {
    return this.attached && this.api !== null;
  }

  /**
   * Returns the underlying simulator API if attached, otherwise null.
   */
  getApi(): CircuitJS1Api | null {
    return this.api;
  }

  /**
   * Subscribes to ready state. If already attached, the callback is fired asynchronously on next tick.
   * Returns an unsubscribe function.
   */
  onReady(callback: (api: CircuitJS1Api) => void): () => void {
    this.readySubscribers.add(callback);
    if (this.api) {
      const currentApi = this.api;
      queueMicrotask(() => {
        if (this.api === currentApi) {
          callback(currentApi);
        }
      });
    }
    return () => {
      this.readySubscribers.delete(callback);
    };
  }

  /**
   * Returns a promise that resolves once the simulator API is attached and ready.
   */
  waitUntilReady(timeoutMs = 10000): Promise<CircuitJS1Api> {
    if (this.api) {
      return Promise.resolve(this.api);
    }
    return new Promise<CircuitJS1Api>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const unsubscribe = this.onReady((api) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(api);
      });
      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for CircuitJS1 ready (${timeoutMs}ms)`));
      }, timeoutMs);
    });
  }

  /**
   * Subscribes to analyze events (fired when the circuit topology or state changes).
   * Used for auto-saving circuits.
   */
  onAnalyze(callback: CircuitEventListener): () => void {
    this.analyzeSubscribers.add(callback);
    return () => {
      this.analyzeSubscribers.delete(callback);
    };
  }

  /**
   * Subscribes to simulation update events.
   */
  onUpdate(callback: CircuitEventListener): () => void {
    this.updateSubscribers.add(callback);
    return () => {
      this.updateSubscribers.delete(callback);
    };
  }

  /**
   * Subscribes to simulation timestep events.
   */
  onTimestep(callback: CircuitEventListener): () => void {
    this.timestepSubscribers.add(callback);
    return () => {
      this.timestepSubscribers.delete(callback);
    };
  }

  /**
   * Subscribes to onsvgrendered events.
   */
  onSvgRendered(callback: CircuitSvgListener): () => void {
    this.svgSubscribers.add(callback);
    return () => {
      this.svgSubscribers.delete(callback);
    };
  }

  /**
   * Generic subscription helper.
   */
  subscribe(event: CircuitEventName, callback: CircuitEventListener): () => void {
    if (event === "analyze") return this.onAnalyze(callback);
    if (event === "update") return this.onUpdate(callback);
    if (event === "timestep") return this.onTimestep(callback);
    throw new Error(`Unknown circuit event: ${String(event)}`);
  }

  /**
   * Asynchronously requests SVG export of the current circuit.
   * Wraps getCircuitAsSVG() + onsvgrendered (docs/specs/modules.md §8).
   */
  async requestSVG(timeoutMs = 10000): Promise<string> {
    if (!this.api) {
      throw new Error("Cannot request SVG: CircuitJS1 is not attached");
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingSvgRequests.findIndex((req) => req.resolve === resolve);
        if (idx !== -1) {
          this.pendingSvgRequests.splice(idx, 1);
        }
        reject(new Error(`Timeout waiting for onsvgrendered (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingSvgRequests.push({ resolve, reject, timer });

      try {
        this.api!.getCircuitAsSVG();
      } catch (err) {
        clearTimeout(timer);
        const idx = this.pendingSvgRequests.findIndex((req) => req.resolve === resolve);
        if (idx !== -1) {
          this.pendingSvgRequests.splice(idx, 1);
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // Simulator control methods

  setSimRunning(run: boolean): void {
    this.api?.setSimRunning(run);
  }

  isRunning(): boolean {
    return this.api?.isRunning() ?? false;
  }

  getTime(): number {
    return this.api?.getTime() ?? 0;
  }

  getTimeStep(): number {
    return this.api?.getTimeStep() ?? 0;
  }

  setTimeStep(dt: number): void {
    this.api?.setTimeStep(dt);
  }

  getMaxTimeStep(): number {
    return this.api?.getMaxTimeStep() ?? 0;
  }

  setMaxTimeStep(dt: number): void {
    this.api?.setMaxTimeStep(dt);
  }

  getNodeVoltage(labelName: string): number {
    return this.api?.getNodeVoltage(labelName) ?? 0;
  }

  setExtVoltage(name: string, v: number): void {
    this.api?.setExtVoltage(name, v);
  }

  getElements(): unknown[] {
    return this.api?.getElements() ?? [];
  }

  /**
   * Exports the current circuit text. Treats the text as opaque per spec §7.2.
   */
  exportCircuit(): string {
    if (!this.api) {
      return "";
    }
    return this.api.exportCircuit() ?? "";
  }

  /**
   * Imports circuit text into the simulator.
   */
  importCircuit(text: string, subcircuitsOnly = false): void {
    if (!this.api) {
      throw new Error("Cannot import circuit: CircuitJS1 is not attached");
    }
    this.api.importCircuit(text, subcircuitsOnly);
  }

  /**
   * Invokes a main menu command by item id (Patch 3: runCommand).
   */
  runCommand(menu: string, item: string): void {
    if (this.api?.runCommand) {
      this.api.runCommand(menu, item);
    }
  }

  /**
   * Retrieves the current circuit as a PNG data URL (Patch 3: getCircuitAsPNG).
   */
  getCircuitAsPNG(): string | undefined {
    if (this.api?.getCircuitAsPNG) {
      return this.api.getCircuitAsPNG();
    }
    return undefined;
  }
}
