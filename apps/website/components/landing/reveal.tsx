"use client";

import type { ReactNode } from "react";
import { useInView } from "../../hooks/use-in-view";

interface RevealProps {
	children: ReactNode;
	className?: string;
	delayMs?: number;
	threshold?: number;
}

export default function Reveal({
	children,
	className = "",
	delayMs = 0,
	threshold = 0.2,
}: RevealProps) {
	const [ref, isInView] = useInView(threshold);

	return (
		<div
			ref={ref}
			style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
			className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
				isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
			} ${className}`}
		>
			{children}
		</div>
	);
}
