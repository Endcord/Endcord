/*
 * Endcord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { brushCanvas, ctx, render } from "@plugins/remix/editor/components/Canvas";
import { currentSize, ToolDefinition } from "@plugins/remix/editor/components/Toolbar";
import { Mouse } from "@plugins/remix/editor/input";
import { line } from "@plugins/remix/editor/utils/canvas";

export const BrushTool: ToolDefinition = {
    onMouseMove() {
        if (!Mouse.down || !ctx) return;

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        brushCanvas.lineWidth = currentSize;

        line(Mouse.prevX, Mouse.prevY, Mouse.x, Mouse.y);

        render();
    },
    selected() {
        Mouse.event.on("move", this.onMouseMove);
    },
    unselected() {
        Mouse.event.off("move", this.onMouseMove);
    },
};
