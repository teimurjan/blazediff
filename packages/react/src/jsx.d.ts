import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			"blazediff-difference": DetailedHTMLProps<
				HTMLAttributes<HTMLElement> & {
					src1?: string;
					src2?: string;
					threshold?: string;
					"include-aa"?: string;
					alpha?: string;
					"class-container"?: string;
					"class-canvas"?: string;
				},
				HTMLElement
			>;
			"blazediff-swipe": DetailedHTMLProps<
				HTMLAttributes<HTMLElement> & {
					src1?: string;
					src2?: string;
					alt1?: string;
					alt2?: string;
					"class-container"?: string;
					"class-image1"?: string;
					"class-image2"?: string;
					"class-divider"?: string;
				},
				HTMLElement
			>;
			"blazediff-twoup": DetailedHTMLProps<
				HTMLAttributes<HTMLElement> & {
					src1?: string;
					src2?: string;
					"class-container"?: string;
					"class-container-inner"?: string;
					"class-panel"?: string;
					"class-image"?: string;
					"class-dimension-info"?: string;
				},
				HTMLElement
			>;
			"blazediff-onionskin": DetailedHTMLProps<
				HTMLAttributes<HTMLElement> & {
					src1?: string;
					src2?: string;
					opacity?: string;
					"class-container"?: string;
					"class-image-container"?: string;
					"class-image"?: string;
					"class-slider-container"?: string;
					"class-slider"?: string;
					"class-slider-label"?: string;
					"text-slider-label"?: string;
				},
				HTMLElement
			>;
		}
	}
}
