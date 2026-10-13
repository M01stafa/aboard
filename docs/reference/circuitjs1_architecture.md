# Comprehensive Architectural and Technical Specification of CircuitJS1 (Falstad Circuit Simulator)

## 1. Executive Summary & Historical Background

**CircuitJS1** is a full-featured, client-side electronic circuit simulator running natively within modern web browsers without server-side processing. 

* **Lineage:** Originally authored by physicist **Paul Falstad** as a standalone Java Applet (`Circuit.java`) using Java AWT/Swing.
* **Modern Web Port:** Ported to HTML5/JavaScript by **Iain Sharp** using the **Google Web Toolkit (GWT)** transpilation pipeline.
* **Core Philosophy:** Near real-time interactive simulation of analog, digital, and mixed-signal circuits with dynamic visual cues (moving electron particles, color-coded voltage gradients, and multi-channel oscilloscopes).
* **Licensing:** GNU General Public License v2.0 (GPL-2.0).

---

## 2. Explicit Languages & Technologies Stack

CircuitJS1 is a cross-compiled hybrid project. Below is an exhaustive breakdown of every programming language involved, its exact scope, and its functional responsibility.

### 2.1. Programming Languages

#### 1. Java (JDK 8 / 11)
* **Role:** Primary authoring language. 100% of the simulation kernel, numerical matrix solvers, component behavior models, and user interface logic are authored in standard Java source code (`.java`).
* **Why Java?** Retains Falstad's original object-oriented class hierarchy, strong static typing, numerical precision (`double` precision floats), and performance guarantees before compiling into optimized browser code.

#### 2. JavaScript (ECMAScript 5 / ES6+)
* **Role:** Execution target and host integration.
* **How it is used:** GWT transpiles all Java classes into highly optimized, obfuscated, or pretty-printed JavaScript. Additionally, native JavaScript is used via **JSNI (JavaScript Native Interface)** to bridge GWT with browser-exclusive APIs such as Web Audio, LocalStorage, file drag-and-drop, and third-party cloud SDKs.

#### 3. HTML5 (HyperText Markup Language)
* **Role:** Application skeleton and display canvas.
* **How it is used:** Contained in `war/circuitjs.html`. Provides the `<canvas>` viewport element where all rendering occurs, standard dialog wrappers, accessibility overlays, and the loader script tag.

#### 4. CSS3 (Cascading Style Sheets)
* **Role:** Outer chrome styling, context menus, modal dialogs, and responsive sidebar overlays.
* **How it is used:** Applied via `war/circuitjs.css` to manage drop-down layout positioning, modal z-index layering, slider inputs, and scrollable component selection trees.

---

## 3. Explicit Third-Party Libraries, Frameworks & Tooling

```
+-------------------------------------------------------------------------------+
|                               Browser Execution                               |
|                                                                               |
|  +--------------------+   +-----------------------+   +--------------------+  |
|  |    HTML5 Canvas    |   |     Web Audio API     |   | Browser Storage/IO |  |
|  |   (Direct 2D Context)|  | (Synthetic Sound Gen) |   | (Blob, FileReader) |  |
|  +---------^----------+   +-----------^-----------+   +---------^----------+  |
|            |                          |                         |             |
|  +---------+--------------------------+-------------------------+----------+  |
|  |                       GWT Emulated Runtime Library                       |  |
|  |        (java.lang.*, java.util.*, GWT User Widgets, JSNI Bridge)        |  |
|  +------------------------------------^------------------------------------+  |
|                                       |                                       |
|  +------------------------------------+------------------------------------+  |
|  |                 CircuitJS1 Compiled JavaScript Core                     |  |
|  |     [CirSim] <---> [CircuitElm Matrix] <---> [Scope Visualization]      |  |
|  +------------------------------------^------------------------------------+  |
+---------------------------------------|---------------------------------------+
                                        | Transpilation
+---------------------------------------|---------------------------------------+
|                               Build Pipeline                                  |
|                                                                               |
|  [Java Sources: src/com/falstad/*.java] ---> [Apache Ant] ---> [GWT Compiler] |
+-------------------------------------------------------------------------------+
```

The system minimizes heavy external node modules to preserve extreme execution speed and deterministic floating-point performance. Below are the concrete libraries and APIs utilized:

### 3.1. Compilation & Runtime Frameworks

#### Google Web Toolkit (GWT SDK v2.8.2 / v2.9.x)
* **What it is:** Google's production-grade transpiler that translates Java source code into JavaScript.
* **How it is used:**
  * **Emulation Layer:** Maps standard Java collections (`ArrayList`, `HashMap`, `Vector`, `Math`) directly into native JavaScript structures.
  * **Event Handling:** Handles DOM event registration (`MouseDownEvent`, `MouseMoveEvent`, `KeyDownEvent`).
  * **Dead Code Elimination:** Removes unused component definitions from the final generated JavaScript bundle.

#### Apache Ant
* **What it is:** Java-based build automation tool driven by an XML manifest (`build.xml`).
* **How it is used:**
  * Downloads external dependencies.
  * Compiles `.java` files into `.class` bytecode via `javac`.
  * Invokes `com.google.gwt.dev.Compiler` with optimization flags (`-O2`, `-style OBFUSCATED` or `DETAILED`).
  * Assembles the deployable distribution directory inside `war/`.

### 3.2. Web APIs & System Integrations

#### 1. HTML5 Canvas 2D Rendering Context
* **How it is imported/used:** Accessed through GWT's `com.google.gwt.canvas.client.Canvas` and `Context2d`.
* **Application:** Every single graphic—wires, resistors, active current arrows, moving yellow particles, voltage color maps (green for positive, gray for ground, red for negative), and oscilloscope grids—is rendered directly onto a single 2D context using `beginPath()`, `lineTo()`, `stroke()`, and `fillText()`.

#### 2. Web Audio API
* **How it is imported/used:** Integrated through native JavaScript injection via GWT JSNI methods (`/*-{ ... }-*/`).
* **Application:** Connected to speaker elements and AC sources. Samples the voltage values at every sub-step and feeds them into an `AudioContext` and `ScriptProcessorNode` / `AudioWorkletNode` to produce realistic audible sound frequencies in real time.

#### 3. LZMA / Pako (Deflate/Inflate Compression)
* **How it is used:** Integrated to compress complex circuit netlists into URL hash strings (`#c=...`). This allows users to bookmark and share complex multi-node circuits via a single hyper-link without storing state on an external database.

#### 4. Cloud Storage Integrations (Dropbox Chooser & Google Drive Picker)
* **How it is used:** Optional external JavaScript SDKs linked dynamically in `circuitjs.html` allowing direct cloud-based `.circuitjs` schematic loading and saving.

---

## 4. Architectural Anatomy of the Codebase

All core source files reside in the package `src/com/falstad/`.

```
src/com/falstad/
├── CirSim.java                 # Central controller, simulation loop, canvas event dispatcher
├── CircuitElm.java             # Abstract base class for every circuit element
├── Scope.java                  # Oscilloscope logic, trigger thresholds, FFT, and trace renderers
├── CircuitNode.java            # Represents junction nodes and their connectivity
├── CircuitNodeLink.java        # Link representation between an element pin and a node
├── EditInfo.java               # Dynamic schema model for UI component properties dialog
│
├── [Linear Elements]
│   ├── ResistorElm.java        # Ohmic resistors and pots
│   ├── CapacitorElm.java       # Capacitors with companion models
│   ├── InductorElm.java        # Inductors with flux storage companion models
│   └── WireElm.java            # Ideal short-circuit zero-resistance conductors
│
├── [Active & Semiconductor Elements]
│   ├── DiodeElm.java           # Shockley exponential PN junction models
│   ├── TransistorElm.java      # Bipolar Junction Transistors (NPN/PNP)
│   ├── MosfetElm.java          # MOSFETs (Enhancement/Depletion, N- & P-Channel)
│   ├── JfetElm.java            # Junction Field Effect Transistors
│   └── OpAmpElm.java           # Operational Amplifiers (ideal & non-ideal)
│
├── [Signal & Power Sources]
│   ├── VoltageElm.java         # Ideal AC, DC, square, triangle, and pulse sources
│   ├── CurrentElm.java         # Independent constant/dynamic current sources
│   └── GroundElm.java          # Matrix reference node (Node 0)
│
└── [Digital & Mixed-Signal Elements]
    ├── LogicGateElm.java       # Base class for digital primitives (AND, OR, NOT, NAND, XOR)
    ├── DACElm.java / ADCElm    # Mixed-signal conversion blocks
    └── SevenSegElm.java        # Visual display readouts
```

---

## 5. Circuit Element Lifecycle: Creation, Stamping, and Solving

Every component in CircuitJS1 follows a strict, cyclic lifecycle. The diagram below illustrates how an element transitions from schematic placement to mathematical matrix evaluation and final pixel rendering.

```
       [User Interaction / Schematic Placement]
                         │
                         ▼
             Instantiation & Pin Linking
          (allocates nodes via CircuitNode)
                         │
                         ▼
        Matrix Formulation (stamp() phase)
   (conductances written to G; currents to Vector I)
                         │
                         ▼
  +──────────────────────────────────────────────+
  │            Iterative Simulation Loop         │
  │                                              │
  │      Non-linear Convergence (doStep())       │
  │      LU Decomposition System Matrix Solve    │
  │      Companion State Update (integrate)      │
  +──────────────────────┬───────────────────────+
                         │
                         ▼
               Render Cycle (draw())
        (canvas paths, moving dots, scopes)
```

### 5.1. Instantiation and Terminal Allocation
When a component is dropped onto the canvas, the class constructor registers its geometric boundaries and number of terminals (posts):

```java
public class ResistorElm extends CircuitElm {
    double resistance;

    public ResistorElm(int xx, int yy) {
        super(xx, yy);
        resistance = 1000; // Default: 1 kOhm
    }

    @Override
    public int getPostCount() { return 2; }
    
    @Override
    public Point getPost(int n) {
        return (n == 0) ? new Point(x, y) : new Point(x2, y2);
    }
}
```

### 5.2. Matrix Formulation: Modified Nodal Analysis (MNA)
The engine models the entire circuit via the MNA linear matrix equation:

$$\mathbf{G} \cdot \mathbf{v} = \mathbf{i}$$

Where:
* $\mathbf{G}$: The Conductance/Admittance matrix ($M \times M$).
* $\mathbf{v}$: Vector of unknown node voltages and branch currents through voltage sources.
* $\mathbf{i}$: Vector of known independent current and voltage injections.

During the setup phase (`CirSim.setupCircuit()`), the master solver queries every component's `stamp()` method to populate $\mathbf{G}$ and $\mathbf{i}$:

```java
// Resistor stamping example:
@Override
public void stamp() {
    double g = 1.0 / resistance; // Conductance
    // Node indices for terminals 0 and 1
    int nodeA = nodes[0];
    int nodeB = nodes[1];

    // Stamp conductance values according to Kirchhoff's Current Law
    sim.stampMatrix(nodeA, nodeA,  g);
    sim.stampMatrix(nodeB, nodeB,  g);
    sim.stampMatrix(nodeA, nodeB, -g);
    sim.stampMatrix(nodeB, nodeA, -g);
}
```

### 5.3. Dynamic Companion Models for Reactive Components ($C$ and $L$)
Reactive elements undergo numerical integration (Trapezoidal Rule) to transform continuous differential equations into discrete resistive companion models evaluated at time step $\Delta t$:

* **Capacitor ($I = C \frac{dv}{dt}$):**
  Modeled as an equivalent conductance $G_{eq} = \frac{2C}{\Delta t}$ in parallel with an equivalent history current source:
  $$I_{eq}(t) = -G_{eq} \cdot V(t - \Delta t) - I(t - \Delta t)$$

* **Inductor ($V = L \frac{di}{dt}$):**
  Modeled as an equivalent conductance $G_{eq} = \frac{\Delta t}{2L}$ in series with a voltage source tracking historical flux linkage.

### 5.4. Non-Linear Components (Diodes, BJTs, MOSFETs)
Non-linear devices cannot be solved in a single matrix pass. CircuitJS1 applies the **Newton-Raphson method**:

1. In `doStep()`, the component evaluates its junction voltage $V_{prev}$.
2. It linearizes its characteristic curve around $V_{prev}$ by calculating the dynamic tangent conductance:
   $$g_{eq} = \left. \frac{dI}{dV} \right|_{V_{prev}}$$
3. It updates $\mathbf{G}$ and stamps an equivalent companion current source into $\mathbf{i}$.
4. The solver solves the system again.
5. If the new voltage $V_{next}$ deviates from $V_{prev}$ by more than a convergence tolerance (e.g., $10^{-6}\text{ V}$), the simulator recalculates until convergence or damping occurs.

---

## 6. Oscilloscope Architecture (`Scope.java`)

The oscilloscope subsystem operates asynchronously from display framerates to capture microsecond electrical transients:

```
[Simulation Solver] ──(Pushes V, I)──> [Circular Ring Buffer]
                                                │
                                                ▼
                                    [Edge Trigger Detector]
                                                │
                                                ▼
                                    [Horizontal Scale Engine]
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                           Time-Domain Plot         FFT Spectrum Engine
                          (Voltage vs Time)        (Radix-2 Cooley-Tukey)
```

1. **Circular Ring Buffers:** Each oscilloscope probe allocates fixed-size circular floating-point arrays storing continuous historical values of voltage, current, and differential states without causing garbage collection overhead.
2. **Edge Triggering:** Scans incoming samples for threshold crossings (positive or negative slope) to establish a stable reference trigger point, eliminating horizontal jitter.
3. **Multi-Mode Visualizations:**
   * **Transient Analysis ($V$ vs. $t$):** Standard rolling or triggered time-domain waveform.
   * **$X$-$Y$ Mode (Lissajous curves):** Maps two nodes against each other to evaluate phase shift and resonance curves.
   * **FFT (Fast Fourier Transform):** Evaluates frequency spectrum harmonics using a Radix-2 discrete Fourier transform algorithm.

---

## 7. Storage Serialization: The CircuitJS1 Netlist Syntax

Schematics are serialized into a highly compact, custom space-delimited text format:

```text
$ 1 0.000005 10.2002 50 5 43
r 192 112 192 208 0 1000
c 288 112 288 208 0 0.000001 4.999
v 96 208 96 112 0 1 40 5 0 0 0.5
w 96 112 192 112 0
o 1 64 0 4099 5 0.000097 0 -1
```

### Format Schema:
* **Line `$`:** Global simulator configuration flags:
  * Parameter 1: Time step per iteration ($\Delta t$, e.g., $5\ \mu\text{s}$).
  * Parameter 2: Display update speed ratio.
  * Parameter 3: Current particle speed and grid visual scale.
* **Component Lines (`r`, `c`, `v`, `w`, etc.):**
  * Token 1: Element type identifier (`r` = resistor, `c` = capacitor, `v` = AC/DC source, `w` = wire).
  * Tokens 2–5: Geometric coordinates ($x_1, y_1, x_2, y_2$) snapped to an internal grid (typically multiples of 16 pixels).
  * Token 6: Element-specific flags (e.g., polarity, waveform type, series resistance).
  * Tokens 7+: Primary physical parameters (resistance in Ohms, capacitance in Farads, peak voltage, frequency).
* **Line `o`:** Oscilloscope configuration (scope index, target component/node, vertical scale, horizontal sweep duration).

---

## 8. Build, Compilation, and Development Workflow

### Prerequisites
* **Java Development Kit (JDK):** Version 8 or 11 (GWT compatibility requirement).
* **Build System:** Apache Ant (v1.9 or later).
* **Modern Web Browser:** Chrome, Firefox, Safari, or Edge supporting HTML5 Canvas and Web Audio.

### Step-by-Step Compilation Commands

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sharpie7/circuitjs1.git
   cd circuitjs1
   ```

2. **Compile with Apache Ant:**
   ```bash
   ant
   ```
   *The `build.xml` script compiles all `.java` files, validates dependencies, invokes the GWT transpiler, and outputs all assets, HTML, CSS, and compiled JavaScript into the `war/` directory.*

3. **Serve Locally:**
   Because browsers enforce CORS on local Canvas resources and Web Workers, serve the `war/` directory through a local HTTP server:
   ```bash
   cd war
   # Using Node.js:
   npx serve .
   # OR using Python 3:
   python3 -m http.server 8000
   ```
   Navigate to: `http://localhost:8000/circuitjs.html`.

---

## 9. Developer Guide: Creating a Custom Component

To introduce a new electronic component (e.g., a **Photoresistor / LDR** whose resistance depends on ambient light $L$):

### 1. Extend `CircuitElm`
Create `src/com/falstad/PhotoresistorElm.java`:

```java
package com.falstad;

public class PhotoresistorElm extends CircuitElm {
    double minResistance;
    double maxResistance;
    double lightIntensity; // 0.0 (dark) to 1.0 (bright)

    public PhotoresistorElm(int xx, int yy) {
        super(xx, yy);
        minResistance = 100.0;     // 100 Ohms in bright light
        maxResistance = 1000000.0; // 1 MOhm in darkness
        lightIntensity = 0.5;
    }

    @Override
    public int getDumpType() { return 401; } // Unique serialization token

    public double calculateResistance() {
        return maxResistance * Math.pow(minResistance / maxResistance, lightIntensity);
    }

    @Override
    public int getPostCount() { return 2; }

    @Override
    public void stamp() {
        double r = calculateResistance();
        sim.stampResistor(nodes[0], nodes[1], r);
    }

    @Override
    public void draw(Graphics g) {
        // Draw standard resistor zig-zag lines
        draw2Leads(g);
        // Draw inward-pointing optical arrows representing light input
        drawLightArrows(g);
        // Animate dynamic current particles
        doDots(g);
    }

    @Override
    public EditInfo getEditInfo(int n) {
        if (n == 0) return new EditInfo("Light Level (0-1)", lightIntensity, 0, 1);
        return null;
    }

    @Override
    public void setEditValue(int n, EditInfo ei) {
        if (n == 0) lightIntensity = ei.value;
    }
}
```

### 2. Register Component in UI Menu
In `CirSim.java`, add the class constructor reference to the component instantiator map and append it to the right-click context menu within `setupMainMenu()`.