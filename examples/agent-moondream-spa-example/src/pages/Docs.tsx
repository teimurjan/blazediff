import { PageHeader } from "../components/PageHeader";

const NAV = [
	"Quickstart",
	"Buckets",
	"Uploading objects",
	"Signed URLs",
	"Lifecycle rules",
	"Regions",
];

export default function Docs() {
	return (
		<>
			<PageHeader eyebrow="Docs" title="Uploading objects" />
			<div className="grid grid-cols-[12rem_1fr] gap-10">
				<nav className="space-y-1 text-sm">
					{NAV.map((item, i) => (
						<div
							key={item}
							className={[
								"rounded-md px-3 py-1.5",
								i === 2
									? "bg-indigo-50 font-medium text-indigo-700"
									: "text-indigo-900/60",
							].join(" ")}
						>
							{item}
						</div>
					))}
				</nav>
				<article className="space-y-4 text-indigo-900/80">
					<p>
						An object is any blob of bytes plus its metadata. Upload one with a
						single <code className="font-mono text-indigo-700">PUT</code> to its
						key inside a bucket.
					</p>
					<pre className="overflow-x-auto rounded-lg bg-indigo-950 p-4 font-mono text-sm text-indigo-100">
						{`curl -X PUT \\
  --data-binary @photo.jpg \\
  https://api.nimbus.dev/v1/my-bucket/photo.jpg`}
					</pre>
					<p>
						Keys may contain slashes, so{" "}
						<code className="font-mono text-indigo-700">
							2024/q3/report.pdf
						</code>{" "}
						reads like a path even though buckets are flat. Listing with a
						prefix gives you folder-like browsing for free.
					</p>
					<h2 className="pt-2 text-lg font-semibold text-indigo-950">
						Content types
					</h2>
					<p>
						Nimbus infers{" "}
						<code className="font-mono text-indigo-700">Content-Type</code> from
						the extension, or you can set it explicitly with a header. The
						stored value is what edge nodes serve on read.
					</p>
				</article>
			</div>
		</>
	);
}
