/**
 * Logging utilities for consistent output across MCP servers
 */

/**
 * ANSI color codes for terminal output
 */
export const Colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright foreground colors
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const;

/**
 * Box-drawing characters for visual structure
 */
export const BoxChars = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  verticalRight: "├",
  verticalLeft: "┤",
  horizontalDown: "┬",
  horizontalUp: "┴",
  cross: "┼",
} as const;

const EST_TIME_ZONE = "America/New_York";
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EST_TIME_ZONE,
  hour12: true,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EST_TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
});

export function formatEstTimestamp(date: Date = new Date()): string {
  const timePart = timeFormatter.format(date);
  const datePart = dateFormatter.format(date);
  return `${timePart} | ${datePart}`;
}

/**
 * Log level enum for type safety
 */
export enum LogLevel {
  ERROR = "ERROR",
  WARN = "WARN",
  INFO = "INFO",
  DEBUG = "DEBUG",
}

/**
 * Metadata type for structured logging context
 */
export type LogMetadata = Record<string, unknown>;

/**
 * Check if colors should be disabled based on environment variables
 *
 * Respects NO_COLOR, FORCE_COLOR environment variables and TTY detection
 *
 * @returns {boolean} True if colors should be used, false otherwise
 */
function shouldUseColors(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (!process.stdout.isTTY && process.env.FORCE_COLOR !== "1") return false;
  return true;
}

/**
 * Apply ANSI color codes to text if colors are enabled
 *
 * @param {string} text - The text to colorize
 * @param {string[]} colors - One or more ANSI color codes from Colors constant
 * @returns {string} Colorized text with reset code, or plain text if colors disabled
 */
export function colorize(text: string, ...colors: string[]): string {
  if (!shouldUseColors()) return text;
  const colorCodes = colors.join("");
  return `${colorCodes}${text}${Colors.reset}`;
}

/**
 * Color helpers for common statuses
 */
export const colorHelpers = {
  success: (text: string) => colorize(text, Colors.green, Colors.bold),
  error: (text: string) => colorize(text, Colors.red, Colors.bold),
  warning: (text: string) => colorize(text, Colors.yellow, Colors.bold),
  info: (text: string) => colorize(text, Colors.cyan),
  dim: (text: string) => colorize(text, Colors.dim),
  highlight: (text: string) => colorize(text, Colors.brightWhite, Colors.bold),

  checkmark: () => colorize("✓", Colors.green, Colors.bold),
  cross: () => colorize("✗", Colors.red, Colors.bold),
  bullet: () => colorize("•", Colors.cyan),
  arrow: () => colorize("→", Colors.brightBlue),
};

/**
 * Check if structured (JSON) logging is enabled
 */
function isStructuredLogging(): boolean {
  return process.env.LOG_FORMAT === "json";
}

/**
 * Format a log entry for output
 */
function formatLog(
  level: LogLevel,
  context: string,
  message: string,
  metadata?: LogMetadata,
): string {
  const timestamp = formatEstTimestamp();
  if (isStructuredLogging()) {
    const logEntry = {
      timestamp,
      level,
      context,
      message,
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
    return JSON.stringify(logEntry);
  }

  // Apply colors based on log level
  let levelColor: string;
  let levelText: string;
  switch (level) {
    case LogLevel.ERROR:
      levelColor = Colors.red + Colors.bold;
      levelText = "ERROR";
      break;
    case LogLevel.WARN:
      levelColor = Colors.yellow + Colors.bold;
      levelText = "WARN";
      break;
    case LogLevel.INFO:
      levelColor = Colors.cyan;
      levelText = "INFO";
      break;
    case LogLevel.DEBUG:
      levelColor = Colors.dim;
      levelText = "DEBUG";
      break;
  }

  const colorizedLevel = colorize(levelText, levelColor);
  const colorizedContext = colorize(context, Colors.dim);
  const metadataStr =
    metadata && Object.keys(metadata).length > 0
      ? " " + colorize(JSON.stringify(metadata), Colors.dim)
      : "";

  const colorizedTimestamp = colorize(timestamp, Colors.dim);
  return `[${colorizedTimestamp}] [${colorizedLevel}] ${colorizedContext}: ${message}${metadataStr}`;
}

/**
 * Log server startup message
 */
export function logServerStart(
  serverName: string,
  transport: string = "stdio",
  metadata?: LogMetadata,
): void {
  const message = `MCP server ${serverName} running on ${transport}`;
  if (isStructuredLogging()) {
    console.log(formatLog(LogLevel.INFO, "startup", message, metadata));
  } else {
    console.log(message);
  }
}

/**
 * Log an informational message
 */
export function logInfo(
  context: string,
  message: string,
  metadata?: LogMetadata,
): void {
  console.log(formatLog(LogLevel.INFO, context, message, metadata));
}

/**
 * Log an error with context
 */
export function logError(
  context: string,
  error: unknown,
  metadata?: LogMetadata,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(formatLog(LogLevel.ERROR, context, message, metadata));
  if (stack && !isStructuredLogging()) {
    console.error(stack);
  } else if (stack && isStructuredLogging()) {
    // Include stack in JSON format
    console.error(
      JSON.stringify({
        ...JSON.parse(formatLog(LogLevel.ERROR, context, message, metadata)),
        stack,
      }),
    );
  }
}

/**
 * Log a warning
 */
export function logWarning(
  context: string,
  message: string,
  metadata?: LogMetadata,
): void {
  console.warn(formatLog(LogLevel.WARN, context, message, metadata));
}

/**
 * Log debug information (only in development or when DEBUG is enabled)
 */
export function logDebug(
  context: string,
  message: string,
  metadata?: LogMetadata,
): void {
  if (process.env.NODE_ENV === "development" || process.env.DEBUG) {
    console.debug(formatLog(LogLevel.DEBUG, context, message, metadata));
  }
}

/**
 * Create a horizontal line for visual separation
 *
 * @param {number} width - Line width in characters (default: 80)
 * @param {string} char - Character to repeat (default: BoxChars.horizontal)
 * @returns {string} Repeated character string
 */
export function createLine(
  width: number = 80,
  char: string = BoxChars.horizontal,
): string {
  return char.repeat(width);
}

/**
 * Create a centered section header with decorative lines
 *
 * @param {string} title - Header title text
 * @param {number} width - Total width in characters (default: 80)
 * @returns {string} Colorized centered header with box-drawing lines
 */
export function createSectionHeader(title: string, width: number = 80): string {
  const titleWithPadding = ` ${title} `;
  const lineLength = Math.floor((width - titleWithPadding.length) / 2);
  const line = BoxChars.horizontal.repeat(lineLength);

  return colorize(
    `${line}${titleWithPadding}${line}`,
    Colors.cyan,
    Colors.bold,
  );
}

/**
 * Mask sensitive values for safe display (API keys, tokens, etc.)
 *
 * Shows first and last N characters with asterisks in the middle
 *
 * @param {string} value - The sensitive value to mask
 * @param {number} showChars - Number of characters to show at start/end (default: 4)
 * @returns {string} Masked value (e.g., "abcd****wxyz")
 */
export function maskSensitiveValue(
  value: string,
  showChars: number = 4,
): string {
  if (value.length === 0) return "";
  if (value.length <= showChars * 2) {
    return "*".repeat(value.length);
  }

  const start = value.substring(0, showChars);
  const end = value.substring(value.length - showChars);

  return `${start}****${end}`;
}
