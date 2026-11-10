import Link from "next/link";
import { getTranslation } from "@/i18n/i18n";

export const metadata = {
  title: "Open Source Licenses — Aboard",
  description: "Open-source software licenses and third-party notices used in Aboard.",
};

interface ThirdPartyNotice {
  name: string;
  license: string;
  copyright: string;
  url?: string;
  notesEn?: string;
  notesAr?: string;
}

const NOTICES: ThirdPartyNotice[] = [
  {
    name: "CircuitJS1 (Aboard Fork)",
    license: "GNU General Public License v2.0 or later (GPL-2.0-or-later)",
    copyright: "Original simulator by Paul Falstad, modified for Aboard",
    url: "https://github.com/M01stafa/circuitjs1",
    notesEn:
      "Aboard uses a modified fork of CircuitJS1 running in a sandboxed client iframe. In accordance with the GNU General Public License v2.0, the complete source code and modifications for this fork are publicly available at github.com/M01stafa/circuitjs1 (upstream: github.com/pfalstad/circuitjs1).",
    notesAr:
      "تستخدم منصة Aboard نسخة معدلة مفتوحة المصدر من محاكي الدوائر CircuitJS1 تعمل داخل إطار منعزل في المتصفح. امتثالاً لشروط رخصة جنو العمومية (GPLv2)، فإن الكود المصدري الكامل والتعديلات متاحة للعموم على github.com/M01stafa/circuitjs1 (المصدر الأصلي: github.com/pfalstad/circuitjs1).",
  },
  {
    name: "Excalidraw",
    license: "MIT License",
    copyright: "Copyright (c) Excalidraw contributors",
    url: "https://github.com/excalidraw/excalidraw",
    notesEn: "Virtual whiteboard library for sketching hand-drawn like diagrams.",
    notesAr: "مكتبة اللوحة البيضاء الافتراضية للرسومات التوضيحية الأكاديمية.",
  },
  {
    name: "EmbedPDF (PDFium WASM)",
    license: "MIT License / Apache License 2.0 (Google PDFium)",
    copyright: "Copyright (c) EmbedPDF contributors / The PDFium Authors",
    url: "https://github.com/embedpdf/embedpdf",
    notesEn: "High-performance client-side WebAssembly PDF rendering engine.",
    notesAr: "محرك عرض وتصيير ملفات PDF عالي الأداء بتقنية WebAssembly في المتصفح.",
  },
  {
    name: "@cantoo/pdf-lib",
    license: "MIT License",
    copyright: "Copyright (c) 2019 Andrew Dillon, 2023 Cantoo",
    url: "https://github.com/CantooScribe/pdf-lib",
    notesEn: "Client-side PDF document manipulation, merging, page operations, and ink flattening.",
    notesAr: "معالجة ملفات PDF وإدارة الصفحات ودمج الرسومات والملاحظات في المتصفح.",
  },
  {
    name: "Dexie.js",
    license: "Apache License 2.0",
    copyright: "Copyright (c) 2014-2024 David Fahlander",
    url: "https://github.com/dexie/Dexie.js",
    notesEn: "Minimalistic wrapper for IndexedDB local offline storage.",
    notesAr: "مكتبة إدارة قواعد البيانات المحلية IndexedDB للتخزين السريع دون اتصال.",
  },
  {
    name: "@zip.js/zip.js",
    license: "BSD-3-Clause License",
    copyright: "Copyright (c) 2024 Gildas Lormeau",
    url: "https://github.com/gildas-lormeau/zip.js",
    notesEn: "Pure JavaScript zip/unzip engine used for .alpha project bundle export and import.",
    notesAr: "محرك ضغط واستخراج ملفات zip لمعالجة واستيراد/تصدير حزم مشاريع .alpha.",
  },
  {
    name: "hash-wasm",
    license: "MIT License",
    copyright: "Copyright (c) 2020 Dani Biró",
    url: "https://github.com/Daninet/hash-wasm",
    notesEn: "Cryptographic hash functions in WebAssembly for project integrity checks.",
    notesAr: "دوال التشفير والتحقق من سلامة وتكامل ملفات المشاريع عبر WebAssembly.",
  },
  {
    name: "Supabase Client (@supabase/supabase-js, @supabase/ssr)",
    license: "MIT License",
    copyright: "Copyright (c) 2020 Supabase Inc.",
    url: "https://github.com/supabase/supabase-js",
    notesEn: "Authentication and client integration for account management.",
    notesAr: "إدارة المصادقة الآمنة وحسابات المستخدمين.",
  },
  {
    name: "Next.js & React",
    license: "MIT License",
    copyright: "Copyright (c) Vercel, Inc. / Meta Platforms, Inc.",
    url: "https://nextjs.org",
    notesEn: "React web framework powering Aboard's application shell.",
    notesAr: "إطار عمل الويب الأساسي لواجهة وتطبيق Aboard.",
  },
  {
    name: "Zustand",
    license: "MIT License",
    copyright: "Copyright (c) 2019 Paul Henschel",
    url: "https://github.com/pmndrs/zustand",
    notesEn: "Lightweight state management for the unified workspace.",
    notesAr: "إدارة حالة الواجهة المشتركة ومساحة العمل.",
  },
  {
    name: "Mitt",
    license: "MIT License",
    copyright: "Copyright (c) 2021 Jason Miller",
    url: "https://github.com/developit/mitt",
    notesEn: "Event emitter for decoupled cross-tool integration events.",
    notesAr: "ناقل الأحداث السريع للتواصل بين الأدوات المختلفة.",
  },
  {
    name: "Lucide React",
    license: "ISC License",
    copyright: "Copyright (c) 2022 Lucide Contributors",
    url: "https://lucide.dev",
    notesEn: "Interface iconography.",
    notesAr: "أيقونات واجهة المستخدم.",
  },
];

export default function LicensesPage() {
  const titleEn = getTranslation("en", "legal.licensesTitle");
  const backEn = getTranslation("en", "legal.backToLauncher");

  const titleAr = getTranslation("ar", "legal.licensesTitle");
  const backAr = getTranslation("ar", "legal.backToLauncher");

  return (
    <main
      style={{
        padding: "var(--space-6)",
        maxInlineSize: "78ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlockEnd: "var(--space-4)",
          borderBlockEnd: "1px solid var(--border-card)",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            margin: "0",
            fontSize: "1.75rem",
            fontWeight: "var(--weight-bold)",
            color: "var(--text-main)",
          }}
        >
          {titleEn} / {titleAr}
        </h1>

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            blockSize: "var(--control-md)",
            paddingInline: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: "var(--weight-medium)",
            whiteSpace: "nowrap",
          }}
        >
          {backEn} · {backAr}
        </Link>
      </header>

      {/* English Section */}
      <article
        lang="en"
        dir="ltr"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <section>
          <h2
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-2)",
              fontSize: "1.25rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            Open Source Notices &amp; Acknowledgements
          </h2>
          <p
            style={{
              margin: "0",
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: "1.5rem",
            }}
          >
            Aboard is built upon outstanding open-source libraries and projects. We gratefully
            acknowledge the creators and maintainers whose work makes this platform possible.
          </p>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {NOTICES.map((item) => (
            <div
              key={`en-${item.name}`}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3)",
                backgroundColor: "var(--bg-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  marginBlockEnd: "var(--space-1)",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1rem",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--text-main)",
                  }}
                >
                  {item.name}
                </h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    paddingInline: "var(--space-2)",
                    paddingBlock: "var(--space-1)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-card)",
                    color: "var(--text-muted)",
                    fontWeight: "var(--weight-medium)",
                  }}
                >
                  {item.license}
                </span>
              </div>
              <p
                style={{
                  margin: "0 0 var(--space-1) 0",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                }}
              >
                {item.copyright}
              </p>
              {item.notesEn && (
                <p
                  style={{
                    margin: "0 0 var(--space-2) 0",
                    fontSize: "0.875rem",
                    lineHeight: "1.4",
                    color: "var(--text-main)",
                  }}
                >
                  {item.notesEn}
                </p>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-primary-text, #1656b6)",
                    textDecoration: "underline",
                    wordBreak: "break-all",
                  }}
                >
                  {item.url}
                </a>
              )}
            </div>
          ))}
        </section>
      </article>

      {/* Arabic Section */}
      <article
        lang="ar"
        dir="rtl"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <section>
          <h2
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-2)",
              fontSize: "1.25rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            إشعارات البرمجيات مفتوحة المصدر
          </h2>
          <p
            style={{
              margin: "0",
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: "1.5rem",
            }}
          >
            تم بناء منصة Aboard بالاعتماد على مشاريع ومكتبات برمجية مفتوحة المصدر عالية الكفاءة.
            نعرب عن خالص تقديرنا للمطورين والمجتمعات التي ساهمت في تطوير هذه الأدوات.
          </p>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {NOTICES.map((item) => (
            <div
              key={`ar-${item.name}`}
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3)",
                backgroundColor: "var(--bg-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  marginBlockEnd: "var(--space-1)",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1rem",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--text-main)",
                  }}
                >
                  {item.name}
                </h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    paddingInline: "var(--space-2)",
                    paddingBlock: "var(--space-1)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-card)",
                    color: "var(--text-muted)",
                    fontWeight: "var(--weight-medium)",
                  }}
                >
                  {item.license}
                </span>
              </div>
              <p
                style={{
                  margin: "0 0 var(--space-1) 0",
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                }}
              >
                {item.copyright}
              </p>
              {item.notesAr && (
                <p
                  style={{
                    margin: "0 0 var(--space-2) 0",
                    fontSize: "0.875rem",
                    lineHeight: "1.4",
                    color: "var(--text-main)",
                  }}
                >
                  {item.notesAr}
                </p>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--color-primary-text, #1656b6)",
                    textDecoration: "underline",
                    direction: "ltr",
                    display: "inline-block",
                  }}
                >
                  {item.url}
                </a>
              )}
            </div>
          ))}
        </section>
      </article>
    </main>
  );
}
