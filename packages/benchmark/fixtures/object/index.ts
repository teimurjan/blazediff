import type { ObjectPair } from "../../src/object-types";

export const objectPairs: ObjectPair[] = [
	{
		a: { name: "John", age: 30, city: "New York" },
		b: { name: "John", age: 31, city: "New York" },
		name: "simple object - age change",
	},
	{
		a: { name: "John", age: 30, city: "New York" },
		b: { name: "John", age: 30, city: "New York" },
		name: "simple object - identical",
	},
	{
		a: {
			user: {
				name: "John",
				profile: { age: 30, settings: { theme: "dark", notifications: true } },
			},
			posts: [
				{ id: 1, title: "Hello" },
				{ id: 2, title: "World" },
			],
		},
		b: {
			user: {
				name: "John",
				profile: { age: 30, settings: { theme: "light", notifications: true } },
			},
			posts: [
				{ id: 1, title: "Hello" },
				{ id: 2, title: "World" },
			],
		},
		name: "nested object - theme change",
	},
	{
		a: {
			users: Array.from({ length: 1000 }, (_, i) => ({
				id: i,
				name: `User${i}`,
				active: true,
			})),
		},
		b: {
			users: Array.from({ length: 1000 }, (_, i) => ({
				id: i,
				name: `User${i}`,
				active: i !== 50,
			})),
		},
		name: "large array - single item change",
	},
	{
		a: {
			config: {
				api: { endpoint: "https://api.example.com", timeout: 5000 },
				ui: { theme: "dark", lang: "en" },
				features: { analytics: true, beta: false },
			},
		},
		b: {
			config: {
				api: { endpoint: "https://api.example.com", timeout: 3000 },
				ui: { theme: "dark", lang: "en" },
				features: { analytics: true, beta: false },
			},
		},
		name: "deep nested - timeout change",
	},
	{
		a: { items: Array.from({ length: 1000 }, (_, i) => i) },
		b: { items: Array.from({ length: 1000 }, (_, i) => i) },
		name: "large identical arrays",
	},
	{
		a: {
			metadata: {
				created: "2023-01-01",
				tags: ["react", "typescript", "web"],
				author: { name: "John", email: "john@example.com" },
			},
			content: {
				title: "My Post",
				body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
				comments: [
					{ user: "Alice", text: "Great post!" },
					{ user: "Bob", text: "Thanks for sharing" },
				],
			},
		},
		b: {
			metadata: {
				created: "2023-01-01",
				tags: ["react", "typescript", "web", "frontend"],
				author: { name: "John", email: "john@example.com" },
			},
			content: {
				title: "My Post",
				body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
				comments: [
					{ user: "Alice", text: "Great post!" },
					{ user: "Bob", text: "Thanks for sharing" },
				],
			},
		},
		name: "complex object - tag addition",
	},
	{
		a: {
			company: {
				name: "TechCorp",
				departments: {
					engineering: {
						teams: {
							frontend: {
								members: Array.from({ length: 20 }, (_, i) => ({
									id: `fe-${i}`,
									name: `Frontend Dev ${i}`,
									skills: ["React", "TypeScript", "CSS"],
									projects: {
										current: { name: "Dashboard", progress: 75 },
										past: Array.from({ length: 5 }, (_, j) => ({
											name: `Project ${j}`,
											completed: true,
										})),
									},
								})),
							},
							backend: {
								members: Array.from({ length: 15 }, (_, i) => ({
									id: `be-${i}`,
									name: `Backend Dev ${i}`,
									skills: ["Node.js", "PostgreSQL", "Redis"],
									projects: {
										current: { name: "API v2", progress: 60 },
										past: Array.from({ length: 3 }, (_, j) => ({
											name: `Service ${j}`,
											completed: true,
										})),
									},
								})),
							},
							devops: {
								members: Array.from({ length: 10 }, (_, i) => ({
									id: `do-${i}`,
									name: `DevOps Engineer ${i}`,
									skills: ["Docker", "Kubernetes", "AWS"],
									infrastructure: {
										servers: Array.from({ length: 50 }, (_, j) => ({
											id: `srv-${j}`,
											region: ["us-west", "us-east", "eu-central"][j % 3],
											status: "active",
										})),
									},
								})),
							},
						},
						budget: {
							quarterly: Array.from({ length: 4 }, (_, i) => ({
								q: i + 1,
								allocated: 500000,
								spent: 450000 + i * 10000,
								categories: {
									salaries: 300000,
									infrastructure: 100000,
									tools: 50000,
									training: 50000,
								},
							})),
						},
					},
					marketing: {
						campaigns: Array.from({ length: 100 }, (_, i) => ({
							id: `camp-${i}`,
							name: `Campaign ${i}`,
							channels: ["social", "email", "display"],
							metrics: {
								impressions: 100000 + i * 1000,
								clicks: 1000 + i * 10,
								conversions: 10 + i,
							},
						})),
					},
					hr: {
						employees: Array.from({ length: 500 }, (_, i) => ({
							id: `emp-${i}`,
							details: {
								personal: {
									name: `Employee ${i}`,
									department: ["engineering", "marketing", "hr", "finance"][
										i % 4
									],
									level: ["junior", "mid", "senior", "lead"][i % 4],
								},
								compensation: {
									salary: 50000 + i * 1000,
									bonus: 5000 + i * 100,
									stock: { units: 100 + i, vesting: "4 years" },
								},
								performance: {
									reviews: Array.from({ length: 3 }, (_, j) => ({
										year: 2021 + j,
										rating: 3.5 + j * 0.3,
										feedback: `Review ${j}`,
									})),
								},
							},
						})),
					},
				},
				locations: {
					headquarters: {
						address: "123 Tech Street",
						city: "San Francisco",
						employees: 1000,
						facilities: ["gym", "cafeteria", "parking"],
					},
					branches: Array.from({ length: 10 }, (_, i) => ({
						id: `branch-${i}`,
						city: `City ${i}`,
						employees: 50 + i * 10,
						established: 2015 + i,
					})),
				},
			},
		},
		b: {
			company: {
				name: "TechCorp",
				departments: {
					engineering: {
						teams: {
							frontend: {
								members: Array.from({ length: 20 }, (_, i) => ({
									id: `fe-${i}`,
									name: `Frontend Dev ${i}`,
									skills: [
										"React",
										"TypeScript",
										"CSS",
										i === 5 ? "Vue" : null,
									].filter(Boolean),
									projects: {
										current: {
											name: "Dashboard",
											progress: i === 10 ? 80 : 75,
										},
										past: Array.from({ length: 5 }, (_, j) => ({
											name: `Project ${j}`,
											completed: true,
										})),
									},
								})),
							},
							backend: {
								members: Array.from({ length: 15 }, (_, i) => ({
									id: `be-${i}`,
									name: `Backend Dev ${i}`,
									skills: ["Node.js", "PostgreSQL", "Redis"],
									projects: {
										current: { name: "API v2", progress: 60 },
										past: Array.from({ length: 3 }, (_, j) => ({
											name: `Service ${j}`,
											completed: true,
										})),
									},
								})),
							},
							devops: {
								members: Array.from({ length: 10 }, (_, i) => ({
									id: `do-${i}`,
									name: `DevOps Engineer ${i}`,
									skills: ["Docker", "Kubernetes", "AWS"],
									infrastructure: {
										servers: Array.from({ length: 50 }, (_, j) => ({
											id: `srv-${j}`,
											region: ["us-west", "us-east", "eu-central"][j % 3],
											status: j === 25 ? "maintenance" : "active",
										})),
									},
								})),
							},
						},
						budget: {
							quarterly: Array.from({ length: 4 }, (_, i) => ({
								q: i + 1,
								allocated: 500000,
								spent: 450000 + i * 10000,
								categories: {
									salaries: 300000,
									infrastructure: i === 2 ? 120000 : 100000,
									tools: 50000,
									training: i === 2 ? 30000 : 50000,
								},
							})),
						},
					},
					marketing: {
						campaigns: Array.from({ length: 100 }, (_, i) => ({
							id: `camp-${i}`,
							name: `Campaign ${i}`,
							channels: ["social", "email", "display"],
							metrics: {
								impressions: 100000 + i * 1000,
								clicks: 1000 + i * 10,
								conversions: 10 + i,
							},
						})),
					},
					hr: {
						employees: Array.from({ length: 500 }, (_, i) => ({
							id: `emp-${i}`,
							details: {
								personal: {
									name: `Employee ${i}`,
									department: ["engineering", "marketing", "hr", "finance"][
										i % 4
									],
									level:
										i === 250
											? "principal"
											: ["junior", "mid", "senior", "lead"][i % 4],
								},
								compensation: {
									salary: 50000 + i * 1000,
									bonus: 5000 + i * 100,
									stock: { units: 100 + i, vesting: "4 years" },
								},
								performance: {
									reviews: Array.from({ length: 3 }, (_, j) => ({
										year: 2021 + j,
										rating: 3.5 + j * 0.3,
										feedback: `Review ${j}`,
									})),
								},
							},
						})),
					},
				},
				locations: {
					headquarters: {
						address: "123 Tech Street",
						city: "San Francisco",
						employees: 1000,
						facilities: ["gym", "cafeteria", "parking", "game-room"],
					},
					branches: Array.from({ length: 10 }, (_, i) => ({
						id: `branch-${i}`,
						city: `City ${i}`,
						employees: 50 + i * 10,
						established: 2015 + i,
					})),
				},
			},
		},
		name: "large nested object - multiple small changes",
	},
];
