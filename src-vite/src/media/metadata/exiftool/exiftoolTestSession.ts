import { ExifTool, ExifToolTask } from 'exiftool-vendored';
import { afterAll, beforeAll } from 'vitest';

class RawExiftoolTask extends ExifToolTask<{ stdout: string; stderr: string }> {
  private stderr = '';

  override onStderr(buffer: string | Buffer): void {
    this.stderr += buffer.toString();
    super.onStderr(buffer);
  }

  protected parse(stdout: string, error?: Error): { stdout: string; stderr: string } {
    if (error) throw error;
    return { stdout, stderr: this.stderr };
  }
}

/** Reuses a real process without the vendored library's tag mapping or write defaults. */
export function useExiftoolTestSession() {
  const session = new ExifTool({
    maxProcs: 1,
    taskRetries: 0,
    taskTimeoutMillis: 10_000,
  });

  // Cold process startup belongs to setup, not each round-trip's test budget.
  beforeAll(async () => {
    await session.version();
  }, 15_000);
  afterAll(() => session.end());

  return (args: string[]) =>
    session.enqueueTask(() => new RawExiftoolTask(['-charset', 'filename=UTF8', ...args]), false);
}
