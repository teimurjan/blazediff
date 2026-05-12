"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";

interface InstallSnippetProps {
	commands: string | string[];
	label?: string;
}

export default function InstallSnippet({
	commands,
	label = "INSTALL",
}: InstallSnippetProps) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			const commandText = Array.isArray(commands)
				? commands.join(" && ")
				: commands;
			await navigator.clipboard.writeText(commandText);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// no-op
		}
	};

	return (
		<div className="bg-surface border border-line p-4 flex flex-col gap-2 relative mt-4">
			<div className="absolute top-0 left-0 w-full h-1 bg-accent/30" />
			<div className="flex items-center justify-between">
				<span className="font-mono text-[12px] tracking-widest text-muted">
					{label}
				</span>
				<button
					type="button"
					onClick={copy}
					className="text-muted hover:text-accent transition-colors"
					aria-label="Copy install command"
				>
					{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
				</button>
			</div>
			<code className="font-mono text-[14px] text-accent">
				{Array.isArray(commands)
					? commands.map((command) => (
							<span key={command}>
								{command}
								<br />
							</span>
						))
					: commands}
			</code>
		</div>
	);
}
