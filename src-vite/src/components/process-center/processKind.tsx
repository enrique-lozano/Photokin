import {
  IconDatabaseImport,
  IconLoader2,
  IconPhotoUp,
  IconScan,
  IconUserSearch,
  type Icon,
} from '@tabler/icons-react';
import { ProcessKind } from '../../stores/processStore';

interface ProcessKindMeta {
  icon: Icon;
  /** Short noun used in the footer summary, e.g. "import". */
  noun: string;
}

const PROCESS_KIND_META: Record<ProcessKind, ProcessKindMeta> = {
  [ProcessKind.Import]: { icon: IconPhotoUp, noun: 'import' },
  [ProcessKind.FaceDetect]: { icon: IconScan, noun: 'face detection' },
  [ProcessKind.FaceRecognize]: { icon: IconUserSearch, noun: 'face recognition' },
  [ProcessKind.Sync]: { icon: IconDatabaseImport, noun: 'sync' },
  [ProcessKind.Generic]: { icon: IconLoader2, noun: 'task' },
};

export function getProcessKindMeta(kind: ProcessKind): ProcessKindMeta {
  return PROCESS_KIND_META[kind] ?? PROCESS_KIND_META[ProcessKind.Generic];
}
