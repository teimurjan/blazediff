import manifest from "../../data/images/manifest.json";

export type ImageSrc = keyof typeof manifest;

interface PictureProps {
	src: ImageSrc;
	alt: string;
	/** The `sizes` attribute: the image's CSS width per viewport. */
	sizes: string;
	className?: string;
	loading?: "eager" | "lazy";
}

const FORMATS = ["avif", "webp"] as const;

/** `sizes` for an image rendered at a fixed CSS height with `w-auto`. */
export const sizesForHeight = (src: ImageSrc, heightPx: number) => {
	const { width, height } = manifest[src];
	return `${Math.round((heightPx * width) / height)}px`;
};

const toSrcSet = (variants: { width: number; src: string }[]) =>
	variants.map((v) => `${v.src} ${v.width}w`).join(", ");

export default function Picture({
	src,
	alt,
	sizes,
	className,
	loading = "lazy",
}: PictureProps) {
	const entry = manifest[src];
	if (!entry) {
		throw new Error(`Picture: ${src} is not in data/images/manifest.json`);
	}

	// `contents` keeps the <img> as the only layout box, so callers style it
	// exactly as they would a bare <img>.
	return (
		<picture className="contents">
			{FORMATS.map((format) => (
				<source
					key={format}
					type={`image/${format}`}
					srcSet={toSrcSet(entry.variants[format])}
					sizes={sizes}
				/>
			))}
			<img
				src={src}
				alt={alt}
				width={entry.width}
				height={entry.height}
				sizes={sizes}
				loading={loading}
				decoding="async"
				className={className}
			/>
		</picture>
	);
}
