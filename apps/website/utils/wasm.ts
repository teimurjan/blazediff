// The published wasm modules, pinned to the versions this checkout ships (see
// the note in next.config.mjs for why they come off a CDN rather than the
// bundle). jsDelivr serves them as `application/wasm` with `access-control-
// allow-origin: *`, which is what lets a worker stream them cross-origin.

const jsdelivr = (pkg: string, version: string | undefined, file: string) =>
	`https://cdn.jsdelivr.net/npm/@blazediff/${pkg}@${version}/wasm/${file}`;

export const INTERPRET_WASM_URL = jsdelivr(
	"interpret-wasm",
	process.env.NEXT_PUBLIC_INTERPRET_WASM_VERSION,
	"blazediff_interpret_bg.wasm",
);

export const CORE_WASM_URL = jsdelivr(
	"core-wasm",
	process.env.NEXT_PUBLIC_CORE_WASM_VERSION,
	"blazediff_bg.wasm",
);

export const MILO_WASM_URL = jsdelivr(
	"milo-wasm",
	process.env.NEXT_PUBLIC_MILO_WASM_VERSION,
	"blazediff_milo_bg.wasm",
);
