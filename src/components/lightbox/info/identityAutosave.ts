export type Identity = { title: string; description: string };
export type IdentitySaveState = {
  draft: Identity;
  saved: Identity;
  status: 'idle' | 'saving' | 'saved' | 'error';
  error: string;
};
const equal = (first: Identity, second: Identity) =>
  first.title === second.title && first.description === second.description;

export class IdentityAutosave {
  state: IdentitySaveState;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Identity | undefined;
  private running = false;
  private listener: ((state: IdentitySaveState) => void) | undefined;

  constructor(
    initial: Identity,
    private write: (value: Identity) => Promise<void>,
  ) {
    this.state = { draft: initial, saved: initial, status: 'idle', error: '' };
  }

  subscribe(listener: (state: IdentitySaveState) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
      this.flush();
    };
  }

  edit(key: keyof Identity, value: string) {
    this._emit({ draft: { ...this.state.draft, [key]: value }, error: '' });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1500);
  }

  revert(key: keyof Identity) {
    this.edit(key, this.state.saved[key]);
  }

  refresh(value: Identity) {
    if (!this.running && !this.pending && equal(this.state.draft, this.state.saved)) {
      this._emit({ draft: value, saved: value });
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.pending = { ...this.state.draft };
    void this._drain();
  }

  private _emit(patch: Partial<IdentitySaveState>) {
    this.state = { ...this.state, ...patch };
    this.listener?.(this.state);
  }

  private async _drain() {
    if (this.running) return;
    this.running = true;
    while (this.pending) {
      const value = this.pending;
      this.pending = undefined;
      if (equal(value, this.state.saved) && this.state.status !== 'error') continue;
      this._emit({ status: 'saving', error: '' });
      try {
        await this.write(value);
        this._emit({ saved: value, status: 'saved' });
      } catch (cause) {
        this._emit({ status: 'error', error: cause instanceof Error ? cause.message : String(cause) });
        break;
      }
    }
    this.running = false;
  }
}
