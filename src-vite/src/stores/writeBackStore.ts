import { create } from 'zustand';

type WriteBackStore = {
  /**
   * How many files refused the last write-back of deferred edits. Kept in memory
   * only: after a restart those files simply show up as pending again.
   */
  failedCount: number;
  setFailedCount: (count: number) => void;
};

export const useWriteBackStore = create<WriteBackStore>()((set) => ({
  failedCount: 0,
  setFailedCount: (failedCount) => set({ failedCount }),
}));
