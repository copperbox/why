// Types for the story-panel renderer, so the DOM smoke test type-checks
// without enabling allowJs for the whole UI. The story parameter is the
// payload of schemas/story.schema.json (`why blame --json`).

import type { BlameReport } from "../src/blame.ts";

export function glyphFor(type: string, status: string | undefined): "●" | "⚠" | "?";
export function formatTarget(target: BlameReport["target"]): string;
export function renderStoryPanel(doc: Document, story: BlameReport): HTMLElement;
