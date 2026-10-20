import { IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

export type StepStatus = "active" | "done" | "upcoming";

const CIRCLE: Record<StepStatus, string> = {
	active: "border-accent text-accent",
	done: "border-accent bg-accent text-canvas",
	upcoming: "border-line text-muted",
};

export function Stepper({ children }: { children: ReactNode }) {
	return <ol className="flex flex-col">{children}</ol>;
}

export function Step({
	index,
	title,
	status,
	summary,
	onEdit,
	last = false,
	children,
}: {
	index: number;
	title: string;
	status: StepStatus;
	/** One line shown in place of the content once the step is done. */
	summary?: ReactNode;
	onEdit?: () => void;
	last?: boolean;
	children: ReactNode;
}) {
	return (
		<li className="flex gap-4">
			<div className="flex flex-col items-center">
				<span
					className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm ${CIRCLE[status]}`}
				>
					{status === "done" ? <IconCheck size={16} /> : index}
				</span>
				{!last && <span className="my-2 w-px flex-1 bg-line" />}
			</div>
			<div className={`min-w-0 flex-1 ${last ? "" : "pb-10"}`}>
				<div className="flex min-h-8 items-center justify-between gap-4">
					<h2
						className={`font-display text-[18px] uppercase tracking-tight ${status === "upcoming" ? "text-muted" : "text-fg"}`}
					>
						{title}
					</h2>
					{status === "done" && onEdit && (
						<button
							type="button"
							onClick={onEdit}
							className="font-mono text-sm text-muted transition-colors hover:text-accent"
						>
							Edit
						</button>
					)}
				</div>
				{status === "done" && summary && (
					<p className="mt-1 font-mono text-sm text-muted">{summary}</p>
				)}
				{status === "active" && <div className="mt-4">{children}</div>}
			</div>
		</li>
	);
}
