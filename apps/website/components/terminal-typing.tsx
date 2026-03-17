"use client";

import { useEffect, useRef, useState } from "react";

interface TerminalLine {
	text: string;
	isCommand: boolean;
	typingDelay?: number;
}

const LINES: TerminalLine[] = [
	{
		text: "$ blazediff-cli image1.png image2.png diff.png",
		isCommand: true,
		typingDelay: 40,
	},
	{ text: "Images differ: 1,234 pixels (0.52%)", isCommand: false },
	{ text: "Diff saved to: diff.png", isCommand: false },
	{ text: "", isCommand: false },
	{
		text: "$ blazediff-cli ssim reference.png test.png",
		isCommand: true,
		typingDelay: 40,
	},
	{ text: "SSIM: 0.9876", isCommand: false },
	{ text: "", isCommand: false },
	{
		text: "$ blazediff-cli gmsd reference.png test.png --output gms-map.png",
		isCommand: true,
		typingDelay: 40,
	},
	{ text: "GMSD: 0.0234", isCommand: false },
	{ text: "GMS map saved to: gms-map.png", isCommand: false },
	{ text: "", isCommand: false },
	{
		text: "$ blazediff-cli interpret image1.png image2.png --compact",
		isCommand: true,
		typingDelay: 40,
	},
	{
		text: '{ "severity": "Medium", "diffPercentage": 1.87, "summary": "Moderate visual change detected (1.87%, 10 regions), Content changed: 4 regions. Content added: 3 regions." }',
		isCommand: false,
	},
];

export default function TerminalTyping() {
	const [displayedLines, setDisplayedLines] = useState<string[]>([]);
	const [currentLineIndex, setCurrentLineIndex] = useState(0);
	const [currentCharIndex, setCurrentCharIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (currentLineIndex >= LINES.length) {
			return;
		}

		const line = LINES[currentLineIndex];

		if (line.isCommand) {
			if (currentCharIndex < line.text.length) {
				const timeout = setTimeout(() => {
					setDisplayedLines((prev) => {
						const next = [...prev];
						next[currentLineIndex] = line.text.slice(0, currentCharIndex + 1);
						return next;
					});
					setCurrentCharIndex((prev) => prev + 1);
				}, line.typingDelay ?? 40);
				return () => clearTimeout(timeout);
			}

			const timeout = setTimeout(() => {
				setCurrentLineIndex((prev) => prev + 1);
				setCurrentCharIndex(0);
			}, 300);
			return () => clearTimeout(timeout);
		}

		const timeout = setTimeout(() => {
			setDisplayedLines((prev) => {
				const next = [...prev];
				next[currentLineIndex] = line.text;
				return next;
			});
			setCurrentLineIndex((prev) => prev + 1);
			setCurrentCharIndex(0);
		}, 80);
		return () => clearTimeout(timeout);
	}, [currentLineIndex, currentCharIndex]);

	const scrollRef = useRef<number>(0);

	useEffect(() => {
		scrollRef.current += 1;
		const id = scrollRef.current;
		requestAnimationFrame(() => {
			if (id === scrollRef.current && containerRef.current) {
				containerRef.current.scrollTop = containerRef.current.scrollHeight;
			}
		});
	});

	const currentLine = LINES[currentLineIndex];
	const showCursor =
		currentLineIndex < LINES.length &&
		currentLine?.isCommand &&
		currentCharIndex < (currentLine?.text.length ?? 0);

	return (
		<div className="rounded-lg overflow-hidden border border-gray-800">
			<div className="flex items-center gap-2 px-4 py-2 bg-neutral-700 border-b border-gray-800">
				<div className="w-3 h-3 rounded-full bg-neutral-400" />
				<div className="w-3 h-3 rounded-full bg-neutral-400" />
				<div className="w-3 h-3 rounded-full bg-neutral-400" />
				<span className="ml-2 text-xs">terminal</span>
			</div>
			<div
				ref={containerRef}
				className="bg-black px-4 py-2 min-h-[240px] max-h-[340px] overflow-y-auto"
			>
				{displayedLines.map((line, lineIndex) => (
					<div
						key={`line-${LINES[lineIndex]?.text ?? lineIndex}`}
						className="leading-relaxed"
					>
						{LINES[lineIndex]?.isCommand ? (
							<span className="text-blue-400 text-sm">
								{line}
								{showCursor && lineIndex === currentLineIndex && (
									<span className="animate-pulse">|</span>
								)}
							</span>
						) : (
							<span className="text-gray-400 text-sm">{line}</span>
						)}
					</div>
				))}
				{currentLineIndex < LINES.length &&
					showCursor &&
					displayedLines.length - 1 < currentLineIndex && (
						<div className="leading-relaxed">
							<span className="text-blue-500 text-sm">
								{displayedLines[currentLineIndex] ?? ""}
								<span className="animate-pulse">|</span>
							</span>
						</div>
					)}
			</div>
		</div>
	);
}
