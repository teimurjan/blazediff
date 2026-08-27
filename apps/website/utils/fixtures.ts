// The repo's committed fixtures, served straight off GitHub raw. `fixtures/`
// is plain git (not LFS) and raw.githubusercontent.com sends
// `access-control-allow-origin: *`, so these decode into a canvas untainted.

export const RAW_FIXTURES =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures";

export const fixtureUrl = (group: string, file: string) =>
	`${RAW_FIXTURES}/${group}/${file}`;
