import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Changelog from "./pages/Changelog";
import Docs from "./pages/Docs";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import Status from "./pages/Status";

function withLayout(node: React.ReactNode) {
	return <Layout>{node}</Layout>;
}

export default function App() {
	return (
		<Routes>
			<Route path="/" element={withLayout(<Home />)} />
			<Route path="/pricing" element={withLayout(<Pricing />)} />
			<Route path="/docs" element={withLayout(<Docs />)} />
			<Route path="/changelog" element={withLayout(<Changelog />)} />
			<Route path="/status" element={withLayout(<Status />)} />
			<Route path="*" element={withLayout(<NotFound />)} />
		</Routes>
	);
}
