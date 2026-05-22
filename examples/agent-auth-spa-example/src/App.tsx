import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import About from "./pages/About";
import Analytics from "./pages/Analytics";
import Billing from "./pages/Billing";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Projects from "./pages/Projects";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Team from "./pages/Team";

function withLayout(node: React.ReactNode) {
	return <Layout>{node}</Layout>;
}

function gated(node: React.ReactNode) {
	return <ProtectedRoute>{withLayout(node)}</ProtectedRoute>;
}

export default function App() {
	return (
		<Routes>
			<Route path="/" element={withLayout(<Home />)} />
			<Route path="/about" element={withLayout(<About />)} />
			<Route path="/login" element={<Login />} />
			<Route path="/dashboard" element={gated(<Dashboard />)} />
			<Route path="/profile" element={gated(<Profile />)} />
			<Route path="/settings" element={gated(<Settings />)} />
			<Route path="/billing" element={gated(<Billing />)} />
			<Route path="/team" element={gated(<Team />)} />
			<Route path="/projects" element={gated(<Projects />)} />
			<Route path="/reports" element={gated(<Reports />)} />
			<Route path="/analytics" element={gated(<Analytics />)} />
			<Route path="*" element={<NotFound />} />
		</Routes>
	);
}
