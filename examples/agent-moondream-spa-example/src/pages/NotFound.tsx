import { Link } from "react-router-dom";

export default function NotFound() {
	return (
		<div className="flex flex-col items-center py-20 text-center">
			<div className="text-sm font-semibold uppercase tracking-widest text-indigo-500">
				404
			</div>
			<h1 className="mt-2 text-3xl font-semibold text-indigo-950">
				No object at that key
			</h1>
			<p className="mt-2 text-indigo-900/60">
				The page you're looking for doesn't exist.
			</p>
			<Link
				to="/"
				className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
			>
				Back to home
			</Link>
		</div>
	);
}
