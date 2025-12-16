#!/usr/bin/env node

function printUsage(): void {
	console.log(`
Usage: blazediff-cli<command> <image1> <image2> [options]

Commands:
	bin                Pixel-by-pixel comparison (Rust + SIMD) (default)
  core               Pixel-by-pixel comparison (JavaScript)
  gmsd               Gradient Magnitude Similarity Deviation metric
  ssim               Structural Similarity Index (Gaussian-based)
  msssim             Multi-Scale Structural Similarity Index
  hitchhikers-ssim   Hitchhiker's SSIM (fast, integral image-based)

Options:
  -h, --help    Show this help message

Examples:
  blazediff-cli core image1.png image2.png -o diff.png
  blazediff-cli gmsd image1.png image2.png
  blazediff-cli ssim image1.png image2.png -o ssim-map.png
  blazediff-cli msssim image1.png image2.png
  blazediff-cli hitchhikers-ssim image1.png image2.png

  # Default command (diff) if no command specified
  blazediff-cli image1.png image2.png

For command-specific help, use:
  blazediff-cli <command> --help
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
	const validCommands = ["bin", "core", "gmsd", "ssim", "msssim", "hitchhikers-ssim"];
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
			case "bin":
				await import("./commands/bin");
				break;
			case "core":
				await import("./commands/core");
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
		// Default to bin command if no command specified
		await import("./commands/bin");
	}
}

if (typeof require !== "undefined" && require.main === module) {
	main();
}
