import { getPageMap } from "nextra/page-map";
import NextraShell from "../../components/landing/nextra-shell";

// A hidden top-level page gets no sidebar, so here `vs` becomes a plain doc
// folder: its pages fill the sidebar and it still stays out of the navbar.
async function vsPageMap() {
	const pageMap = await getPageMap();
	return pageMap.map((item) =>
		"data" in item
			? { ...item, data: { ...item.data, vs: { title: "Compare" } } }
			: item,
	);
}

export default async function VsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <NextraShell pageMap={await vsPageMap()}>{children}</NextraShell>;
}
