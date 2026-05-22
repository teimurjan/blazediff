import { PageHeader } from "../components/PageHeader";

const FIELDS = [
	{ label: "Full name", value: "Test User" },
	{ label: "Email", value: "test@example.com" },
	{ label: "Role", value: "Administrator" },
	{ label: "Time zone", value: "UTC" },
	{ label: "Locale", value: "en-US" },
];

export default function Profile() {
	return (
		<>
			<PageHeader title="Profile" subtitle="Your account, frozen in time." />
			<section className="max-w-xl rounded-lg border border-slate-200 bg-white p-6">
				<dl className="divide-y divide-slate-200">
					{FIELDS.map((f) => (
						<div key={f.label} className="grid grid-cols-3 gap-4 py-3 text-sm">
							<dt className="text-slate-500">{f.label}</dt>
							<dd className="col-span-2 font-medium text-slate-900">
								{f.value}
							</dd>
						</div>
					))}
				</dl>
			</section>
		</>
	);
}
