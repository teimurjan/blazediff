import type { ComponentType } from "react";
import Card from "./card";

interface NumberedCardProps {
	num: string;
	title: string;
	body: string;
	icon?: ComponentType<{ size?: number; className?: string }>;
}

export default function NumberedCard({
	num,
	title,
	body,
	icon: Icon,
}: NumberedCardProps) {
	return (
		<Card>
			<div className="flex items-start justify-between">
				<span className="font-display text-[48px] font-bold text-muted opacity-30">
					{num}
				</span>
				{Icon && <Icon size={32} className="text-accent" />}
			</div>
			<h3 className="font-display text-[18px] font-semibold text-fg uppercase mt-4">
				{title}
			</h3>
			<p className="font-sans text-[14px] text-muted">{body}</p>
		</Card>
	);
}
