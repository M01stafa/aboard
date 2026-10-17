import type { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { I18nKey } from "@/i18n/types";

export type TemplateSkeleton = NonNullable<
  Parameters<typeof convertToExcalidrawElements>[0]
>[number];

export type TemplateId =
  | "diagnosis-tree"
  | "xy-axes"
  | "graph-paper"
  | "dotted-circuit-frame"
  | "cornell-notes"
  | "comparison-table"
  | "mind-map"
  | "flowchart";

export interface TemplateDefinition {
  id: TemplateId;
  titleKey: I18nKey;
  descKey: I18nKey;
  width: number;
  height: number;
  generate: (options: {
    lang: "en" | "ar";
    originX: number;
    originY: number;
  }) => TemplateSkeleton[];
}

/**
 * 1. Diagnosis Tree: Medical differential diagnosis workflow (boxes + directed arrows).
 */
function generateDiagnosisTree({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];

  // Root Box (Center top)
  elements.push({
    type: "rectangle",
    x: originX + 220,
    y: originY + 20,
    width: 220,
    height: 60,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: isAr ? "عرض المريض والشكوى" : "Patient Presentation",
      fontSize: 16,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Branch 1 Box
  // In RTL Arabic, primary acute branch is on the right
  const branch1X = isAr ? originX + 380 : originX + 20;
  const branch1Text = isAr
    ? "بداية حادة / طارئة\n(تدخل إسعافي فوري)"
    : "Acute Presentation\n(Emergency Care)";

  elements.push({
    type: "rectangle",
    x: branch1X,
    y: originY + 140,
    width: 240,
    height: 70,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: branch1Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Branch 2 Box
  const branch2X = isAr ? originX + 20 : originX + 380;
  const branch2Text = isAr
    ? "حالة مزمنة / مستقرة\n(فحوصات روتينية ومتابعة)"
    : "Subacute / Chronic\n(Outpatient Workup)";

  elements.push({
    type: "rectangle",
    x: branch2X,
    y: originY + 140,
    width: 240,
    height: 70,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: branch2Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Outcome 1 Box
  const outcome1Text = isAr
    ? "خطة الطوارئ والعناية المركزة\n(استقرار المؤشرات الحيوية)"
    : "Emergency Management\n& ICU Admission";

  elements.push({
    type: "rectangle",
    x: branch1X,
    y: originY + 280,
    width: 240,
    height: 70,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: outcome1Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Outcome 2 Box
  const outcome2Text = isAr
    ? "خطة العلاج والمتابعة الدورية\n(الفحوصات الشاملة)"
    : "Targeted Therapy\n& Clinic Follow-Up";

  elements.push({
    type: "rectangle",
    x: branch2X,
    y: originY + 280,
    width: 240,
    height: 70,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: outcome2Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Arrows from Root to Branches
  elements.push({
    type: "arrow",
    x: originX + 290,
    y: originY + 80,
    points: [
      [0, 0],
      [branch1X + 120 - (originX + 290), 60],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  elements.push({
    type: "arrow",
    x: originX + 370,
    y: originY + 80,
    points: [
      [0, 0],
      [branch2X + 120 - (originX + 370), 60],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  // Arrows from Branches to Outcomes
  elements.push({
    type: "arrow",
    x: branch1X + 120,
    y: originY + 210,
    points: [
      [0, 0],
      [0, 70],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  elements.push({
    type: "arrow",
    x: branch2X + 120,
    y: originY + 210,
    points: [
      [0, 0],
      [0, 70],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  return elements;
}

/**
 * 2. X-Y Axes: Coordinate axes with ticks, origin, and labels.
 */
function generateXyAxes({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];

  const originPointX = originX + 70;
  const originPointY = originY + 340;
  const axisLengthX = 380;
  const axisLengthY = 300;

  // Horizontal X-axis arrow
  elements.push({
    type: "arrow",
    x: originPointX,
    y: originPointY,
    points: [
      [0, 0],
      [axisLengthX, 0],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  // Vertical Y-axis arrow
  elements.push({
    type: "arrow",
    x: originPointX,
    y: originPointY,
    points: [
      [0, 0],
      [0, -axisLengthY],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  // X Axis Label
  elements.push({
    type: "text",
    x: originPointX + axisLengthX + 12,
    y: originPointY - 10,
    text: isAr ? "س (X)" : "X",
    fontSize: 18,
    textAlign: "left",
    verticalAlign: "middle",
  });

  // Y Axis Label
  elements.push({
    type: "text",
    x: originPointX - 10,
    y: originPointY - axisLengthY - 26,
    text: isAr ? "ص (Y)" : "Y",
    fontSize: 18,
    textAlign: "center",
    verticalAlign: "middle",
  });

  // Origin (0,0) label
  elements.push({
    type: "text",
    x: originPointX - 45,
    y: originPointY + 8,
    text: isAr ? "(٠، ٠)" : "(0, 0)",
    fontSize: 14,
    textAlign: "right",
    verticalAlign: "top",
  });

  // X ticks and numbers (5 ticks spaced by 60px)
  const xLabels = isAr
    ? ["١", "٢", "٣", "٤", "٥"]
    : ["1", "2", "3", "4", "5"];
  for (let i = 1; i <= 5; i++) {
    const tickX = originPointX + i * 60;
    elements.push({
      type: "line",
      x: tickX,
      y: originPointY - 6,
      points: [
        [0, 0],
        [0, 12],
      ],
      strokeWidth: 1.5,
    });
    elements.push({
      type: "text",
      x: tickX - 8,
      y: originPointY + 10,
      text: xLabels[i - 1],
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "top",
    });
  }

  // Y ticks and numbers (5 ticks spaced by 50px)
  const yLabels = isAr
    ? ["١", "٢", "٣", "٤", "٥"]
    : ["1", "2", "3", "4", "5"];
  for (let i = 1; i <= 5; i++) {
    const tickY = originPointY - i * 50;
    elements.push({
      type: "line",
      x: originPointX - 6,
      y: tickY,
      points: [
        [0, 0],
        [12, 0],
      ],
      strokeWidth: 1.5,
    });
    elements.push({
      type: "text",
      x: originPointX - 28,
      y: tickY - 8,
      text: yLabels[i - 1],
      fontSize: 14,
      textAlign: "right",
      verticalAlign: "middle",
    });
  }

  return elements;
}

/**
 * 3. Graph Paper: Engineering orthogonal grid layout.
 */
function generateGraphPaper({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];
  const width = 600;
  const height = 400;
  const step = 40;

  // Title badge
  elements.push({
    type: "text",
    x: isAr ? originX + width - 120 : originX + 8,
    y: originY + 8,
    text: isAr ? "ورق رسم بياني هندسي" : "Engineering Graph Grid",
    fontSize: 14,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
    opacity: 70,
  });

  const gridStartY = originY + 36;
  const gridHeight = height - 36;

  // Outer border
  elements.push({
    type: "rectangle",
    x: originX,
    y: gridStartY,
    width,
    height: gridHeight,
    strokeWidth: 2,
    roughness: 0,
  });

  // Vertical lines
  for (let x = step; x < width; x += step) {
    elements.push({
      type: "line",
      x: originX + x,
      y: gridStartY,
      points: [
        [0, 0],
        [0, gridHeight],
      ],
      strokeWidth: 1,
      roughness: 0,
      opacity: 45,
    });
  }

  // Horizontal lines
  for (let y = step; y < gridHeight; y += step) {
    elements.push({
      type: "line",
      x: originX,
      y: gridStartY + y,
      points: [
        [0, 0],
        [width, 0],
      ],
      strokeWidth: 1,
      roughness: 0,
      opacity: 45,
    });
  }

  return elements;
}

/**
 * 4. Dotted Circuit Frame: Breadboard prototyping area with power and ground rails.
 */
function generateDottedCircuitFrame({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];
  const width = 640;
  const height = 360;

  // Outer chassis frame
  elements.push({
    type: "rectangle",
    x: originX,
    y: originY,
    width,
    height,
    strokeWidth: 2,
    roundness: { type: 3 },
  });

  // Title
  elements.push({
    type: "text",
    x: isAr ? originX + width - 140 : originX + 24,
    y: originY + 12,
    text: isAr ? "لوحة تجارب دوائر منقطة" : "Prototyping Breadboard",
    fontSize: 14,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
  });

  // Top Power Rails
  elements.push({
    type: "line",
    x: originX + 30,
    y: originY + 44,
    points: [
      [0, 0],
      [580, 0],
    ],
    strokeWidth: 2,
  });
  elements.push({
    type: "text",
    x: originX + 30,
    y: originY + 28,
    text: isAr ? "+ خط التغذية (+5V)" : "+ VCC (+5V)",
    fontSize: 12,
    textAlign: "left",
    verticalAlign: "top",
  });

  elements.push({
    type: "line",
    x: originX + 30,
    y: originY + 70,
    points: [
      [0, 0],
      [580, 0],
    ],
    strokeWidth: 2,
  });
  elements.push({
    type: "text",
    x: originX + 30,
    y: originY + 54,
    text: isAr ? "- خط التأريض (GND)" : "- GND (0V)",
    fontSize: 12,
    textAlign: "left",
    verticalAlign: "top",
  });

  // Center Divider Trough
  elements.push({
    type: "line",
    x: originX + 30,
    y: originY + 180,
    points: [
      [0, 0],
      [580, 0],
    ],
    strokeStyle: "dashed",
    strokeWidth: 1.5,
  });

  // Bottom Power Rails
  elements.push({
    type: "line",
    x: originX + 30,
    y: originY + 290,
    points: [
      [0, 0],
      [580, 0],
    ],
    strokeWidth: 2,
  });
  elements.push({
    type: "text",
    x: originX + 30,
    y: originY + 274,
    text: isAr ? "+ خط التغذية (+5V)" : "+ VCC (+5V)",
    fontSize: 12,
    textAlign: "left",
    verticalAlign: "top",
  });

  elements.push({
    type: "line",
    x: originX + 30,
    y: originY + 316,
    points: [
      [0, 0],
      [580, 0],
    ],
    strokeWidth: 2,
  });
  elements.push({
    type: "text",
    x: originX + 30,
    y: originY + 300,
    text: isAr ? "- خط التأريض (GND)" : "- GND (0V)",
    fontSize: 12,
    textAlign: "left",
    verticalAlign: "top",
  });

  // Breadboard Terminal Holes (Upper bank and Lower bank)
  // 10 columns across x, 4 rows in upper bank, 4 rows in lower bank
  for (let c = 0; c < 10; c++) {
    const colX = originX + 80 + c * 52;
    // Column header index
    elements.push({
      type: "text",
      x: colX,
      y: originY + 82,
      text: String(c + 1),
      fontSize: 10,
      textAlign: "center",
      verticalAlign: "top",
    });

    // Upper rows (A, B, C, D)
    for (let r = 0; r < 4; r++) {
      const rowY = originY + 98 + r * 18;
      elements.push({
        type: "ellipse",
        x: colX - 3,
        y: rowY - 3,
        width: 6,
        height: 6,
        fillStyle: "solid",
        strokeWidth: 1,
      });
    }

    // Lower rows (E, F, G, H)
    for (let r = 0; r < 4; r++) {
      const rowY = originY + 196 + r * 18;
      elements.push({
        type: "ellipse",
        x: colX - 3,
        y: rowY - 3,
        width: 6,
        height: 6,
        fillStyle: "solid",
        strokeWidth: 1,
      });
    }
  }

  return elements;
}

/**
 * 5. Cornell Notes: Split page with header, cue column, notes area, and summary.
 */
function generateCornellNotes({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];
  const width = 640;
  const headerHeight = 72;
  const bodyHeight = 440;
  const summaryHeight = 120;
  const cueWidth = 200;
  const notesWidth = width - cueWidth;

  // Header Box
  elements.push({
    type: "rectangle",
    x: originX,
    y: originY,
    width,
    height: headerHeight,
    strokeWidth: 2,
  });

  elements.push({
    type: "text",
    x: isAr ? originX + width - 16 : originX + 16,
    y: originY + 14,
    text: isAr
      ? "الموضوع / العنوان: ________________________________"
      : "Topic / Title: ________________________________",
    fontSize: 15,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
  });

  elements.push({
    type: "text",
    x: isAr ? originX + width - 16 : originX + 16,
    y: originY + 42,
    text: isAr
      ? "التاريخ: ____/____/٢٠٢٦   |   المساق: ____________"
      : "Date: ____/____/2026   |   Course: ____________",
    fontSize: 13,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
  });

  // Body Layout: In RTL, Cue column is on the right, Notes on the left
  const cueX = isAr ? originX + notesWidth : originX;
  const notesX = isAr ? originX : originX + cueWidth;

  // Cue Column
  elements.push({
    type: "rectangle",
    x: cueX,
    y: originY + headerHeight,
    width: cueWidth,
    height: bodyHeight,
    strokeWidth: 2,
  });

  elements.push({
    type: "text",
    x: isAr ? cueX + cueWidth - 14 : cueX + 14,
    y: originY + headerHeight + 14,
    text: isAr
      ? "الكلمات المفتاحية والأسئلة\n\n• المفاهيم الأساسية\n• أسئلة المراجعة\n• المصطلحات والرموز"
      : "CUES / QUESTIONS\n\n• Key concepts\n• Review questions\n• Terms & definitions",
    fontSize: 13,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
  });

  // Notes Column
  elements.push({
    type: "rectangle",
    x: notesX,
    y: originY + headerHeight,
    width: notesWidth,
    height: bodyHeight,
    strokeWidth: 2,
  });

  elements.push({
    type: "text",
    x: isAr ? notesX + notesWidth - 16 : notesX + 16,
    y: originY + headerHeight + 14,
    text: isAr
      ? "الملاحظات والشروحات التفصيلية\n\n• النقاط الرئيسية أثناء المحاضرة\n• الرسوم التوضيحية والمعادلات\n• الاستنتاجات والأمثلة العملية"
      : "NOTES / LECTURE CONTENT\n\n• Main points & detailed explanations\n• Formulas & derivations\n• Diagrams, examples & evidence",
    fontSize: 13,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
  });

  // Summary Box (Bottom)
  const summaryY = originY + headerHeight + bodyHeight;
  elements.push({
    type: "rectangle",
    x: originX,
    y: summaryY,
    width,
    height: summaryHeight,
    strokeWidth: 2,
  });

  elements.push({
    type: "text",
    x: isAr ? originX + width - 16 : originX + 16,
    y: summaryY + 14,
    text: isAr
      ? "الملخص والخلاصة:\nأهم الأفكار المستفادة وصياغة الاستنتاج الرئيسي بأسلوبك الخاص:"
      : "SUMMARY:\nBrief synthesis and key takeaways in your own words:",
    fontSize: 14,
    textAlign: isAr ? "right" : "left",
    verticalAlign: "top",
  });

  return elements;
}

/**
 * 6. Comparison Table: 3 columns with header and structured rows.
 */
function generateComparisonTable({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];
  const colWidth = 210;
  const headerHeight = 50;
  const rowHeight = 70;
  const rowsCount = 3;

  const col1X = isAr ? originX + colWidth * 2 : originX;
  const col2X = originX + colWidth;
  const col3X = isAr ? originX : originX + colWidth * 2;

  const header1Text = isAr ? "المعيار / الخاصية" : "Feature / Criteria";
  const header2Text = isAr ? "الخيار (أ)" : "Option A";
  const header3Text = isAr ? "الخيار (ب)" : "Option B";

  // Headers
  elements.push({
    type: "rectangle",
    x: col1X,
    y: originY,
    width: colWidth,
    height: headerHeight,
    strokeWidth: 2,
    label: {
      text: header1Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  elements.push({
    type: "rectangle",
    x: col2X,
    y: originY,
    width: colWidth,
    height: headerHeight,
    strokeWidth: 2,
    label: {
      text: header2Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  elements.push({
    type: "rectangle",
    x: col3X,
    y: originY,
    width: colWidth,
    height: headerHeight,
    strokeWidth: 2,
    label: {
      text: header3Text,
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Row Data
  const rowContent = [
    {
      c1: isAr ? "الهدف والآلية الأساسية" : "Core Mechanism & Goal",
      c2: isAr ? "آلية مباشرة وسريعة" : "Direct & High Speed",
      c3: isAr ? "آلية شاملة ودقيقة" : "Comprehensive & Adaptive",
    },
    {
      c1: isAr ? "أبرز المزايا ونقاط القوة" : "Key Strengths",
      c2: isAr ? "+ كفاءة تشغيل وموثوقية" : "+ High efficiency & reliable",
      c3: isAr ? "+ مرونة وسهولة توسع" : "+ Flexible & scalable",
    },
    {
      c1: isAr ? "القيود والتحديات" : "Limitations & Trade-offs",
      c2: isAr ? "- تكلفة أولية أعلى" : "- Higher upfront complexity",
      c3: isAr ? "- استهلاك موارد أكبر" : "- Higher memory consumption",
    },
  ];

  for (let r = 0; r < rowsCount; r++) {
    const rowY = originY + headerHeight + r * rowHeight;
    const item = rowContent[r];

    elements.push({
      type: "rectangle",
      x: col1X,
      y: rowY,
      width: colWidth,
      height: rowHeight,
      strokeWidth: 1.5,
      label: {
        text: item.c1,
        fontSize: 13,
        textAlign: "center",
        verticalAlign: "middle",
      },
    });

    elements.push({
      type: "rectangle",
      x: col2X,
      y: rowY,
      width: colWidth,
      height: rowHeight,
      strokeWidth: 1.5,
      label: {
        text: item.c2,
        fontSize: 13,
        textAlign: "center",
        verticalAlign: "middle",
      },
    });

    elements.push({
      type: "rectangle",
      x: col3X,
      y: rowY,
      width: colWidth,
      height: rowHeight,
      strokeWidth: 1.5,
      label: {
        text: item.c3,
        fontSize: 13,
        textAlign: "center",
        verticalAlign: "middle",
      },
    });
  }

  return elements;
}

/**
 * 7. Mind Map: Central concept circle radiating to sub-circles via connecting arrows.
 */
function generateMindMap({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];

  // Center Node
  const centerX = originX + 260;
  const centerY = originY + 200;
  const centerW = 180;
  const centerH = 80;

  elements.push({
    type: "ellipse",
    x: centerX,
    y: centerY,
    width: centerW,
    height: centerH,
    strokeWidth: 2.5,
    label: {
      text: isAr ? "المفهوم الرئيسي" : "Central Concept",
      fontSize: 16,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // 4 Satellites: Top, Right, Bottom, Left
  const satellites = [
    {
      x: originX + 260,
      y: originY + 30,
      w: 180,
      h: 64,
      text: isAr ? "١. المبادئ الأساسية" : "1. Key Principles",
      fromX: centerX + centerW / 2,
      fromY: centerY,
      toX: originX + 260 + 90,
      toY: originY + 30 + 64,
    },
    {
      x: originX + 510,
      y: originY + 208,
      w: 160,
      h: 64,
      text: isAr ? "٢. التطبيقات العملية" : "2. Applications",
      fromX: centerX + centerW,
      fromY: centerY + centerH / 2,
      toX: originX + 510,
      toY: originY + 208 + 32,
    },
    {
      x: originX + 260,
      y: originY + 370,
      w: 180,
      h: 64,
      text: isAr ? "٣. التحليل والبراهين" : "3. Analysis & Proof",
      fromX: centerX + centerW / 2,
      fromY: centerY + centerH,
      toX: originX + 260 + 90,
      toY: originY + 370,
    },
    {
      x: originX + 20,
      y: originY + 208,
      w: 160,
      h: 64,
      text: isAr ? "٤. أمثلة وتطبيقات" : "4. Examples & Cases",
      fromX: centerX,
      fromY: centerY + centerH / 2,
      toX: originX + 20 + 160,
      toY: originY + 208 + 32,
    },
  ];

  for (const sat of satellites) {
    // Satellite ellipse
    elements.push({
      type: "ellipse",
      x: sat.x,
      y: sat.y,
      width: sat.w,
      height: sat.h,
      strokeWidth: 2,
      label: {
        text: sat.text,
        fontSize: 14,
        textAlign: "center",
        verticalAlign: "middle",
      },
    });

    // Connecting arrow
    elements.push({
      type: "arrow",
      x: sat.fromX,
      y: sat.fromY,
      points: [
        [0, 0],
        [sat.toX - sat.fromX, sat.toY - sat.fromY],
      ],
      endArrowhead: "arrow",
      strokeWidth: 2,
    });
  }

  return elements;
}

/**
 * 8. Flowchart: Start/end pills, process rectangles, decision diamond, and branch arrows.
 */
function generateFlowchart({
  lang,
  originX,
  originY,
}: {
  lang: "en" | "ar";
  originX: number;
  originY: number;
}): TemplateSkeleton[] {
  const isAr = lang === "ar";
  const elements: TemplateSkeleton[] = [];
  const centerX = originX + 150;

  // 1. Start Terminal (Pill)
  elements.push({
    type: "rectangle",
    x: centerX,
    y: originY + 16,
    width: 180,
    height: 50,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: isAr ? "البداية (Start)" : "Start",
      fontSize: 15,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Arrow from Start to Process 1
  elements.push({
    type: "arrow",
    x: centerX + 90,
    y: originY + 66,
    points: [
      [0, 0],
      [0, 44],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  // 2. Process Step 1
  elements.push({
    type: "rectangle",
    x: centerX - 10,
    y: originY + 110,
    width: 200,
    height: 60,
    strokeWidth: 2,
    label: {
      text: isAr ? "١. تهيئة وقراءة البيانات" : "1. Read Input Data",
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Arrow from Process 1 to Decision
  elements.push({
    type: "arrow",
    x: centerX + 90,
    y: originY + 170,
    points: [
      [0, 0],
      [0, 44],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  // 3. Decision Diamond
  elements.push({
    type: "diamond",
    x: centerX,
    y: originY + 214,
    width: 180,
    height: 90,
    strokeWidth: 2,
    label: {
      text: isAr ? "هل البيانات صحيحة؟" : "Valid?",
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Arrow "Yes" Downwards to Process 2
  elements.push({
    type: "arrow",
    x: centerX + 90,
    y: originY + 304,
    points: [
      [0, 0],
      [0, 50],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
    label: {
      text: isAr ? "نعم" : "Yes",
      fontSize: 12,
    },
  });

  // Arrow "No" to Side Error Handler
  const sideBranchX = isAr ? originX + 10 : originX + 390;
  elements.push({
    type: "arrow",
    x: isAr ? centerX : centerX + 180,
    y: originY + 259,
    points: [
      [0, 0],
      [isAr ? -70 : 70, 0],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
    label: {
      text: isAr ? "لا" : "No",
      fontSize: 12,
    },
  });

  // Error Process Box
  elements.push({
    type: "rectangle",
    x: sideBranchX,
    y: originY + 234,
    width: 130,
    height: 50,
    strokeWidth: 2,
    label: {
      text: isAr ? "تسجيل الخطأ" : "Log Error",
      fontSize: 13,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // 4. Process Step 2
  elements.push({
    type: "rectangle",
    x: centerX - 10,
    y: originY + 354,
    width: 200,
    height: 60,
    strokeWidth: 2,
    label: {
      text: isAr ? "٢. معالجة وتوليد النتيجة" : "2. Process & Generate Output",
      fontSize: 14,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  // Arrow from Process 2 to End
  elements.push({
    type: "arrow",
    x: centerX + 90,
    y: originY + 414,
    points: [
      [0, 0],
      [0, 44],
    ],
    endArrowhead: "arrow",
    strokeWidth: 2,
  });

  // 5. End Terminal (Pill)
  elements.push({
    type: "rectangle",
    x: centerX,
    y: originY + 458,
    width: 180,
    height: 50,
    strokeWidth: 2,
    roundness: { type: 3 },
    label: {
      text: isAr ? "النهاية (End / Success)" : "End / Success",
      fontSize: 15,
      textAlign: "center",
      verticalAlign: "middle",
    },
  });

  return elements;
}

/**
 * Exported list of all 8 templates with metadata and generator functions.
 */
export const STUDY_TEMPLATES: TemplateDefinition[] = [
  {
    id: "diagnosis-tree",
    titleKey: "templates.diagnosisTreeTitle",
    descKey: "templates.diagnosisTreeDesc",
    width: 640,
    height: 380,
    generate: generateDiagnosisTree,
  },
  {
    id: "xy-axes",
    titleKey: "templates.xyAxesTitle",
    descKey: "templates.xyAxesDesc",
    width: 500,
    height: 420,
    generate: generateXyAxes,
  },
  {
    id: "graph-paper",
    titleKey: "templates.graphPaperTitle",
    descKey: "templates.graphPaperDesc",
    width: 600,
    height: 400,
    generate: generateGraphPaper,
  },
  {
    id: "dotted-circuit-frame",
    titleKey: "templates.dottedCircuitFrameTitle",
    descKey: "templates.dottedCircuitFrameDesc",
    width: 640,
    height: 360,
    generate: generateDottedCircuitFrame,
  },
  {
    id: "cornell-notes",
    titleKey: "templates.cornellNotesTitle",
    descKey: "templates.cornellNotesDesc",
    width: 640,
    height: 640,
    generate: generateCornellNotes,
  },
  {
    id: "comparison-table",
    titleKey: "templates.comparisonTableTitle",
    descKey: "templates.comparisonTableDesc",
    width: 640,
    height: 280,
    generate: generateComparisonTable,
  },
  {
    id: "mind-map",
    titleKey: "templates.mindMapTitle",
    descKey: "templates.mindMapDesc",
    width: 700,
    height: 460,
    generate: generateMindMap,
  },
  {
    id: "flowchart",
    titleKey: "templates.flowchartTitle",
    descKey: "templates.flowchartDesc",
    width: 540,
    height: 530,
    generate: generateFlowchart,
  },
];
