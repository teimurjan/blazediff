export default function LandingFooter() {
	return (
		<footer className="bg-[#15151c] border-t border-[#2a2a38] w-full px-10 py-4 flex flex-col md:flex-row justify-between items-center mt-auto">
			<div className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#f0ece8]">
				© {new Date().getFullYear()} BLAZEDIFF
			</div>
			<div className="flex gap-6 mt-4 md:mt-0 font-[var(--font-jetbrains-mono)] text-[12px] uppercase tracking-widest text-[#7a7585]">
				<a
					href="https://github.com/teimurjan/blazediff"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-[#f0ece8] transition-colors"
				>
					GITHUB
				</a>
				<a
					href="https://github.com/teimurjan/blazediff/blob/main/LICENSE"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-[#f0ece8] transition-colors"
				>
					LICENSE
				</a>
				<a
					href="https://github.com/teimurjan/blazediff/issues"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-[#f0ece8] transition-colors"
				>
					ISSUES
				</a>
			</div>
		</footer>
	);
}
