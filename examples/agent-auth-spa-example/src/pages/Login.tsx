import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../auth";

interface FromState {
	from?: string;
}

export default function Login() {
	const navigate = useNavigate();
	const location = useLocation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!login(email, password)) {
			setError("Email and password are required.");
			return;
		}
		const from = (location.state as FromState | null)?.from ?? "/dashboard";
		navigate(from, { replace: true });
	}

	return (
		<div className="flex min-h-full items-center justify-center bg-slate-100">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
				noValidate
			>
				<h1 className="mb-1 text-2xl font-semibold text-slate-900">
					Sign in to Acme
				</h1>
				<p className="mb-6 text-sm text-slate-500">
					Any non-empty email and password are accepted.
				</p>

				<label className="mb-4 block">
					<span className="mb-1 block text-sm font-medium text-slate-700">
						Email
					</span>
					<input
						name="email"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
					/>
				</label>

				<label className="mb-6 block">
					<span className="mb-1 block text-sm font-medium text-slate-700">
						Password
					</span>
					<input
						name="password"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
					/>
				</label>

				{error ? (
					<div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
						{error}
					</div>
				) : null}

				<button
					type="submit"
					className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
				>
					Sign in
				</button>
			</form>
		</div>
	);
}
