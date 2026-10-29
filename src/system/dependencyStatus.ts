import { invoke } from '@tauri-apps/api/core';

/** Runtime availability of an external tool the app shells out to (e.g. ExifTool). */
export type ExternalDependencyStatus = {
  id: string;
  displayName: string;
  version: string | null;
  location: string | null;
  available: boolean;
  error: string | null;
};

/** Probe every external dependency the runtime resolves (version + PATH location). */
export function getExternalDependencyStatus(): Promise<ExternalDependencyStatus[]> {
  return invoke<ExternalDependencyStatus[]>('get_external_dependency_status');
}
