import { IconBrandGithub } from "@tabler/icons-react";
import { Roboto_Mono } from "next/font/google";
import Image from "next/image";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "./global.css";

const suse = Roboto_Mono({
	subsets: ["latin"],
});

export const metadata = {
	title: {
		default: "BlazeDiff - High-Performance Image Comparison",
		template: "%s | BlazeDiff",
	},
	description:
		"BlazeDiff is a high-performance image comparison ecosystem. Built with cutting-edge algorithms and optimized for speed, BlazeDiff provides tools for comparing content, visualizing differences, and integrating diff functionality into your applications.",
	keywords: [
		"image comparison",
		"diff",
		"pixelmatch",
		"visual testing",
		"image diff",
		"blazediff",
		"typescript",
		"react",
	],
	authors: [{ name: "Teimur Gasanov" }],
	creator: "Teimur Gasanov",
	publisher: "Teimur Gasanov",
	openGraph: {
		title: "BlazeDiff - High-Performance Image Comparison",
		description:
			"High-performance image comparison library. 1.5x faster than pixelmatch while maintaining identical accuracy.",
		url: "https://blazediff.dev",
		siteName: "BlazeDiff",
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "BlazeDiff - High-Performance Image Comparison",
		description:
			"High-performance image comparison library. 1.5x faster than pixelmatch while maintaining identical accuracy.",
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

const navbar = (
	<Navbar
		logo={<Image src="/logo.png" alt="BlazeDiff" width={48} height={48} />}
		projectIcon={<IconBrandGithub />}
		projectLink="https://github.com/teimurjan/blazediff"
	/>
);
const footer = <Footer>MIT {new Date().getFullYear()} © BlazeDiff.</Footer>;

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			dir="ltr"
			className={suse.className}
			suppressHydrationWarning
		>
			<Head />
			<body>
				<Layout
					navbar={navbar}
					pageMap={await getPageMap()}
					docsRepositoryBase="https://github.com/teimurjan/blazediff/tree/main/packages/website"
					footer={footer}
					copyPageButton={false}
				>
					{children}
				</Layout>
			</body>
		</html>
	);
}
