"use client";

import { IconMenu2, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MobileMenuTab = "home" | "agent" | "docs";

interface MobileMenuLink {
	id: MobileMenuTab | "github";
	label: string;
	href: string;
	external?: boolean;
}

interface MobileMenuProps {
	activeTab: MobileMenuTab;
	links: MobileMenuLink[];
}

export default function MobileMenu({ activeTab, links }: MobileMenuProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		const onClick = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};

		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div ref={containerRef} className="relative md:hidden">
			<button
				type="button"
				aria-label={open ? "Close menu" : "Open menu"}
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="flex items-center justify-center w-8 h-8 text-muted hover:text-fg transition-colors"
			>
				{open ? <IconX size={20} /> : <IconMenu2 size={20} />}
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-2 min-w-[180px] bg-surface border border-line shadow-lg flex flex-col">
					{links.map((link) => {
						const isActive = link.id === activeTab;
						const className = `block px-4 py-3 border-b border-line last:border-b-0 transition-colors ${
							isActive
								? "text-fg bg-terminal"
								: "text-muted hover:text-fg hover:bg-terminal"
						}`;

						if (link.external) {
							return (
								<a
									key={link.id}
									href={link.href}
									target="_blank"
									rel="noopener noreferrer"
									className={className}
									onClick={() => setOpen(false)}
								>
									{link.label}
								</a>
							);
						}

						return (
							<Link
								key={link.id}
								href={link.href}
								className={className}
								onClick={() => setOpen(false)}
							>
								{link.label}
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
