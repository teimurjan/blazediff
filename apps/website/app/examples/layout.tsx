import NextraShell from "../../components/landing/nextra-shell";

export default function ExamplesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <NextraShell>{children}</NextraShell>;
}
