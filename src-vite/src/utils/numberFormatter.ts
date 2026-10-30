/** Round `value` to `decimals` places without a trailing-zero string (unlike `toFixed`). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatBytes(sizeInBytes: number): string {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(sizeInBytes) / Math.log(1024)), units.length - 1);
  const value = sizeInBytes / Math.pow(1024, unitIndex);
  const decimals = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}
