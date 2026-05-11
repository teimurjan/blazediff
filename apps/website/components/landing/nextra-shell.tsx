import { IconBrandGithub } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { Banner } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";

const banner = (
	<Banner storageKey="interpret-launch">
		<Link href="/docs/core-native">
			New: <b className="text-blue-400">@blazediff/core-native</b> now includes
			interpret - structured diff analysis to understand what changed. Read more
			→
		</Link>
	</Banner>
);

const navbar = (
	<Navbar
		logo={<Image src="/logo.png" alt="BlazeDiff" width={48} height={48} />}
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
		>
			<div className="max-w-7xl m-auto">{children}</div>
		</Layout>
	);
}
