"use client";

import {
	DifferenceMode,
	OnionSkinMode,
	SwipeMode,
	TwoUpMode,
} from "@blazediff/react";
import { useEffect, useState } from "react";
import { A, B, DIFFERENCE, FRAME, ONION_SKIN, SWIPE, TWO_UP } from "./shared";

/** The modes touch browser APIs while rendering, so keep them client-only. */
function useMounted() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted;
}

function Frame({ children }: { children: React.ReactNode }) {
	return <div className={FRAME}>{children}</div>;
}

export function ReactSwipeDemo() {
	const mounted = useMounted();
	return <Frame>{mounted && <SwipeMode src1={A} src2={B} {...SWIPE} />}</Frame>;
}

export function ReactDifferenceDemo() {
	const mounted = useMounted();
	return (
		<Frame>
			{mounted && <DifferenceMode src1={A} src2={B} {...DIFFERENCE} />}
		</Frame>
	);
}

export function ReactTwoUpDemo() {
	const mounted = useMounted();
	return (
		<Frame>{mounted && <TwoUpMode src1={A} src2={B} {...TWO_UP} />}</Frame>
	);
}

export function ReactOnionSkinDemo() {
	const mounted = useMounted();
	return (
		<Frame>
			{mounted && <OnionSkinMode src1={A} src2={B} {...ONION_SKIN} />}
		</Frame>
	);
}
