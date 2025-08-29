const supportsColor = process.stdout.isTTY && process.env.TERM !== "dumb";

const colors = supportsColor
  ? {
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      red: "\x1b[31m",
      reset: "\x1b[0m",
      bold: "\x1b[1m",
    }
  : {
      green: "",
      yellow: "",
      red: "",
      reset: "",
      bold: "",
    };

export function logInfo(message: string): void {
  console.log(`${colors.bold}[INFO]${colors.reset} ${message}`);
}

export function logSuccess(message: string): void {
  console.log(
    `${colors.green}${colors.bold}[SUCCESS]${colors.reset} ${message}`
  );
}

export function logWarning(message: string): void {
  console.log(
    `${colors.yellow}${colors.bold}[WARNING]${colors.reset} ${message}`
  );
}

export function logError(message: string): void {
  console.log(`${colors.red}${colors.bold}[ERROR]${colors.reset} ${message}`);
}

export function logProgress(message: string): void {
  console.log(`${colors.bold}[PROGRESS]${colors.reset} ${message}`);
}
