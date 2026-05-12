import type { CyclingRegion } from "./use-report-cycling";

interface RegionImageProps {
	label?: string;
	src: string;
	alt: string;
	imageWidth: number;
	imageHeight: number;
	regions: CyclingRegion[];
	activeIndex: number;
}

export default function RegionImage({
	label,
	src,
	alt,
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
				<div className="absolute top-2 left-2 bg-surface/80 px-2 py-0.5 font-mono text-[10px] tracking-widest text-muted z-30">
					{label}
				</div>
			)}
			{/* biome-ignore lint/performance/noImgElement: external static fixture, no Image config */}
			<img
				src={src}
				alt={alt}
				className="w-full h-full object-cover opacity-90"
			/>
			{regions.map((r, i) => {
				const isActive = i === activeIndex;
				return (
					<div
						key={`${r.bbox.x}-${r.bbox.y}-${r.bbox.width}-${r.bbox.height}`}
						className="absolute pointer-events-none transition-all duration-500 ease-out"
						style={{
							left: `${(r.bbox.x / imageWidth) * 100}%`,
							top: `${(r.bbox.y / imageHeight) * 100}%`,
							width: `${(r.bbox.width / imageWidth) * 100}%`,
							height: `${(r.bbox.height / imageHeight) * 100}%`,
							border: isActive
								? "2px solid #ff2e8b"
								: "1px dashed rgba(255, 46, 139, 0.35)",
							background: isActive ? "rgba(255, 46, 139, 0.18)" : "transparent",
							boxShadow: isActive ? "0 0 12px #ff2e8b" : "none",
							zIndex: isActive ? 20 : 10,
						}}
					/>
				);
			})}
		</div>
	);
}
