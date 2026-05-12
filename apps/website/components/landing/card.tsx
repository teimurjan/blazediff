import type { ReactNode } from "react";

interface CardProps {
	className?: string;
	children: ReactNode;
}

export default function Card({ className = "", children }: CardProps) {
	return (
		<div
			className={`bg-surface border border-line p-8 flex flex-col gap-4 relative group ${className}`}
		>
			<div className="absolute top-0 left-0 w-full h-1 bg-line group-hover:bg-accent transition-colors" />
			{children}
		</div>
	);
}
