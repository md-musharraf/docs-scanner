type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

class Logger {
  private inMemoryLogs: LogEntry[] = [];
  private maxLogs = 100;
  private timers: Map<string, number> = new Map();

  private formatTimestamp(): string {
    return new Date().toISOString().slice(11, 23);
  }

  private addLog(level: LogLevel, tag: string, message: string, data?: unknown) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      tag,
      message,
      data,
    };

    this.inMemoryLogs.push(entry);
    if (this.inMemoryLogs.length > this.maxLogs) {
      this.inMemoryLogs.shift();
    }

    const prefix = `[${entry.timestamp}] [${level}] [${tag}]:`;
    if (level === 'ERROR') {
      console.error(prefix, message, data !== undefined ? data : '');
    } else if (level === 'WARN') {
      console.warn(prefix, message, data !== undefined ? data : '');
    } else if (level === 'INFO') {
      console.info(prefix, message, data !== undefined ? data : '');
    } else {
      console.debug(prefix, message, data !== undefined ? data : '');
    }
  }

  debug(tag: string, message: string, data?: unknown) {
    this.addLog('DEBUG', tag, message, data);
  }

  info(tag: string, message: string, data?: unknown) {
    this.addLog('INFO', tag, message, data);
  }

  warn(tag: string, message: string, data?: unknown) {
    this.addLog('WARN', tag, message, data);
  }

  error(tag: string, message: string, error?: unknown) {
    this.addLog('ERROR', tag, message, error);
  }

  time(label: string) {
    this.timers.set(label, performance.now());
  }

  timeEnd(tag: string, label: string) {
    const start = this.timers.get(label);
    if (start !== undefined) {
      const elapsed = (performance.now() - start).toFixed(2);
      this.timers.delete(label);
      this.info(tag, `${label} completed in ${elapsed}ms`);
      return Number(elapsed);
    }
    return 0;
  }

  getRecentLogs(): LogEntry[] {
    return [...this.inMemoryLogs];
  }

  clearLogs() {
    this.inMemoryLogs = [];
  }
}

export const logger = new Logger();
