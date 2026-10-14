"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "../auth-guard";
import { WorkspaceHost } from "@/workspace/workspace-host";
import type { ModuleKind } from "@/workspace/types";

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("p");
  const kindParam = searchParams.get("kind") as ModuleKind | null;

  return <WorkspaceHost projectId={projectId} initialKind={kindParam} />;
}

export default function WorkspacePage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div
            style={{
              padding: "var(--space-6)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "var(--font-sans)",
            }}
          >
            ...
          </div>
        }
      >
        <WorkspaceContent />
      </Suspense>
    </AuthGuard>
  );
}
