export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  silent?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private silent: boolean;

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.prefix = options.prefix || '';
    this.silent = options.silent || false;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.silent) return;
    if (this.level === LogLevel.DEBUG) {
      console.debug(`${this.prefix}[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.silent) return;
    if (this.level === LogLevel.DEBUG || this.level === LogLevel.INFO) {
      console.info(`${this.prefix}[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.silent) return;
    if (this.level === LogLevel.DEBUG || this.level === LogLevel.INFO || this.level === LogLevel.WARN) {
      console.warn(`${this.prefix}[WARN] ${message}`, ...args);
    }
  }

  error(message: string, error?: Error | unknown): void {
    if (this.silent) return;
    console.error(`${this.prefix}[ERROR] ${message}`);
    if (error && this.level === LogLevel.DEBUG) {
      console.error(error);
    }
  }
}

/**
 * Creates a logger instance
 * @param options - Logger configuration options
 * @returns The logger instance
 */
export const createLogger = (options: LoggerOptions): Logger => {
  return new Logger(options);
};