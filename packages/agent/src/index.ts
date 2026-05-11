export { captureScreenshot } from "./browser/capture";
export type { BrowsersInstallOptions, BrowsersInstallResult } from "./browsers";
export { installBrowsers } from "./browsers";
export type {
	CaptureRouteInput,
	CaptureRouteResult,
	RunCapturesOptions,
	RunCapturesReport,
} from "./captures";
export { runCaptures } from "./captures";
export { runCheck } from "./check";
export { configHash, loadConfig, resolveBaseUrl, saveConfig } from "./config";
export type { DiffOptions, DiffOutcome } from "./diff";
export { diffEntry } from "./diff";
export type { Verdict, VerdictAction, VerdictLabel } from "./diff/verdict";
export { discover } from "./discover";
export { loadManifest, saveManifest } from "./manifest";
export { paths } from "./paths";
export * from "./types";
