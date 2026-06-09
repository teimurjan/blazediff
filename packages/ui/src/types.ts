import type { DiffStats, Dimensions } from "./engine/types";

export interface MountHandle<O> {
	update(options: Partial<O>): void;
	destroy(): void;
}

export interface ImagesLoadedDetail {
	image1: Dimensions;
	image2: Dimensions;
}

export interface DifferenceMountOptions {
	src1: string;
	src2: string;
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
	src1: string;
	src2: string;
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
	src1: string;
	src2: string;
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
	src1: string;
	src2: string;
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
