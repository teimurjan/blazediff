import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { isAuthed, logout } from "../auth";

const PUBLIC_LINKS = [
	{ to: "/", label: "Home" },
	{ to: "/about", label: "About" },
];

const PROTECTED_LINKS = [
	{ to: "/dashboard", label: "Dashboard" },
	{ to: "/profile", label: "Profile" },
	{ to: "/settings", label: "Settings" },
	{ to: "/billing", label: "Billing" },
	{ to: "/team", label: "Team" },
	{ to: "/projects", label: "Projects" },
	{ to: "/reports", label: "Reports" },
	{ to: "/analytics", label: "Analytics" },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
	return [
		"block rounded-md px-3 py-2 text-sm",
		isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200",
	].join(" ");
}

export function Layout({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const authed = isAuthed();

	return (
		<div className="flex min-h-full">
			<aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
				<div className="mb-6 px-3 text-lg font-semibold tracking-tight text-slate-900">
					Acme Suite
				</div>
				<nav className="space-y-1">
					<div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
						Public
					</div>
					{PUBLIC_LINKS.map((l) => (
						<NavLink key={l.to} to={l.to} className={navLinkClass} end>
							{l.label}
						</NavLink>
					))}
					<div className="px-3 pt-4 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
						Workspace
					</div>
					{PROTECTED_LINKS.map((l) => (
						<NavLink key={l.to} to={l.to} className={navLinkClass}>
							{l.label}
						</NavLink>
					))}
				</nav>
				<div className="mt-6 border-t border-slate-200 pt-4">
					{authed ? (
						<button
							type="button"
							onClick={() => {
								logout();
								navigate("/login");
							}}
							className="w-full rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
						>
							Sign out
						</button>
					) : (
						<NavLink
							to="/login"
							className="block rounded-md bg-slate-900 px-3 py-2 text-center text-sm text-white"
						>
							Sign in
						</NavLink>
					)}
				</div>
			</aside>
			<main className="flex-1 p-10">{children}</main>
		</div>
	);
}
