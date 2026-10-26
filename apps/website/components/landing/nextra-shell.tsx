import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import type { PageMapItem } from "nextra";
import { Banner } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import Picture, { sizesForHeight } from "./picture";

const banner = (
	<Banner storageKey="codec-png-launch">
		New:{" "}
		<Link href="/vs/spng" className="underline underline-offset-2">
			<b className="text-blue-400">codec-png-native</b>
		</Link>{" "}
		and{" "}
		<Link href="/vs/jsquash" className="underline underline-offset-2">
			<b className="text-blue-400">codec-png-wasm</b>
		</Link>{" "}
		bring the blazediff-png codec to Node and WebAssembly, faster than spng and
		jSquash. Read more →
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
	pageMap,
}: {
	children: React.ReactNode;
	/** Defaults to the whole site's page map. */
	pageMap?: PageMapItem[];
}) {
	return (
		<Layout
			banner={banner}
			navbar={navbar}
			pageMap={pageMap ?? (await getPageMap())}
			docsRepositoryBase="https://github.com/teimurjan/blazediff/tree/main/apps/website"
			footer={footer}
			darkMode={false}
			nextThemes={{ forcedTheme: "dark" }}
		>
			<div className="max-w-7xl m-auto">{children}</div>
		</Layout>
	);
}
