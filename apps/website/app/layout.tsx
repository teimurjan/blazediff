import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";
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

const TITLE = "BlazeDiff. Visual regression with an agent-in-the-loop.";
const DESCRIPTION =
	"Open-source visual regression for JS. Deterministic Rust + JS diff cores (3 to 8x faster than pixelmatch and odiff on 4K), SSIM/GMSD metrics, and an agent that hands ambiguous diffs to Claude Code, Cursor, or Codex. No SaaS, no API key.";

export const metadata = {
	title: {
		default: TITLE,
		template: "%s | BlazeDiff",
	},
	description: DESCRIPTION,
	keywords: [
		"image comparison",
		"visual regression",
		"visual testing",
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
		"claude code skill",
		"cursor",
		"cursor rule",
		"codex",
		"coding agent",
	],
	authors: [{ name: "Teimur Gasanov" }],
	creator: "Teimur Gasanov",
	publisher: "Teimur Gasanov",
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://blazediff.dev",
		siteName: "BlazeDiff",
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
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

export const viewport = {
	themeColor: "#0a0a0f",
	colorScheme: "dark",
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
			<Head backgroundColor={{ light: "#0a0a0f", dark: "#0a0a0f" }} />
			<body>{children}</body>
			<Script
				defer
				src="https://cloud.umami.is/script.js"
				data-website-id="8fc50eb6-4b08-4aed-97a1-61440b3284dc"
				strategy="afterInteractive"
			/>
		</html>
	);
}
