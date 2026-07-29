import type { DiffStats, Dimensions } from "./engine/types";

export type ImageSource = string | Uint8Array;

export interface MountHandle<O> {
	update(options: Partial<O>): void;
	destroy(): void;
}

export interface ImagesLoadedDetail {
	image1: Dimensions;
	image2: Dimensions;
}

export interface DifferenceMountOptions {
	src1: ImageSource;
	src2: ImageSource;
	diff?: Uint8Array;
	threshold?: number;
	includeAA?: boolean;
	alpha?: number;
	crossOrigin?: string | null;
	className?: string;
	containerClassName?: string;
	canvasClassName?: string;
	onDiffComplete?: (detail: {
		diffCount: number;
		totalPixels: number;
		percentage: number;
	}) => void;
	onDiffError?: (error: unknown) => void;
}

export interface SwipeMountOptions {
	src1: ImageSource;
	src2: ImageSource;
	alt1?: string;
	alt2?: string;
	initialPosition?: number;
	className?: string;
	containerClassName?: string;
	image1ClassName?: string;
	image2ClassName?: string;
	dividerClassName?: string;
	onPositionChange?: (position: number) => void;
}

export interface TwoUpMountOptions {
	src1: ImageSource;
	src2: ImageSource;
	crossOrigin?: string | null;
	className?: string;
	containerClassName?: string;
	containerInnerClassName?: string;
	panelClassName?: string;
	imageClassName?: string;
	dimensionInfoClassName?: string;
	onImagesLoaded?: (detail: ImagesLoadedDetail) => void;
	onLoadError?: (error: unknown) => void;
}

export interface OnionSkinMountOptions {
	src1: ImageSource;
	src2: ImageSource;
	opacity?: number;
	crossOrigin?: string | null;
	sliderLabelText?: string;
	className?: string;
	containerClassName?: string;
	imageContainerClassName?: string;
	imageClassName?: string;
	sliderContainerClassName?: string;
	sliderClassName?: string;
	sliderLabelClassName?: string;
	onOpacityChange?: (opacity: number) => void;
	onImagesLoaded?: (detail: ImagesLoadedDetail) => void;
	onLoadError?: (error: unknown) => void;
}

export type { DiffStats, Dimensions };
