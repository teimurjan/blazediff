"use client";

import type { ReactNode } from "react";

export interface InterpretSummaryProps {
	severity: string;
	diffPercentage: number;
	children?: ReactNode;
}

const severityColors: Record<string, string> = {
	Low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
	Medium:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
	High: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function InterpretSummary({
	severity,
	diffPercentage,
	children,
}: InterpretSummaryProps) {
	return (
		<div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 space-y-3">
			{children}
			<div className="flex items-center gap-3 text-sm">
				<span
					className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityColors[severity] ?? "bg-gray-100 text-gray-800"}`}
				>
					{severity}
				</span>
				<span>{diffPercentage.toFixed(2)}% changed</span>
			</div>
		</div>
	);
}
