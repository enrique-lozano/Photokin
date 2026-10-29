import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityAutosave } from './identityAutosave';

afterEach(() => vi.useRealTimers());
const empty = { title: '', description: '' };
describe('identity autosave', () => {
  it('debounces keystrokes and flushes both fields together', async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue(undefined);
    const save = new IdentityAutosave(empty, write);
    save.edit('title', 'One');
    await vi.advanceTimersByTimeAsync(1000);
    save.edit('description', 'Two');
    await vi.advanceTimersByTimeAsync(1499);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ title: 'One', description: 'Two' });
    expect(save.state.status).toBe('saved');
  });
  it('coalesces waiting writes behind an in-flight save', async () => {
    let resolve: () => void = () => {};
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(undefined);
    const save = new IdentityAutosave(empty, write);
    save.edit('title', 'First');
    save.flush();
    save.edit('title', 'Second');
    save.flush();
    save.edit('title', 'Latest');
    save.flush();
    expect(write).toHaveBeenCalledTimes(1);
    resolve();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1][0].title).toBe('Latest');
  });
  it('flushes on unsubscribe (photo navigation or panel unmount)', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const save = new IdentityAutosave(empty, write);
    const unsubscribe = save.subscribe(() => {});
    save.edit('description', 'Draft');
    unsubscribe();
    expect(write).toHaveBeenCalledWith({ title: '', description: 'Draft' });
  });
  it('retains failed edits for retry, without accepting background refreshes', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('Read-only folder')).mockResolvedValue(undefined);
    const save = new IdentityAutosave(empty, write);
    save.edit('title', 'Keep');
    save.flush();
    await vi.waitFor(() => expect(save.state.status).toBe('error'));
    save.refresh(empty);
    expect(save.state.draft.title).toBe('Keep');
    save.flush();
    await vi.waitFor(() => expect(save.state.status).toBe('saved'));
    expect(write).toHaveBeenCalledTimes(2);
  });
  it('Escape reverts only its field to the last saved value', async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue(undefined);
    const save = new IdentityAutosave({ title: 'Saved', description: '' }, write);
    save.edit('title', 'Discard');
    save.revert('title');
    await vi.advanceTimersByTimeAsync(1500);
    expect(save.state.draft.title).toBe('Saved');
    expect(write).not.toHaveBeenCalled();
  });
});
