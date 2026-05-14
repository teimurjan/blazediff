import Image from "next/image";
import type { ComponentType } from "react";
import Card from "./card";

interface NumberedCardProps {
	num: string;
	title: string;
	body: string;
	icon?: ComponentType<{ size?: number; className?: string }>;
	illustration?: string;
	reverse?: boolean;
}

export default function NumberedCard({
	num,
	title,
	body,
	icon: Icon,
	illustration,
	reverse,
}: NumberedCardProps) {
	if (illustration) {
		return (
			<div
				className={`flex flex-col gap-6 md:items-start md:gap-12 ${
					reverse ? "md:flex-row-reverse" : "md:flex-row"
				}`}
			>
				<div className="md:w-[33%] shrink-0">
					<div className="relative aspect-[16/9] bg-surface border border-line overflow-hidden">
						<Image
							src={illustration}
							alt=""
							fill
							sizes="(max-width: 768px) 100vw, 35vw"
							className="object-contain"
						/>
					</div>
				</div>
				<div className="flex-1 flex flex-col gap-5">
					<div className="flex items-start justify-between">
						<span className="font-display text-[64px] leading-none font-bold text-muted opacity-30">
							{num}
						</span>
						{Icon && <Icon size={32} className="text-accent" />}
					</div>
					<h3 className="font-display text-[24px] md:text-[28px] font-semibold text-fg uppercase">
						{title}
					</h3>
					<p className="font-sans text-[16px] md:text-[18px] leading-relaxed text-muted">
						{body}
					</p>
				</div>
			</div>
		);
	}
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
