import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import { Banner } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import Picture, { sizesForHeight } from "./picture";

const banner = (
	<Banner storageKey="ssim-interpret-native-launch">
		New:{" "}
		<Link href="/apis/ssim-native" className="underline underline-offset-2">
			<b className="text-blue-400">ssim-native</b>
		</Link>{" "}
		brings SSIM, MS-SSIM and Hitchhiker&apos;s to Node, and{" "}
		<Link
			href="/apis/interpret-native"
			className="underline underline-offset-2"
		>
			<b className="text-blue-400">interpret-native</b>
		</Link>{" "}
		ships diff interpretation on its own. Read more →
	</Banner>
);

const navbar = (
	<Navbar
		logo={
			<Picture
				src="/logo.png"
				alt="BlazeDiff"
				sizes={sizesForHeight("/logo.png", 48)}
				loading="eager"
				className="h-12 w-12"
			/>
		}
		projectIcon={<IconBrandGithub />}
		projectLink="https://github.com/teimurjan/blazediff"
	/>
);

const footer = <Footer>MIT {new Date().getFullYear()} © BlazeDiff.</Footer>;

export default async function NextraShell({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Layout
			banner={banner}
			navbar={navbar}
			pageMap={await getPageMap()}
			docsRepositoryBase="https://github.com/teimurjan/blazediff/tree/main/apps/website"
			footer={footer}
			darkMode={false}
			nextThemes={{ forcedTheme: "dark" }}
		>
			<div className="max-w-7xl m-auto">{children}</div>
		</Layout>
	);
}
