import type { RunEvent } from ".";

/**
 * Out-of-band progress sink. LangGraph's `updates` stream only surfaces a node's
 * output once it *finishes*, so a slow node (the local/host judge can take many
 * seconds per test) shows nothing until it completes. Nodes push a "started"
 * signal through this sink so the CLI can report work in flight, not just
 * results. `runGraph` points the sink at its `onEvent` for the duration of a run.
 */
let sink: ((event: RunEvent) => void) | undefined;

export function setEventSink(
	fn: ((event: RunEvent) => void) | undefined,
): void {
	sink = fn;
}

export function emitEvent(event: RunEvent): void {
	sink?.(event);
}
