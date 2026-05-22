import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthed } from "../auth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
	const location = useLocation();
	if (!isAuthed()) {
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}
	return <>{children}</>;
}
