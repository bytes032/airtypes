import { consola } from 'consola';
import pc from 'picocolors';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type LogOptions = {
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  plain: boolean;
  color?: boolean;
};

export type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

const formatArgs = (args: unknown[]): string => {
  if (args.length === 0) return '';
  return args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' ');
};

export const createLogger = (options: LogOptions): Logger => {
  const isJson = options.json;
  const isQuiet = options.quiet;
  const isVerbose = options.verbose;
  const hasColor =
    options.color !== false && !options.plain && pc.isColorSupported && typeof process.env.NO_COLOR === 'undefined';

  const color = hasColor ? (value: string) => pc.cyan(value) : (value: string) => value;
  const warnColor = hasColor ? (value: string) => pc.yellow(value) : (value: string) => value;
  const errorColor = hasColor ? (value: string) => pc.red(value) : (value: string) => value;

  const shouldLog = (level: LogLevel): boolean => {
    if (level === 'error') return true;
    if (isQuiet) return false;
    if (isJson && !isVerbose) return false;
    if (level === 'debug' && !isVerbose) return false;
    return true;
  };

  const base = consola.create({ stdout: process.stderr, stderr: process.stderr }).withTag('airtypes');

  const write = (level: LogLevel, ...args: unknown[]): void => {
    if (!shouldLog(level)) return;
    const message = formatArgs(args);
    if (!message) return;

    switch (level) {
      case 'info':
        base.info(color(message));
        break;
      case 'warn':
        base.warn(warnColor(message));
        break;
      case 'error':
        base.error(errorColor(message));
        break;
      case 'debug':
        base.debug(color(message));
        break;
      default:
        base.info(message);
        break;
    }
  };

  return {
    info: (...args) => write('info', ...args),
    warn: (...args) => write('warn', ...args),
    error: (...args) => write('error', ...args),
    debug: (...args) => write('debug', ...args),
  };
};
