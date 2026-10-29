import { writeFile } from 'node:fs/promises';

/** Fetch a URL straight to disk, failing loudly on a non-2xx response. */
export async function downloadFile(url, destinationPath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}. HTTP ${response.status} ${response.statusText}`);
  }

  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}
