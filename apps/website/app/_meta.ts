export default {
	index: {
		title: "Home",
		type: "page",
		display: "hidden",
		theme: {
			toc: false,
			copyPage: false,
			layout: "full",
		},
	},
	agent: {
		title: "Agent",
		type: "page",
		display: "hidden",
		theme: {
			toc: false,
			copyPage: false,
			layout: "full",
		},
	},
	playground: {
		title: "Playground",
		type: "page",
		display: "hidden",
		theme: {
			toc: false,
			copyPage: false,
			layout: "full",
		},
	},
	docs: {
		title: "Docs",
		type: "page",
	},
	guides: {
		title: "Guides",
		type: "page",
	},
	apis: {
		title: "APIs",
		type: "page",
	},
	// Out of the navbar and other sidebars; app/vs/layout.tsx shows it to itself.
	vs: {
		title: "Compare",
		type: "page",
		display: "hidden",
	},
	benchmarks: {
		title: "Benchmarks",
		type: "page",
		display: "hidden",
		theme: {
			toc: false,
			copyPage: false,
			layout: "full",
		},
	},
	llms: {
		title: "LLMs",
		type: "page",
		href: "/llms.txt",
	},
};
