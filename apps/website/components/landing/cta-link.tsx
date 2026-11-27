import Link from "next/link";
import type { ReactNode } from "react";

interface CtaLinkProps {
	href: string;
	variant?: "primary" | "secondary";
	external?: boolean;
	children: ReactNode;
}

const BASE = "font-mono text-[14px] uppercase px-6 py-3 transition-all";
const PRIMARY = `${BASE} bg-accent text-on-accent hover:brightness-110`;
const SECONDARY = `${BASE} border border-line text-fg hover:border-accent transition-colors`;

export default function CtaLink({
	href,
	variant = "secondary",
	external = false,
	children,
}: CtaLinkProps) {
	const className = variant === "primary" ? PRIMARY : SECONDARY;

	if (external) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
			>
				{children}
			</a>
		);
	}

	return (
		<Link href={href} className={className}>
			{children}
		</Link>
	);
}
