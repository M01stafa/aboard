import type { ReactNode } from "react";

export interface CardProps {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  iconBorder: string;
  title: string;
  description: string;
  action: ReactNode;
  testId?: string;
}

export function Card({
  icon,
  iconBg,
  iconColor,
  iconBorder,
  title,
  description,
  action,
  testId,
}: CardProps) {
  return (
    <article className="launcher-card" data-testid={testId}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            inlineSize: "var(--control-md)",
            blockSize: "var(--control-md)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: iconBg,
            color: iconColor,
            border: `1px solid ${iconBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {icon}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.25rem",
              lineHeight: "1.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              lineHeight: "1.5rem",
              color: "var(--text-muted)",
            }}
          >
            {description}
          </p>
        </div>
      </div>

      <div style={{ marginBlockStart: "var(--space-4)" }}>{action}</div>
    </article>
  );
}
