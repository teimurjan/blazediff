import type { ReactNode } from "react";

interface HeroSubheadProps {
	children: ReactNode;
}

export default function HeroSubhead({ children }: HeroSubheadProps) {
	return (
		<p className="font-sans text-[15px] md:text-[16px] text-muted max-w-lg leading-relaxed">
			{children}
		</p>
	);
}
