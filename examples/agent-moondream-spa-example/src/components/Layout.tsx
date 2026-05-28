import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const LINKS = [
	{ to: "/", label: "Home" },
	{ to: "/pricing", label: "Pricing" },
	{ to: "/docs", label: "Docs" },
	{ to: "/changelog", label: "Changelog" },
	{ to: "/status", label: "Status" },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
	return [
		"rounded-md px-3 py-2 text-sm font-medium transition-none",
		isActive
			? "bg-indigo-600 text-white"
			: "text-indigo-900/70 hover:bg-indigo-50",
	].join(" ");
}

export function Layout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-full flex-col">
			<header className="border-b border-indigo-100 bg-white">
				<div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
					<div className="flex items-center gap-2">
						<div className="h-7 w-7 rounded-lg bg-indigo-600" />
						<span className="text-lg font-semibold tracking-tight text-indigo-950">
							Nimbus
						</span>
					</div>
					<nav className="flex items-center gap-1">
						{LINKS.map((l) => (
							<NavLink key={l.to} to={l.to} className={navLinkClass} end>
								{l.label}
							</NavLink>
						))}
					</nav>
				</div>
			</header>
			<main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
				{children}
			</main>
			<footer className="border-t border-indigo-100 bg-indigo-50/40">
				<div className="mx-auto max-w-5xl px-6 py-6 text-sm text-indigo-900/60">
					© Nimbus Labs — a deterministic demo target for BlazeDiff.
				</div>
			</footer>
		</div>
	);
}
