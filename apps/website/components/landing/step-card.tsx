import Card from "./card";

interface StepCardProps {
	title: string;
	command: string;
	body: string;
}

export default function StepCard({ title, command, body }: StepCardProps) {
	return (
		<Card>
			<h3 className="font-display text-[18px] font-semibold text-fg uppercase">
				{title}
			</h3>
			<code className="font-mono text-[12px] text-accent bg-canvas border border-line px-2 py-1 self-start">
				$ {command}
			</code>
			<p className="font-sans text-[14px] text-muted">{body}</p>
		</Card>
	);
}
