#!/usr/bin/env node

function printUsage(): void {
	console.log(`
Usage: blazediff <command> <image1> <image2> [options]

Commands:
  diff               Pixel-by-pixel comparison (default)
  gmsd               Gradient Magnitude Similarity Deviation metric
  ssim               Structural Similarity Index (Gaussian-based)
  msssim             Multi-Scale Structural Similarity Index
  hitchhikers-ssim   Hitchhiker's SSIM (fast, integral image-based)

Options:
  -h, --help    Show this help message

Examples:
  blazediff diff image1.png image2.png -o diff.png
  blazediff gmsd image1.png image2.png
  blazediff ssim image1.png image2.png -o ssim-map.png
  blazediff msssim image1.png image2.png
  blazediff hitchhikers-ssim image1.png image2.png

  # Default command (diff) if no command specified
  blazediff image1.png image2.png

For command-specific help, use:
  blazediff <command> --help
`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		printUsage();
		process.exit(0);
	}

	const command = args[0];

	// Check if first arg is a command or a file path
	const validCommands = ["diff", "gmsd", "ssim", "msssim", "hitchhikers-ssim"];
	const isCommand = validCommands.includes(command);

	// Show main help only if help flag is passed without a command
	if ((args.includes("-h") || args.includes("--help")) && !isCommand) {
		printUsage();
		process.exit(0);
	}

	if (isCommand) {
		// Remove command from args and pass the rest
		process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];

		switch (command) {
			case "diff":
				await import("./commands/diff");
				break;
			case "gmsd":
				await import("./commands/gmsd");
				break;
			case "ssim":
				await import("./commands/ssim");
				break;
			case "msssim":
				await import("./commands/msssim");
				break;
			case "hitchhikers-ssim":
				await import("./commands/hitchhikers-ssim");
				break;
		}
	} else {
		// Default to diff command if no command specified
		await import("./commands/diff");
	}
}

if (typeof require !== "undefined" && require.main === module) {
	main();
}
