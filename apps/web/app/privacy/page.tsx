import Link from "next/link";
import { getTranslation } from "@/i18n/i18n";

export const metadata = {
  title: "Privacy Policy — Aboard",
  description: "Privacy policy for Aboard, explaining our zero-user-content storage model, Google Drive integration, and Limited Use compliance.",
};

export default function PrivacyPage() {
  const titleEn = getTranslation("en", "legal.privacyTitle");
  const backEn = getTranslation("en", "legal.backToLauncher");

  const titleAr = getTranslation("ar", "legal.privacyTitle");
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
              Privacy Policy
            </h2>
            <p style={{ margin: "0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Last updated: November 10, 2026
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              1. Overview & Core Privacy Principle
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              Aboard (&quot;Alpha board&quot;) is an educational workspace designed for students and researchers, unifying a collaborative whiteboard, PDF reader and annotator, and interactive circuit simulator. We operate on a fundamental privacy principle: <strong>your academic work and user content belong exclusively to you</strong>.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              2. Where Your Files and Content Live
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              Aboard utilizes a <strong>Zero-User-Content Server Architecture</strong>:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>User Content:</strong> All of your PDF documents, handwriting, drawings, annotations, circuit schematics, and exported files are stored exclusively in your own Google Drive account (inside the dedicated <code>Aboard/</code> folder) or locally in your browser storage (IndexedDB).
              </li>
              <li>
                <strong>No Content on Our Servers:</strong> Our backend servers and databases <em>never</em> receive, process, store, or transmit your document contents, whiteboard drawings, or simulation files.
              </li>
              <li>
                <strong>What Our Server Stores:</strong> Our Supabase database stores only:
                <ul style={{ marginBlockStart: "var(--space-1)", paddingInlineStart: "var(--space-4)" }}>
                  <li>Your user account identifier and profile record.</li>
                  <li>A minimal project index (project UUID, user-defined title, subject tag, creation date, and storage mode flag: Drive vs. Local).</li>
                  <li>An encrypted Google OAuth refresh token (AES-256-GCM) used strictly to refresh browser-side Drive sessions.</li>
                </ul>
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              3. Google API Data & Limited Use Disclosure
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              Aboard&apos;s use and transfer of information received from Google APIs adheres to the <strong>Google API Services User Data Policy</strong>, including the Limited Use requirements:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>Least Privilege Scope:</strong> We request only <code>https://www.googleapis.com/auth/drive.file</code>. Aboard can only view or manage files that were created by Aboard or specifically opened by you via the Google Picker. We cannot see or access any other files in your Google Drive.
              </li>
              <li>
                <strong>No Data Selling or Advertising:</strong> We never sell Google user data to third parties, and we never use Google user data for advertising or marketing.
              </li>
              <li>
                <strong>No AI/ML Training:</strong> Google user data and your documents are never used to train generalized artificial intelligence or machine learning models.
              </li>
              <li>
                <strong>No Human Access:</strong> No human beings at Aboard have access to read your Google Drive files or personal data.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              4. Data Retention, Disconnection & Account Deletion
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              You have complete control over your data at all times:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>Disconnect Google Drive:</strong> You can disconnect Google Drive in Settings at any time. Disconnecting immediately revokes our authorization with Google and deletes the encrypted refresh token from our database. Your project files in Google Drive remain untouched.
              </li>
              <li>
                <strong>Local Storage Deletion:</strong> You can clear browser storage or delete individual local projects at any time through the workspace launcher.
              </li>
              <li>
                <strong>Account Deletion:</strong> You can permanently delete your account in Settings. Deleting your account immediately purges your account record, profile, project index, and OAuth links from our database. Because your actual files live in your own Google Drive or local device, they are not deleted and remain in your possession.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              5. Security Measures
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              All client-server communications use HTTPS with TLS 1.3. Stored OAuth tokens are encrypted at rest with AES-256-GCM. Row Level Security (RLS) is strictly enforced on every database table so no user can access or discover another user&apos;s project index metadata.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              6. Contact
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              If you have any questions about this Privacy Policy or your data, please contact the Aboard team via the project repository or our support contact.
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
              سياسة الخصوصية
            </h2>
            <p style={{ margin: "0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              آخر تحديث: 10 نوفمبر 2026
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              1. نظرة عامة ومبدأ الخصوصية الأساسي
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              منصة &quot;أبورد&quot; (Aboard) هي مساحة عمل تعليمية موحدة مصممة لطلاب الهندسة والطب، تجمع بين السبورة التفاعلية، قارئ ومحرر ملفات PDF، ومحاكي الدوائر الإلكترونية. تعمل المنصة وفق مبدأ أساسي صارم: <strong>ملاحظاتك ومشاريعك الأكاديمية هي ملكك الحصري وحدك</strong>.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              2. أين يُحفظ محتواك وملفاتك
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              تعتمد Aboard على <strong>بنية تقنية خالية تماماً من حفظ محتوى المستخدم على خوادمنا</strong>:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>محتوى المستخدم:</strong> جميع مستندات الـ PDF، الملاحظات اليدوية، رسومات السبورة، مخططات الدوائر والملفات المصدرة تُحفظ حصرياً في حساب Google Drive الخاص بك (داخل مجلد <code>Aboard/</code>) أو محلياً في ذاكرة متصفحك (IndexedDB).
              </li>
              <li>
                <strong>انعدام التخزين على الخوادم:</strong> خوادمنا وقواعد بياناتنا <em>لا تستقبل ولا تخزن ولا تعالج إطلاقاً</em> محتويات وثائقك أو رسوماتك أو ملفات المحاكاة.
              </li>
              <li>
                <strong>ما تحفظه خوادمنا:</strong> تحتفظ قاعدة بياناتنا فقط بالحد الأدنى اللازم لتشغيل الحساب:
                <ul style={{ marginBlockStart: "var(--space-1)", paddingInlineStart: "var(--space-4)" }}>
                  <li>معرّف حساب المستخدم وبيانات الملف التعريفي الأساسية.</li>
                  <li>فهرس مصغر لعناوين المشاريع (معرّف المشروع UUID، العنوان الذي اخترته، المادة، تاريخ الإنشاء، ونوع التخزين: درايف أو محلي).</li>
                  <li>رمز مصادقة Google مشفر (AES-256-GCM) يُستخدم فقط لتجديد جلسة الاتصال المباشر بين متصفحك وGoogle Drive.</li>
                </ul>
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              3. الامتثال لسياسة بيانات المستخدمين لخدمات Google والحد من الاستخدام
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              يخضع استخدام Aboard للمعلومات الواردة من واجهات برمجة تطبيقات Google لـ <strong>سياسة بيانات مستخدمي خدمات Google (Google API Services User Data Policy)</strong>، بما في ذلك متطلبات الاستخدام المحدود (Limited Use):
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>أدنى صلاحية مطلوبة:</strong> نطلب فقط صلاحية <code>https://www.googleapis.com/auth/drive.file</code>، مما يعني أن التطبيق يستطيع فقط الوصول إلى الملفات التي أنشأتها عبر التطبيق أو اخترت فتحها يدوياً. لا نملك أي وصول لبقية ملفاتك في درايف.
              </li>
              <li>
                <strong>منع بيع البيانات أو الإعلانات:</strong> لا نقوم ببيع بيانات مستخدمي Google لأي طرف ثالث، ولا نستخدمها إطلاقاً في الإعلانات أو التسويق.
              </li>
              <li>
                <strong>منع تدريب الذكاء الاصطناعي:</strong> لا تُستخدم ملفاتك أو بياناتك في تدريب نماذج الذكاء الاصطناعي العامة أو تعلم الآلة.
              </li>
              <li>
                <strong>حظر الوصول البشري:</strong> لا يطّلع أي موظف أو شخص على ملفاتك أو مستنداتك في Google Drive.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              4. الاحتفاظ بالبيانات، فك الارتباط، وحذف الحساب
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              أنت صاحب السيادة الكاملة على بياناتك في كل وقت:
            </p>
            <ul style={{ marginBlockStart: "var(--space-2)", paddingInlineStart: "var(--space-4)", lineHeight: "1.6rem" }}>
              <li>
                <strong>فصل Google Drive:</strong> يمكنك إلغاء ربط حساب درايف في أي وقت من الإعدادات. يؤدي ذلك إلى إلغاء التفويض فوراً وحذف الرمز المشفر من خوادمنا دون المساس بملفاتك المحفوظة في درايف.
              </li>
              <li>
                <strong>حذف التخزين المحلي:</strong> يمكنك حذف المشاريع المحلية عبر لوحة التشغيل أو مسح بيانات المتصفح في أي وقت.
              </li>
              <li>
                <strong>حذف الحساب:</strong> يمكنك طلب حذف حسابك نهائياً من الإعدادات. يؤدي الحذف إلى مسح ملفك الشخصي وفهرس مشاريعك ورموز التخزين فوراً وبشكل دائم من خوادمنا. نظراً لأن ملفاتك مخزنة في درايف الخاص بك أو على جهازك، فإنها تظل بحوزتك ولا تُحذف.
              </li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              5. تدابير الأمان والتشفير
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              تتم جميع الاتصالات عبر قنوات مشفرة HTTPS بمعيار TLS 1.3. يتم تشفير رموز الوصول المخزنة باستخدام AES-256-GCM، وتُطبق سياسات أمان مشددة على مستوى الصفوف (Row Level Security) لمنع أي مستخدم من الوصول إلى بيانات مستخدم آخر.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: "var(--weight-semibold)", marginBlockEnd: "var(--space-1)" }}>
              6. للتواصل
            </h3>
            <p style={{ margin: "0", lineHeight: "1.6rem", color: "var(--text-main)" }}>
              إذا كانت لديك أي استفسارات تتعلق بسياسة الخصوصية أو بياناتك، يُرجى التواصل مع فريق Aboard عبر مستودع المشروع أو قنوات الدعم الرسمية.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
