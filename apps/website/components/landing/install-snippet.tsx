"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";

interface InstallSnippetProps {
	command: string;
	label?: string;
}

export default function InstallSnippet({
	command,
	label = "INSTALL",
}: InstallSnippetProps) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// no-op
		}
	};

	return (
		<div className="bg-[#15151c] border border-[#2a2a38] p-4 flex flex-col gap-2 relative mt-4">
			<div className="absolute top-0 left-0 w-full h-1 bg-[#ff7a1a]/30" />
			<div className="flex items-center justify-between">
				<span className="font-[var(--font-jetbrains-mono)] text-[12px] tracking-widest text-[#7a7585]">
					{label}
				</span>
				<button
					type="button"
					onClick={copy}
					className="text-[#7a7585] hover:text-[#ff7a1a] transition-colors"
					aria-label="Copy install command"
				>
					{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
				</button>
			</div>
			<code className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#ff7a1a]">
				{command}
			</code>
		</div>
	);
}
