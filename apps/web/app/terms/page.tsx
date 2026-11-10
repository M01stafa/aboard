import Link from "next/link";
import { getTranslation } from "@/i18n/i18n";

export const metadata = {
  title: "Terms of Service — Aboard",
  description: "Terms of service for Aboard, covering user content ownership, educational disclaimers, and service usage.",
};

export default function TermsPage() {
  const titleEn = getTranslation("en", "legal.termsTitle");
  const backEn = getTranslation("en", "legal.backToLauncher");

  const titleAr = getTranslation("ar", "legal.termsTitle");
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
          }}
        >
          {backEn} · {backAr}
        </Link>
      </header>

      <article
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {/* English Section */}
        <section lang="en" dir="ltr" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: "var(--weight-bold)" }}>
              English Version
            </span>
            <h2
              style={{
                marginBlockStart: "var(--space-1)",
                marginBlockEnd: "var(--space-2)",
                fontSize: "1.375rem",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-main)",
              }}
            >
              Terms of Service
            </h2>
            <p style={{ margin: "0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Last updated: November 10, 2026
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              1. Acceptance of Terms
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              By accessing or using Aboard (&quot;Alpha board&quot;), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you should not access or use the application.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              2. Nature of the Service
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              Aboard provides an integrated digital workspace combining whiteboard tools (Excalidraw), a PDF reader and annotation engine (EmbedPDF / @cantoo/pdf-lib), and electronic circuit simulation (CircuitJS1). The software is designed to facilitate student learning, research collaboration, and personal study.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              3. User Ownership & Intellectual Property
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              You retain 100% intellectual property ownership of all content you create, import, or annotate within Aboard, including drawings, circuit schematics, study notes, and uploaded PDF files. Aboard claims no ownership, copyright, or licensing rights over your user content.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              4. Storage, Google Drive & Local Backups
            </h3>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>Google Drive Mode:</strong> When connecting Google Drive, you authorize Aboard to create and manage files in your Drive under the restricted <code>drive.file</code> scope. You are responsible for ensuring sufficient storage quota in your Google account.
              </li>
              <li>
                <strong>Local Storage Mode:</strong> When using local storage, projects are stored in your device&apos;s browser database (IndexedDB). Clearing browser history, private browsing, or browser eviction policies can erase locally stored projects. Users are encouraged to export <code>.alpha</code> container backups regularly.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              5. Educational Disclaimers & Professional Advice
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              Aboard is intended strictly as an educational and academic study aid:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>Circuit Simulator:</strong> Simulated component models and electrical calculations are approximations provided for educational demonstration and should not be used as the sole engineering basis for physical, safety-critical, or high-voltage circuits.
              </li>
              <li>
                <strong>Medical Study Aids:</strong> Annotations and study diagrams are study aids and must never be relied upon for clinical medical diagnosis, treatment, or patient care.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              6. Termination & Account Deletion
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              You may stop using Aboard at any time and may permanently delete your account through Settings. We reserve the right to suspend or terminate accounts that violate system security or abuse the service.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              7. Disclaimer of Warranties & Limitation of Liability
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              Aboard is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether express or implied. In no event shall the authors or copyright holders be liable for any claim, damages, or data loss arising from the use of the service.
            </p>
          </div>
        </section>

        <hr
          style={{
            margin: "0",
            border: "0",
            borderBlockStart: "1px solid var(--border-card)",
          }}
        />

        {/* Arabic Section */}
        <section lang="ar" dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", fontWeight: "var(--weight-bold)" }}>
              النسخة العربية
            </span>
            <h2
              style={{
                marginBlockStart: "var(--space-1)",
                marginBlockEnd: "var(--space-2)",
                fontSize: "1.375rem",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-main)",
              }}
            >
              شروط الخدمة
            </h2>
            <p style={{ margin: "0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              آخر تحديث: 10 نوفمبر 2026
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              1. الموافقة على الشروط
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              باستخدامك لمنصة Aboard (&quot;أبورد&quot;)، فإنك توافق على الالتزام بشروط الخدمة هذه. إذا كنت لا توافق على أي جزء منها، فيُرجى عدم استخدام المنصة.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              2. طبيعة الخدمة
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              توفر Aboard مساحة عمل دراسية موحدة تدمج أدوات السبورة التفاعلية (Excalidraw)، قراءة وملاحظات مستندات PDF (عبر EmbedPDF و Cantoo PDF-lib)، ومحاكاة الدوائر الإلكترونية (CircuitJS1). المنصة مخصصة لتسهيل دراسة وبحوث الطلاب والمهندسين.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              3. ملكية المحتوى وحقوق الملكية الفكرية
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              يحتفظ المستخدم بكامل حقوق الملكية الفكرية بنسبة 100% لجميع المواد والملاحظات والرسومات والدوائر ومستندات الـ PDF التي ينشئها أو يستوردها إلى التطبيق. لا تدّعي Aboard أي ملكية أو حقوق على محتواك.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              4. التخزين، Google Drive، والنسخ الاحتياطي المحلي
            </h3>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>وضع Google Drive:</strong> عند ربط درايف، تمنح المنصة تفويضاً محدوداً بنطاق <code>drive.file</code> لإنشاء وإدارة ملفات التطبيق فقط. تقع مسؤولية توفير المساحة الكافية في حساب Google على عاتقك.
              </li>
              <li>
                <strong>وضع التخزين المحلي:</strong> تُحفظ المشاريع المحلية في ذاكرة المتصفح على جهازك (IndexedDB). قد يؤدي مسح بيانات التصفح أو التصفح الخفي إلى فقدان البيانات المحلية ما لم يتم حفظها في Drive أو تصديرها كملفات <code>.alpha</code>.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              5. إخلاء مسؤولية تعليمي واستشارات تخصصية
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              منصة Aboard مصممة حصراً كأداة دراسية وتعليمية:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>محاكي الدوائر:</strong> نتائج محاكاة الدوائر الإلكترونية هي حسابات تقريبية للأغراض الأكاديمية ويجب عدم الاعتماد عليها منفردة في تصميم أنظمة إلكترونية حقيقية أو عالية الخطورة.
              </li>
              <li>
                <strong>الملاحظات الطبية:</strong> المخططات والشروحات الدراسية هي وسائل استذكار طلابية ولا تُعد استشارات طبية ولا يجوز الاعتماد عليها في تشخيص أو علاج المرضى.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              6. إنهاء الخدمة وحذف الحساب
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              يمكنك التوقف عن استخدام المنصة وحذف حسابك نهائياً في أي وقت عبر قائمة الإعدادات.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              7. إخلاء المسؤولية عن الضمانات وحدود المسؤولية
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              تُقدّم الخدمة &quot;كما هي&quot; و&quot;حسب توافرها&quot; دون أي ضمانات صريحة أو ضمنية. ولا يتحمل مطورو المنصة أي مسؤولية عن أي أضرار أو فقدان للبيانات ناتج عن استخدام الخدمة.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
