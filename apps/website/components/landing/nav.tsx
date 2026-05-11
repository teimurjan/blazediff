import { IconBook, IconBrandGithub } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";

type Tab = "home" | "agent" | "docs";

interface LandingNavProps {
	activeTab: Tab;
	ctaLabel: string;
	ctaHref: string;
}

const TABS: { id: Tab; label: string; href: string; external?: boolean }[] = [
	{ id: "home", label: "HOME", href: "/" },
	{ id: "agent", label: "AGENT", href: "/agent" },
	{ id: "docs", label: "DOCS", href: "/docs/core" },
];

export default function LandingNav({
	activeTab,
	ctaLabel,
	ctaHref,
}: LandingNavProps) {
	return (
		<nav className="bg-[#15151c]/80 backdrop-blur-md font-[var(--font-jetbrains-mono)] text-[14px] uppercase tracking-wider sticky top-0 border-b border-[#2a2a38] z-40">
			<div className="flex justify-between items-center gap-3 w-full px-4 md:px-10 py-2 max-w-screen-2xl mx-auto h-16">
				<Link
					href="/"
					className="flex items-center gap-2 md:gap-4 shrink min-w-0"
				>
					<Image
						src="/logo.png"
						alt="BlazeDiff"
						width={32}
						height={32}
						className="w-7 h-7 md:w-8 md:h-8 shrink-0"
						style={{ imageRendering: "pixelated" }}
					/>
					<span className="font-[var(--font-space-grotesk)] text-[18px] md:text-[24px] font-black text-[#f0ece8] tracking-tighter truncate">
						BLAZEDIFF
					</span>
				</Link>

				<div className="hidden md:flex items-center gap-8">
					{TABS.map((tab) => {
						const isActive = tab.id === activeTab;
						return (
							<Link
								key={tab.id}
								href={tab.href}
								className={`pb-1 border-b-2 transition-colors duration-300 ${
									isActive
										? "text-[#f0ece8] border-[#ff7a1a]"
										: "text-[#7a7585] border-transparent hover:text-[#f0ece8]"
								}`}
							>
								{tab.label}
							</Link>
						);
					})}
					<a
						href="https://github.com/teimurjan/blazediff"
						target="_blank"
						rel="noopener noreferrer"
						className="pb-1 border-b-2 border-transparent text-[#7a7585] hover:text-[#f0ece8] transition-colors duration-300"
					>
						GITHUB
					</a>
				</div>

				<div className="flex items-center gap-3 md:gap-4 shrink-0">
					<Link
						href="/docs/core"
						aria-label="Docs"
						className="md:hidden text-[#7a7585] hover:text-[#f0ece8] transition-colors"
					>
						<IconBook size={20} />
					</Link>
					<a
						href="https://github.com/teimurjan/blazediff"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="GitHub"
						className="md:hidden text-[#7a7585] hover:text-[#f0ece8] transition-colors"
					>
						<IconBrandGithub size={20} />
					</a>
					<a
						href="https://github.com/teimurjan/blazediff"
						target="_blank"
						rel="noopener noreferrer"
						className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#1c1c26] border border-[#2a2a38] text-[12px] tracking-wider hover:border-[#ff7a1a]/60 transition-colors"
					>
						<IconBrandGithub size={14} className="text-[#ff7a1a]" />
						<span className="text-[#f0ece8]">STAR</span>
					</a>
					<Link
						href={ctaHref}
						className="bg-[#ff7a1a] text-[#0a0a0f] font-[var(--font-jetbrains-mono)] px-3 py-1.5 text-[11px] md:px-6 md:py-2 md:text-[14px] whitespace-nowrap hover:bg-opacity-90 hover:shadow-[0_0_12px_rgba(255,122,26,0.4)] transition-all"
					>
						{ctaLabel}
					</Link>
				</div>
			</div>
		</nav>
	);
}
