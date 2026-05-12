import NextraShell from "../../components/landing/nextra-shell";

export default function DocsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <NextraShell>{children}</NextraShell>;
}
