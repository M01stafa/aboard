"use client";

import React from "react";
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

/**
 * ExcalidrawBoard wrapper that strips all third-party external links
 * (Help documentation, GitHub, Discord, Twitter) and Excalidraw branding
 * so that Aboard feels like a native first-party workspace.
 */
export function ExcalidrawBoard(props: ExcalidrawProps) {
  return (
    <Excalidraw {...props}>
      <MainMenu>
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <WelcomeScreen>
        <span style={{ display: "none" }} />
      </WelcomeScreen>
    </Excalidraw>
  );
}

export default ExcalidrawBoard;
