import type { ReactNode } from "react";

export default function HeroHeading({ children }: { children: ReactNode }) {
	return (
		<h1 className="font-display text-[48px] lg:text-[72px] font-extrabold text-fg uppercase tracking-tighter leading-none">
			{children}
		</h1>
	);
}

export function HeroAccent({ children }: { children: ReactNode }) {
	return <span className="text-accent">{children}</span>;
}
