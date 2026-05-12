import type { ReactNode } from "react";
import LandingFooter from "./footer";
import LandingNav from "./nav";

interface LandingShellProps {
	activeTab: "home" | "agent" | "docs";
	ctaLabel: string;
	ctaHref: string;
	children: ReactNode;
}

export default function LandingShell({
	activeTab,
	ctaLabel,
	ctaHref,
	children,
}: LandingShellProps) {
	return (
		<div className="min-h-screen flex flex-col bg-canvas text-fg font-sans bg-grid">
			<LandingNav activeTab={activeTab} ctaLabel={ctaLabel} ctaHref={ctaHref} />
			<main className="flex-grow flex flex-col">{children}</main>
			<LandingFooter />
		</div>
	);
}
