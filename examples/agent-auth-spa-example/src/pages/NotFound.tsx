import { Link } from "react-router-dom";

export default function NotFound() {
	return (
		<div className="flex min-h-full items-center justify-center bg-slate-100 p-10">
			<div className="text-center">
				<div className="text-sm font-medium uppercase tracking-wide text-slate-500">
					404
				</div>
				<h1 className="mt-2 text-3xl font-semibold text-slate-900">
					Page not found
				</h1>
				<p className="mt-2 text-slate-600">
					The page you're looking for doesn't exist.
				</p>
				<Link
					to="/"
					className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
				>
					Back to home
				</Link>
			</div>
		</div>
	);
}
