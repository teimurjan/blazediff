import type { ReactNode } from "react";

interface SectionProps {
	title?: string;
	intro?: string;
	className?: string;
	children: ReactNode;
}

export default function Section({
	title,
	intro,
	className = "",
	children,
}: SectionProps) {
	return (
		<section
			className={`w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-line ${className}`}
		>
			{title && (
				<h2
					className={`font-display text-[24px] text-fg uppercase tracking-tight ${
						intro ? "mb-4" : "mb-12"
					}`}
				>
					{title}
				</h2>
			)}
			{intro && (
				<p className="font-mono text-[14px] text-muted mb-12 max-w-2xl uppercase">
					{intro}
				</p>
			)}
			{children}
		</section>
	);
}
