"use client";

import {
	mountDifference,
	mountOnionSkin,
	mountSwipe,
	mountTwoUp,
} from "@blazediff/ui";
import { useEffect, useRef } from "react";
import { A, B, DIFFERENCE, FRAME, ONION_SKIN, SWIPE, TWO_UP } from "./shared";

function Frame({ children }: { children: React.ReactNode }) {
	return <div className={FRAME}>{children}</div>;
}

/** Mounts a renderer into a ref'd element on the client and tears it down on unmount. */
function useRenderer(mount: (el: HTMLElement) => { destroy(): void }) {
	const ref = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount once per lifecycle
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const handle = mount(el);
		return () => handle.destroy();
	}, []);
	return ref;
}

// `display: contents` makes the mount point transparent so the renderer's own
// root element is the flex item — matching the React components' structure exactly.
function MountPoint({ refEl }: { refEl: React.Ref<HTMLDivElement> }) {
	return <div className="contents" ref={refEl} />;
}

export function VanillaSwipeDemo() {
	const ref = useRenderer((el) =>
		mountSwipe(el, { src1: A, src2: B, ...SWIPE }),
	);
	return (
		<Frame>
			<MountPoint refEl={ref} />
		</Frame>
	);
}

export function VanillaDifferenceDemo() {
	const ref = useRenderer((el) =>
		mountDifference(el, { src1: A, src2: B, ...DIFFERENCE }),
	);
	return (
		<Frame>
			<MountPoint refEl={ref} />
		</Frame>
	);
}

export function VanillaTwoUpDemo() {
	const ref = useRenderer((el) =>
		mountTwoUp(el, { src1: A, src2: B, ...TWO_UP }),
	);
	return (
		<Frame>
			<MountPoint refEl={ref} />
		</Frame>
	);
}

export function VanillaOnionSkinDemo() {
	const ref = useRenderer((el) =>
		mountOnionSkin(el, { src1: A, src2: B, ...ONION_SKIN }),
	);
	return (
		<Frame>
			<MountPoint refEl={ref} />
		</Frame>
	);
}
