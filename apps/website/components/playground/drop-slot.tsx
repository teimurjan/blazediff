"use client";

import { type DragEvent, useId, useState } from "react";
import type { Size } from "./image-header";
import { useObjectUrl } from "./use-object-url";

export interface PlaygroundImage {
	blob: Blob;
	name: string;
	size: Size;
}

const ACCEPT = "image/png,image/jpeg,image/webp";

export default function DropSlot({
	label,
	image,
	onFile,
}: {
	label: string;
	image: PlaygroundImage | null;
	onFile: (file: File) => void;
}) {
	const inputId = useId();
	const [dragging, setDragging] = useState(false);
	const url = useObjectUrl(image?.blob ?? null);

	const take = (files: FileList | null) => {
		const file = files?.[0];
		if (file) onFile(file);
	};

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		setDragging(false);
		take(event.dataTransfer.files);
	};

	return (
		<div>
			<label
				htmlFor={inputId}
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
				className={`flex max-h-80 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors ${
					dragging
						? "border-accent bg-accent/10"
						: "border-line hover:border-accent/60"
				} ${url ? "p-1" : "p-8 min-h-40"}`}
			>
				{url ? (
					// biome-ignore lint/performance/noImgElement: object URLs of local files cannot go through next/image
					<img
						src={url}
						alt={label}
						className="max-h-full w-full object-contain"
					/>
				) : (
					<span className="text-center font-mono text-sm text-muted">
						Drop an image or click to choose
					</span>
				)}
			</label>
			<input
				id={inputId}
				type="file"
				accept={ACCEPT}
				className="sr-only"
				onChange={(event) => {
					take(event.target.files);
					// Picking the same file again still fires a change.
					event.target.value = "";
				}}
			/>
			<p className="mt-2 truncate text-center text-sm text-muted">
				{image
					? `${label} · ${image.name} · ${image.size.width}×${image.size.height}`
					: label}
			</p>
		</div>
	);
}
