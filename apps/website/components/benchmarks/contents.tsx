"use client";

import { useEffect, useState } from "react";
import { ordinal } from "./format";

export interface ContentsCategory {
	id: string;
	title: string;
	groups: { anchor: string; title: string }[];
}

// A group counts as current once its top passes this share of the viewport.
const ACTIVE_LINE = 0.3;

function useActiveAnchor(anchors: string[]) {
	const [active, setActive] = useState(anchors[0]);
	useEffect(() => {
		let frame = 0;
		const update = () => {
			frame = 0;
			const line = window.innerHeight * ACTIVE_LINE;
			const passed = anchors.filter(
				(id) =>
					(document.getElementById(id)?.getBoundingClientRect().top ?? 0) <=
					line,
			);
			setActive(passed.at(-1) ?? anchors[0]);
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, [anchors]);
	return active;
}

export default function Contents({
	categories,
}: {
	categories: ContentsCategory[];
}) {
	const [anchors] = useState(() =>
		categories.flatMap((c) => c.groups.map((g) => g.anchor)),
	);
	const active = useActiveAnchor(anchors);

	return (
		<nav aria-label="Benchmark groups" className="flex flex-col gap-6">
			{categories.map((category, i) => {
				const isCurrent = category.groups.some((g) => g.anchor === active);
				return (
					<div key={category.id} className="flex flex-col gap-2">
						<a
							href={`#${category.id}`}
							className={`flex gap-2 font-display text-[14px] uppercase tracking-tight transition-colors ${
								isCurrent ? "text-fg" : "text-muted hover:text-fg"
							}`}
						>
							<span className={isCurrent ? "text-accent" : ""}>
								{ordinal(i)}
							</span>
							{category.title}
						</a>
						<ul className="flex flex-col border-l border-line">
							{category.groups.map((group) => {
								const isActive = group.anchor === active;
								return (
									<li key={group.anchor}>
										<a
											href={`#${group.anchor}`}
											aria-current={isActive ? "location" : undefined}
											className={`-ml-px block border-l-2 py-1 pl-4 font-mono text-[12px] uppercase transition-colors ${
												isActive
													? "border-accent text-fg"
													: "border-transparent text-muted hover:text-fg"
											}`}
										>
											{group.title}
										</a>
									</li>
								);
							})}
						</ul>
					</div>
				);
			})}
		</nav>
	);
}
