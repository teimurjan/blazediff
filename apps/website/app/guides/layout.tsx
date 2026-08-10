import NextraShell from "../../components/landing/nextra-shell";

export default function GuidesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <NextraShell>{children}</NextraShell>;
}
