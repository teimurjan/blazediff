/** @type {import('jest').Config} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	testMatch: ["**/*.test.ts"],
	moduleFileExtensions: ["ts", "js"],
	transform: {
		"^.+\\.ts$": [
			"ts-jest",
			{
				useESM: false,
			},
		],
	},
	setupFilesAfterEnv: ["<rootDir>/src/index.ts"],
};
