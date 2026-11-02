import { toast } from '@/components/ui/toast';
import { startBackgroundIndexing } from '@/media/smartSearch/indexing';
import { observeSmartSearchChanges } from '@/media/smartSearch/lifecycle';
import { emitTo, listen } from '@tauri-apps/api/event';

const TASK_REQUEST_EVENT = 'app://background-task';
const tasks = {
  'reindex-smart-search': () => startBackgroundIndexing({ rebuild: true }),
};

export type BackgroundTask = keyof typeof tasks;

export function requestBackgroundTask(task: BackgroundTask): Promise<void> {
  return emitTo('main', TASK_REQUEST_EVENT, task);
}

export function initBackgroundTasks(): void {
  void observeSmartSearchChanges().catch((error) => {
    toast.error(`Could not observe smart search changes: ${String(error)}`);
  });
  void listen<BackgroundTask>(TASK_REQUEST_EVENT, ({ payload }) => {
    if (!Object.hasOwn(tasks, payload)) return;
    void Promise.resolve()
      .then(() => tasks[payload]())
      .catch((error) => {
        toast.error(`Could not start background task: ${String(error)}`);
      });
  }).catch((error) => {
    toast.error(`Could not receive background tasks: ${String(error)}`);
  });
}
