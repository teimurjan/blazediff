import type { ReactNode } from "react";

interface TerminalFrameProps {
	title: string;
	children: ReactNode;
	className?: string;
}

export default function TerminalFrame({
	title,
	children,
	className = "",
}: TerminalFrameProps) {
	return (
		<div
			className={`bg-terminal border border-line p-2 flex flex-col gap-2 relative ${className}`}
		>
			<div className="flex items-center border-b border-line pb-2 px-2">
				<span className="font-mono text-[14px] text-accent">{title}</span>
			</div>
			{children}
		</div>
	);
}
