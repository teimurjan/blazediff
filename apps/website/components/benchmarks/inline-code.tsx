/** Render Markdown-style `backtick` spans in an artifact title as code. */
export default function InlineCode({ text }: { text: string }) {
	return text.split("`").map((part, i) =>
		i % 2 === 1 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
			<code key={i} className="font-mono text-accent">
				{part}
			</code>
		) : (
			part
		),
	);
}
