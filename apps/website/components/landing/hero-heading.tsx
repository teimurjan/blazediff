import type { ReactNode } from "react";

export default function HeroHeading({ children }: { children: ReactNode }) {
	return (
		<h1 className="font-display text-[clamp(2.5rem,12vw,4.5rem)] lg:text-[clamp(3.5rem,6vw,4.5rem)] font-bold text-fg uppercase tracking-tighter leading-none">
			{children}
		</h1>
	);
}

export function HeroAccent({ children }: { children: ReactNode }) {
	return <span className="text-accent">{children}</span>;
}
