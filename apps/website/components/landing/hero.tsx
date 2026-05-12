import type { ReactNode } from "react";

interface HeroProps {
	left: ReactNode;
	right: ReactNode;
}

export default function Hero({ left, right }: HeroProps) {
	return (
		<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 lg:py-32 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center lg:min-h-[640px]">
			<div className="flex flex-col gap-8">{left}</div>
			<div className="relative">{right}</div>
		</section>
	);
}
