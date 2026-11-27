import Picture, { type ImageSrc } from "./picture";
import type { CyclingRegion } from "./use-report-cycling";

interface RegionImageProps {
	label?: string;
	labelPosition?: "top" | "bottom";
	src: ImageSrc;
	alt: string;
	sizes: string;
	priority?: boolean;
	imageWidth: number;
	imageHeight: number;
	regions: CyclingRegion[];
	activeIndex: number;
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

export default function RegionImage({
	label,
	labelPosition = "top",
	src,
	alt,
	sizes,
	priority = false,
	imageWidth,
	imageHeight,
	regions,
	activeIndex,
}: RegionImageProps) {
	return (
		<div
			className="relative border border-line bg-canvas overflow-hidden"
			style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
		>
			{label && (
				<div
					className={`absolute ${labelPosition === "bottom" ? "bottom-2" : "top-2"} left-2 bg-surface/80 px-2 py-0.5 font-mono text-[11px] tracking-widest text-muted z-30`}
				>
					{label}
				</div>
			)}
			<Picture
				src={src}
				alt={alt}
				sizes={sizes}
				loading={priority ? "eager" : "lazy"}
				fetchPriority={priority ? "high" : undefined}
				className="w-full h-full object-cover opacity-90"
			/>
			{regions.map((r, i) => {
				const isActive = i === activeIndex;
				return (
					<div
						key={`${r.bbox.x}-${r.bbox.y}-${r.bbox.width}-${r.bbox.height}`}
						className={`absolute pointer-events-none transition-colors duration-500 ease-out motion-reduce:transition-none ${
							isActive
								? "z-20 border-2 border-magenta bg-magenta/20"
								: "z-10 border border-dashed border-magenta/40"
						}`}
						style={{
							left: pct(r.bbox.x, imageWidth),
							top: pct(r.bbox.y, imageHeight),
							width: pct(r.bbox.width, imageWidth),
							height: pct(r.bbox.height, imageHeight),
						}}
					/>
				);
			})}
		</div>
	);
}
