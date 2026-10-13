import type { LoggerService } from '@nestjs/common';

// Never serialize arbitrary messages, Error instances, headers or request data.
export class SafeLogger implements LoggerService {
  event(event: string, fields: Record<string, string | number | boolean> = {}) {
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...fields,
      }) + '\n',
    );
  }
  log() {
    this.event('framework_info');
  }
  error() {
    this.event('framework_error');
  }
  warn() {
    this.event('framework_warning');
  }
  debug() {
    /* intentionally no verbose framework payloads */
  }
  verbose() {
    /* intentionally no verbose framework payloads */
  }
}
