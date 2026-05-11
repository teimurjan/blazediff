import type { Viewport, WaitFor } from "./types";

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
export const DEFAULT_WAIT_FOR: WaitFor[] = ["networkidle", "fonts"];
export const DEFAULT_FULL_PAGE = true;
export const DEFAULT_THRESHOLD = 0.1;
export const DEFAULT_PORT = 3000;
export const DEFAULT_READY_TIMEOUT_MS = 60_000;
