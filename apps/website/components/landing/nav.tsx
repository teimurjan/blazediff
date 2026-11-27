import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import MobileMenu from "./mobile-menu";
import Picture, { sizesForHeight } from "./picture";

export type LandingTab =
	| "home"
	| "agent"
	| "playground"
	| "benchmarks"
	| "docs";

interface LandingNavProps {
	activeTab: LandingTab;
	ctaLabel: string;
	ctaHref: string;
}

const TABS: { id: LandingTab; label: string; href: string }[] = [
	{ id: "home", label: "HOME", href: "/" },
	{ id: "agent", label: "AGENT", href: "/agent" },
	{ id: "playground", label: "PLAYGROUND", href: "/playground" },
	{ id: "benchmarks", label: "BENCHMARKS", href: "/benchmarks" },
	{ id: "docs", label: "DOCS", href: "/docs" },
];

const GITHUB_URL = "https://github.com/teimurjan/blazediff";

const MOBILE_LINKS = [
	...TABS,
	{ id: "github" as const, label: "GITHUB", href: GITHUB_URL, external: true },
];

export default function LandingNav({
	activeTab,
	ctaLabel,
	ctaHref,
}: LandingNavProps) {
	return (
		<nav className="sticky max-w-screen-2xl w-full mx-auto top-0 z-40 px-4 md:px-10 pt-3 md:pt-4">
			<div className="w-full bg-surface/80 backdrop-blur-md border border-line font-mono text-[14px] uppercase tracking-wider flex justify-between items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-2 h-14">
				<Link
					href="/"
					className="flex items-center gap-2 md:gap-4 shrink min-w-0"
				>
					<Picture
						src="/logo.png"
						alt=""
						sizes={sizesForHeight("/logo.png", 32)}
						loading="eager"
						className="w-7 h-7 md:w-8 md:h-8 shrink-0 [image-rendering:pixelated]"
					/>
					<span className="font-display text-[17px] sm:text-[18px] md:text-[24px] font-bold text-fg tracking-tighter truncate">
						BLAZEDIFF
					</span>
				</Link>

				<div className="hidden lg:flex items-center gap-6 xl:gap-8">
					{TABS.map((tab) => {
						const isActive = tab.id === activeTab;
						return (
							<Link
								key={tab.id}
								href={tab.href}
								className={`pb-1 border-b-2 transition-colors duration-300 ${
									isActive
										? "text-fg border-accent"
										: "text-muted border-transparent hover:text-fg"
								}`}
							>
								{tab.label}
							</Link>
						);
					})}
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="pb-1 border-b-2 border-transparent text-muted hover:text-fg transition-colors duration-300"
					>
						GITHUB
					</a>
				</div>

				<div className="flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0">
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="hidden xl:flex items-center gap-2 px-3 py-1 bg-terminal border border-line text-[12px] tracking-wider hover:border-accent/60 transition-colors"
					>
						<IconBrandGithub size={14} className="text-accent" />
						<span className="text-fg">STAR</span>
					</a>
					<Link
						href={ctaHref}
						className="max-[359px]:hidden inline-flex items-center h-10 bg-accent text-on-accent font-mono px-3 text-[11px] md:px-6 md:text-[14px] whitespace-nowrap hover:brightness-110 transition-[filter]"
					>
						{ctaLabel}
					</Link>
					<MobileMenu activeTab={activeTab} links={MOBILE_LINKS} />
				</div>
			</div>
		</nav>
	);
}
