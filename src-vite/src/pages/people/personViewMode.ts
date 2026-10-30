/** Gallery/faces switch for person pages, remembered only while People is open. */
export type PersonViewMode = 'gallery' | 'faces';

let personViewMode: PersonViewMode = 'gallery';

export function getPersonViewMode(): PersonViewMode {
  return personViewMode;
}

export function setPersonViewMode(mode: PersonViewMode): void {
  personViewMode = mode;
}

export function resetPersonViewMode(): void {
  personViewMode = 'gallery';
}
