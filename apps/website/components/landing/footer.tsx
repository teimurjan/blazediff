const LINKS = [
	{ label: "GITHUB", href: "https://github.com/teimurjan/blazediff" },
	{
		label: "LICENSE",
		href: "https://github.com/teimurjan/blazediff/blob/main/LICENSE",
	},
	{
		label: "ISSUES",
		href: "https://github.com/teimurjan/blazediff/issues",
	},
];

export default function LandingFooter() {
	return (
		<footer className="bg-surface border-t border-line w-full px-10 py-4 flex flex-col md:flex-row justify-between items-center mt-auto">
			<div className="font-mono text-[14px] text-fg">
				© {new Date().getFullYear()} BLAZEDIFF
			</div>
			<div className="flex gap-6 mt-4 md:mt-0 font-mono text-[12px] uppercase tracking-widest text-muted">
				{LINKS.map((l) => (
					<a
						key={l.label}
						href={l.href}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:text-fg transition-colors"
					>
						{l.label}
					</a>
				))}
			</div>
		</footer>
	);
}
