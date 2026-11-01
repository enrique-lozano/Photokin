import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from '@/components/ui/toast';

const HISTORY_LIMIT = 20;

type RecentSearchesState = {
  queries: string[];
  record: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
};

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      queries: [],
      record: (query) => {
        const text = query.trim();
        if (text)
          set((state) => ({
            queries: [text, ...state.queries.filter((entry) => entry !== text)].slice(0, HISTORY_LIMIT),
          }));
      },
      remove: (query) => set((state) => ({ queries: state.queries.filter((entry) => entry !== query) })),
      clear: () => set({ queries: [] }),
    }),
    {
      name: 'photokin-recent-searches',
      version: 1,
      partialize: (state) => ({ queries: state.queries }),
      merge: (saved, current) => {
        if (saved === undefined) return current;
        if (
          !saved ||
          typeof saved !== 'object' ||
          !('queries' in saved) ||
          !Array.isArray(saved.queries) ||
          !saved.queries.every((query): query is string => typeof query === 'string')
        )
          throw new Error('Invalid recent search history.');
        return {
          ...current,
          queries: [...new Set(saved.queries.map((query) => query.trim()).filter(Boolean))].slice(
            0,
            HISTORY_LIMIT,
          ),
        };
      },
      storage: createJSONStorage(() => ({
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => {
          try {
            localStorage.setItem(key, value);
          } catch {
            toast.error(
              'Could not save recent searches. History changes will not survive restarting Photokin.',
            );
          }
        },
        removeItem: (key) => localStorage.removeItem(key),
      })),
      onRehydrateStorage: () => (_state, error) => {
        if (error) toast.error('Could not load recent searches.');
      },
    },
  ),
);
