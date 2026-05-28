export function PageHeader({
	eyebrow,
	title,
	subtitle,
}: {
	eyebrow?: string;
	title: string;
	subtitle?: string;
}) {
	return (
		<header className="mb-10">
			{eyebrow ? (
				<div className="mb-2 text-xs font-semibold uppercase tracking-widest text-indigo-500">
					{eyebrow}
				</div>
			) : null}
			<h1 className="text-3xl font-semibold tracking-tight text-indigo-950">
				{title}
			</h1>
			{subtitle ? (
				<p className="mt-3 max-w-2xl text-indigo-900/70">{subtitle}</p>
			) : null}
		</header>
	);
}
