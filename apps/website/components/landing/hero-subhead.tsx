import type { ReactNode } from "react";

interface HeroSubheadProps {
	children: ReactNode;
}

export default function HeroSubhead({ children }: HeroSubheadProps) {
	return (
		<p className="font-mono text-[14px] text-muted max-w-lg uppercase">
			{children}
		</p>
	);
}
