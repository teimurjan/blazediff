import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Head } from "nextra/components";
import "./global.css";

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-space-grotesk",
	weight: ["600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-jetbrains-mono",
	weight: ["400", "500", "700", "800"],
});

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	weight: ["400", "500", "600"],
});

export const metadata = {
	title: {
		default: "BlazeDiff. Open-source image diff for CI, in Rust.",
		template: "%s | BlazeDiff",
	},
	description:
		"Open-source image and object diffing. Rust core with SIMD. Up to 8x faster than pixelmatch on 4K, 3 to 4x faster than odiff. Ships matchers for Jest, Vitest, Bun, plus an agent that drives visual regression from Claude Code, Cursor, and Codex.",
	keywords: [
		"image comparison",
		"visual regression",
		"diff",
		"pixelmatch",
		"odiff",
		"ssim",
		"playwright",
		"rust",
		"simd",
		"blazediff",
		"typescript",
		"claude code",
		"cursor",
		"codex",
	],
	authors: [{ name: "Teimur Gasanov" }],
	creator: "Teimur Gasanov",
	publisher: "Teimur Gasanov",
	openGraph: {
		title: "BlazeDiff. Open-source image diff for CI, in Rust.",
		description:
			"Open-source image and object diffing. Rust core with SIMD. Up to 8x faster than pixelmatch on 4K, 3 to 4x faster than odiff. Ships matchers for Jest, Vitest, Bun, plus an agent that drives visual regression from Claude Code, Cursor, and Codex.",
		url: "https://blazediff.dev",
		siteName: "BlazeDiff",
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "BlazeDiff. Open-source image diff for CI, in Rust.",
		description:
			"Open-source image and object diffing. Rust core with SIMD. Up to 8x faster than pixelmatch on 4K, 3 to 4x faster than odiff. Ships matchers for Jest, Vitest, Bun, plus an agent that drives visual regression from Claude Code, Cursor, and Codex.",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	icons: {
		icon: "/favicon.ico",
		shortcut: "/favicon-16x16.png",
		apple: "/apple-touch-icon.png",
		other: [
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				url: "/favicon-16x16.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				url: "/favicon-32x32.png",
			},
		],
	},
	manifest: "/site.webmanifest",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			dir="ltr"
			className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable}`}
			suppressHydrationWarning
		>
			<Head />
			<body>{children}</body>
		</html>
	);
}
