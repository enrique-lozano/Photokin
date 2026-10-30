import { isSupportedVideoPath } from '@/common/supportedFormats';
import { AssetFingerprintCache } from '@/db/api/services/assetFingerprints.service';
import { AssetInClient } from '@/db/models/AssetInClient';
import { getExistingThumbnailPath, resolveThumbnailPath } from '@/media/thumbnails/thumbnail';
import { ThumbnailSize } from '@/media/thumbnails/thumbnailOptions.model';
import { HARDWARE_CONCURRENCY } from '@/system/hardware';
import { ProcessReporter } from '@/system/processTracker';
import { mapWithConcurrency } from '@/utils/array.utils';
import { invoke } from '@tauri-apps/api/core';
import {
  DuplicateMember,
  DuplicateRelationship,
  DuplicateScanOptions,
  DuplicateScanResult,
  DuplicateSet,
  MAX_SIMILARITY_THRESHOLD,
} from './duplicateTypes';
import { HammingBkTree } from './hammingIndex';
import { computePerceptualHash, distanceToMatchPercent, hammingDistance } from './perceptualHash';

/** Photos captured within this window (and visually alike) are a burst run. */
const BURST_TIME_WINDOW_MS = 20_000;
/**
 * Minimum spacing between consecutive frames of a real burst. A genuine
 * camera burst always advances the clock by at least a few ms; an *exactly*
 * equal capture time instead signals copied/exported EXIF (e.g. edited
 * versions of one shot), which is not a burst.
 */
const BURST_MIN_DELTA_MS = 1;
/** Max perceptual distance between consecutive frames to count as a burst. */
const BURST_MAX_DISTANCE = 16;
/** A burst needs at least this many frames. */
const BURST_MIN_FRAMES = 3;
/** Files larger than this are not byte-hashed (avoids loading huge videos). */
const MAX_CONTENT_HASH_BYTES = 512 * 1024 * 1024;
/** Push a progress update every N processed items (keeps the bar moving). */
const YIELD_EVERY = 25;
/**
 * How many files to read+SHA-256 in parallel during the exact pass. Kept low
 * because each read loads the whole file into memory (bounded by
 * {@link MAX_CONTENT_HASH_BYTES}).
 */
const CONTENT_HASH_CONCURRENCY = 4;
/** Prefix reads are tiny (4 KiB), so many can be in flight at once. */
const PREFIX_HASH_CONCURRENCY = 16;
/**
 * How many images to fingerprint in parallel during the perceptual pass. The
 * work is CPU-bound (Rust decode + dHash, ffmpeg for exotic formats) and runs
 * off the main thread, so we scale with the machine but cap it to avoid
 * oversubscription.
 */
const PERCEPTUAL_HASH_CONCURRENCY = Math.max(2, Math.min(8, HARDWARE_CONCURRENCY));

/*
  Cumulative progress fractions for the three visible stages. Each stage fills
  the bar up to its boundary so the label and the percentage always agree:
    - exact matching:        0      → EXACT_PASS_END
    - perceptual fingerprint: EXACT_PASS_END → FINGERPRINT_PASS_END
    - grouping (similar/burst/build): FINGERPRINT_PASS_END → 1
*/
const EXACT_PASS_END = 0.4;
const FINGERPRINT_PASS_END = 0.85;

/** Yield/refresh cadence for the plain O(n) loops (grouping, materialising). */
const LOOP_YIELD_EVERY = 5_000;

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A candidate set before materialisation: members of one component subgroup. */
interface Subgroup {
  /** Union-find root the subgroup belongs to (only same-root subgroups merge). */
  root: string;
  members: AssetInClient[];
  relationship: DuplicateRelationship;
}

/** Upserts cached fingerprints for an asset, keyed/validated by file size. */
function _cacheHashes(
  cache: AssetFingerprintCache,
  id: string,
  size: number,
  patch: { pHash?: string; contentHash?: string },
): void {
  const existing = cache.get(id);
  if (existing && existing.size === size) {
    cache.set(id, { ...existing, ...patch });
  } else {
    cache.set(id, { size, ...patch });
  }
}

// --- Union-find -------------------------------------------------------------

/*
  Plain connectivity only. We deliberately do NOT track the *kind* of edge on
  the component: a relationship label (exact / burst / similar) propagated to a
  whole component is wrong once a low threshold chains different photos
  together. Instead, each final subgroup is labelled from its actual members
  (see `_subgroupRelationship`) and genuine burst runs are tracked separately
  (see `_detectBursts` + `burstRunByAsset`).
*/
class UnionFind {
  private parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
    }
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let cursor = id;
    while (this.parent.get(cursor) !== root) {
      const next = this.parent.get(cursor)!;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    this.parent.set(rootB, rootA);
  }

  /** Unions every member of each bucket to its first element. */
  unionBuckets(buckets: Iterable<AssetInClient[]>): void {
    for (const bucket of buckets) {
      for (let i = 1; i < bucket.length; i++) this.union(bucket[0].id, bucket[i].id);
    }
  }
}

// --- Scan -------------------------------------------------------------------

/**
 * Computes duplicate sets in memory, filling the caller-owned persistent
 * fingerprint cache for files that have not been processed before.
 */
export async function scanForDuplicates(
  assets: AssetInClient[],
  options: DuplicateScanOptions,
  reporter?: ProcessReporter,
  hashCache: AssetFingerprintCache = new Map(),
): Promise<DuplicateScanResult> {
  reporter?.throwIfStopped();
  const warnings: string[] = [];
  const total = assets.length;
  const rawThreshold = Number.isFinite(options.similarityThreshold)
    ? options.similarityThreshold
    : MAX_SIMILARITY_THRESHOLD;
  const similarityThreshold = Math.min(MAX_SIMILARITY_THRESHOLD, Math.max(0, rawThreshold));
  const uf = new UnionFind();
  assets.forEach((asset) => uf.add(asset.id));

  const contentHashByAsset = new Map<string, string>();
  const pHashByAsset = new Map<string, bigint>();

  // --- Stage 1/3 · Exact pass: only hash files that share a byte size. -----
  // The scan has three visible stages, each owning a slice of the bar so the
  // label and the percentage always agree: exact matching, perceptual
  // fingerprinting, then grouping (see the *_PASS_END progress constants).
  reporter?.update({ message: `Comparing ${total.toLocaleString()} photos…`, progress: 0 });

  const bySize = Map.groupBy(assets, (asset) => asset.filesize);
  const hashCandidates = [...bySize.values()].filter((bucket) => bucket.length > 1).flat();

  // Resolve everything already cached (or too large to hash) up front so the
  // expensive file reads below only cover the files that actually need work.
  let candidatesNeedingHash: AssetInClient[] = [];
  const sizesWithCachedHash = new Set<number>();
  for (const asset of hashCandidates) {
    if (asset.filesize > MAX_CONTENT_HASH_BYTES) continue;
    const cached = hashCache.get(asset.id);
    if (cached && cached.size === asset.filesize && cached.contentHash) {
      contentHashByAsset.set(asset.id, cached.contentHash);
      sizesWithCachedHash.add(asset.filesize);
    } else {
      candidatesNeedingHash.push(asset);
    }
  }

  // `hashed` already accounts for the cached/skipped candidates so the bar
  // reflects total work, not just the freshly-hashed files.
  let hashed = hashCandidates.length - candidatesNeedingHash.length;
  const reportHashProgress = () =>
    reporter?.update({
      message:
        hashCandidates.length > 0
          ? `Checking for identical files · ${hashed.toLocaleString()}/${hashCandidates.length.toLocaleString()}`
          : 'Checking for identical files…',
      progress:
        hashCandidates.length > 0 ? (EXACT_PASS_END * hashed) / hashCandidates.length : EXACT_PASS_END,
    });
  reportHashProgress();

  // Same-size files whose first bytes differ cannot be identical: hash only a
  // small prefix first and fully read just the files that still collide. A file
  // is also kept when a cached full hash of the same size exists (its prefix
  // is unknown) or its prefix could not be read.
  const prefixByAsset = new Map<string, string>();
  await mapWithConcurrency(candidatesNeedingHash, PREFIX_HASH_CONCURRENCY, async (asset) => {
    reporter?.throwIfStopped();
    try {
      prefixByAsset.set(asset.id, await invoke<string>('sha256_file_prefix', { path: asset.fullPath }));
    } catch {
      // Falls back to the full hash below, which reports the read error.
    }
  });
  const prefixBuckets = Map.groupBy(
    candidatesNeedingHash.filter((asset) => prefixByAsset.has(asset.id)),
    (asset) => `${asset.filesize}:${prefixByAsset.get(asset.id)}`,
  );
  const stillColliding = candidatesNeedingHash.filter(
    (asset) =>
      !prefixByAsset.has(asset.id) ||
      sizesWithCachedHash.has(asset.filesize) ||
      (prefixBuckets.get(`${asset.filesize}:${prefixByAsset.get(asset.id)}`)?.length ?? 0) > 1,
  );
  hashed += candidatesNeedingHash.length - stillColliding.length;
  candidatesNeedingHash = stillColliding;
  reportHashProgress();

  await mapWithConcurrency(candidatesNeedingHash, CONTENT_HASH_CONCURRENCY, async (asset) => {
    reporter?.throwIfStopped();
    try {
      const hex = await invoke<string>('sha256_file', { path: asset.fullPath });
      contentHashByAsset.set(asset.id, hex);
      _cacheHashes(hashCache, asset.id, asset.filesize, { contentHash: hex });
    } catch {
      warnings.push(`Could not read ${asset.filename} for exact matching.`);
    }
    hashed++;
    if (hashed % YIELD_EVERY === 0) {
      reportHashProgress();
    }
  });
  reporter?.throwIfStopped();
  reportHashProgress();

  // Byte-identical copies are their own sets, independent of the similarity
  // slider. They stay out of the perceptual passes below so a photo is never
  // listed (and removable) in two sets at once.
  const exactGroups = [
    ...Map.groupBy(
      hashCandidates.filter((asset) => contentHashByAsset.has(asset.id)),
      (asset) => contentHashByAsset.get(asset.id)!,
    ).values(),
  ].filter((bucket) => bucket.length > 1);
  const exactAssetIds = new Set(exactGroups.flat().map((asset) => asset.id));

  // --- Perceptual pass: fingerprint images straight from the original file. -
  const images = assets.filter(
    (asset) => !isSupportedVideoPath(asset.filename) && !exactAssetIds.has(asset.id),
  );

  // Cached fingerprints resolve instantly; only the rest pay for decoding,
  // which is what we parallelise below. On a re-scan almost everything is
  // cached, so this loop (BigInt parsing per asset) can be the longest
  // synchronous stretch — yield through it to keep the toast live.
  const imagesNeedingHash: AssetInClient[] = [];
  let prepared = 0;
  for (const asset of images) {
    const cached = hashCache.get(asset.id);
    if (cached && cached.size === asset.filesize && cached.pHash !== undefined) {
      pHashByAsset.set(asset.id, BigInt(cached.pHash));
    } else {
      imagesNeedingHash.push(asset);
    }
    if (++prepared % LOOP_YIELD_EVERY === 0) {
      await yieldToUi();
      reporter?.throwIfStopped();
    }
  }

  // --- Stage 2/3 · Perceptual pass: fills the EXACT_PASS_END→FINGERPRINT band.
  let fingerprinted = images.length - imagesNeedingHash.length;
  const reportFingerprintProgress = () =>
    reporter?.update({
      message: `Fingerprinting images · ${fingerprinted.toLocaleString()}/${images.length.toLocaleString()}`,
      progress:
        EXACT_PASS_END +
        ((FINGERPRINT_PASS_END - EXACT_PASS_END) * fingerprinted) / Math.max(1, images.length),
    });
  reportFingerprintProgress();

  // Fingerprint in batches (bounded concurrency) instead of one at a time: the
  // decode is the dominant cost and runs off-thread, so several can be in
  // flight at once. Awaiting between items also keeps the event loop free, so
  // the UI/progress no longer freezes on slow batches.
  //
  // Prefer an existing display/search thumbnail, otherwise hash the original
  // directly. Only generate+hash an XS thumbnail when the pure-Rust decoder
  // cannot read the source (HEIC/HEIF/AVIF or another decode failure).
  await mapWithConcurrency(imagesNeedingHash, PERCEPTUAL_HASH_CONCURRENCY, async (asset) => {
    reporter?.throwIfStopped();
    try {
      // Existing gallery/search thumbnails are much cheaper to decode than a
      // full-resolution original. Do not generate one here: when no derivative
      // exists, hashing the original directly remains the fastest path.
      const existingThumbnail = await getExistingThumbnailPath(asset);
      let hash = await computePerceptualHash(existingThumbnail ?? asset.fullPath);
      if (hash === null) {
        const thumbnailPath = await resolveThumbnailPath(asset, ThumbnailSize.XS);
        if (thumbnailPath) {
          hash = await computePerceptualHash(thumbnailPath);
        }
      }
      if (hash !== null) {
        pHashByAsset.set(asset.id, hash);
        _cacheHashes(hashCache, asset.id, asset.filesize, { pHash: hash.toString() });
      }
    } catch {
      // A single unreadable image shouldn't abort the whole scan.
    }
    fingerprinted++;
    if (fingerprinted % YIELD_EVERY === 0) {
      reportFingerprintProgress();
    }
  });
  reporter?.throwIfStopped();
  reportFingerprintProgress();

  // --- Stage 3/3 · Grouping: fills the FINGERPRINT_PASS_END→100% band. ------
  reporter?.update({ message: 'Grouping similar photos…', progress: FINGERPRINT_PASS_END });

  const byPHash = Map.groupBy(
    images.filter((asset) => pHashByAsset.has(asset.id)),
    (asset) => pHashByAsset.get(asset.id)!.toString(),
  );
  // Identical fingerprints are trivially similar.
  uf.unionBuckets(byPHash.values());
  // Near (but not identical) fingerprints: use an exact BK-tree lookup instead
  // of comparing every distinct pair. Hamming distance is a metric, so branches
  // outside the possible distance range can be skipped without missing matches.
  const distinct = [...byPHash.entries()].map(([key, bucket]) => {
    const hash = BigInt(key);
    return {
      hi: Number(BigInt.asUintN(32, hash >> 32n)),
      lo: Number(BigInt.asUintN(32, hash)),
      representative: bucket[0].id,
    };
  });
  const hashIndex = new HammingBkTree();
  for (let i = 0; i < distinct.length; i++) {
    const point = distinct[i];
    if (similarityThreshold > 0) {
      for (const match of hashIndex.within(point, similarityThreshold)) {
        uf.union(point.representative, match);
      }
    }
    hashIndex.insert(point);
    if ((i + 1) % LOOP_YIELD_EVERY === 0) {
      reporter?.update({
        progress:
          FINGERPRINT_PASS_END + (1 - FINGERPRINT_PASS_END) * 0.5 * ((i + 1) / Math.max(1, distinct.length)),
      });
      await yieldToUi();
      reporter?.throwIfStopped();
    }
  }

  // --- Burst pass: runs of close-in-time, visually-alike frames. -----------
  // Records genuine run membership (asset id → run id) so a burst stays its own
  // set and never lends its label to merely-similar neighbours sharing the
  // same union-find component.
  const burstRunByAsset = new Map<string, string>();
  await _detectBursts(images, pHashByAsset, uf, burstRunByAsset, similarityThreshold, reporter);
  reporter?.throwIfStopped();

  // --- Materialise sets from the components. -------------------------------
  reporter?.update({
    message: 'Building duplicate sets…',
    progress: FINGERPRINT_PASS_END + (1 - FINGERPRINT_PASS_END) * 0.5,
  });
  const byRoot = new Map<string, AssetInClient[]>();
  let rooted = 0;
  for (const asset of assets) {
    const root = uf.find(asset.id);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(asset);
    else byRoot.set(root, [asset]);
    if (++rooted % LOOP_YIELD_EVERY === 0) {
      await yieldToUi();
      reporter?.throwIfStopped();
    }
  }

  // Collect candidate subgroups per component first, then merge any that are
  // visually redundant before materialising sets (see `_mergeRedundantSubgroups`).
  const subgroups: Subgroup[] = exactGroups.map((members) => ({
    root: members[0].id,
    members,
    relationship: DuplicateRelationship.Exact,
  }));
  let processed = 0;
  for (const [root, groupAssets] of byRoot.entries()) {
    if (groupAssets.length < 2) continue;

    /*
      Split a component into the genuine burst runs it contains (kept intact —
      bursts are intentionally transitive over time) and "the rest". The rest
      is then re-split into tight clusters: components can become too wide via
      transitive similar edges (A~B and B~C while A !~ C), which a low threshold
      makes common, so we keep every member directly close to its subgroup
      representative. This guarantees a burst's label never bleeds onto
      merely-similar neighbours that happen to share its component.
    */
    const runMembers = new Map<string, AssetInClient[]>();
    const rest: AssetInClient[] = [];
    for (const asset of groupAssets) {
      const runId = burstRunByAsset.get(asset.id);
      if (runId !== undefined) {
        const members = runMembers.get(runId);
        if (members) members.push(asset);
        else runMembers.set(runId, [asset]);
      } else {
        rest.push(asset);
      }
    }

    const emit = (members: AssetInClient[], relationship: DuplicateRelationship) => {
      subgroups.push({ root, members, relationship });
    };

    for (const [, members] of runMembers) {
      // A run that lost members to other components can fall below the minimum;
      // fold those stragglers back into the similarity pass rather than drop.
      if (members.length < BURST_MIN_FRAMES) {
        rest.push(...members);
        continue;
      }
      const burstClusters = _splitSimilarComponent(
        members,
        contentHashByAsset,
        pHashByAsset,
        similarityThreshold,
      );
      for (const cluster of burstClusters) {
        if (cluster.length < BURST_MIN_FRAMES) {
          rest.push(...cluster);
          continue;
        }
        emit(cluster, DuplicateRelationship.Burst);
        if (++processed % LOOP_YIELD_EVERY === 0) {
          await yieldToUi();
          reporter?.throwIfStopped();
        }
      }
    }

    if (rest.length >= 2) {
      const clusters = _splitSimilarComponent(rest, contentHashByAsset, pHashByAsset, similarityThreshold);
      for (const subgroup of clusters) {
        if (subgroup.length < 2) continue;
        emit(subgroup, _subgroupRelationship(subgroup, contentHashByAsset));
        if (++processed % LOOP_YIELD_EVERY === 0) {
          await yieldToUi();
          reporter?.throwIfStopped();
        }
      }
    }
  }

  const mergedSubgroups = _mergeRedundantSubgroups(
    subgroups,
    contentHashByAsset,
    pHashByAsset,
    similarityThreshold,
  );
  reporter?.throwIfStopped();

  const sets: DuplicateSet[] = [];
  let built = 0;
  for (const subgroup of mergedSubgroups) {
    const seedId = subgroup.members.map((asset) => asset.id).sort((a, b) => a.localeCompare(b))[0];
    const id = `${subgroup.root}:${seedId}:${subgroup.members.length}`;
    sets.push(_buildSet(id, subgroup.members, subgroup.relationship, contentHashByAsset, pHashByAsset));
    if (++built % LOOP_YIELD_EVERY === 0) {
      await yieldToUi();
      reporter?.throwIfStopped();
    }
  }

  sets.sort((a, b) => _recoverableBytes(b) - _recoverableBytes(a));

  reporter?.update({ progress: 1 });

  return {
    sets,
    comparedCount: total,
    scannedAt: Date.now(),
    warnings,
  };
}

/**
 * Labels a non-burst subgroup by its *actual* members rather than a propagated
 * component flag. A set is only "exact" when every member is the same
 * byte-identical file (one shared content hash) — that is what the UI promises
 * (it hides per-member match % for exact sets). A merely-similar group that
 * happens to contain an identical pair is therefore labelled "similar", not
 * "exact".
 */
function _subgroupRelationship(
  subgroup: AssetInClient[],
  contentHashByAsset: Map<string, string>,
): DuplicateRelationship {
  const firstHash = contentHashByAsset.get(subgroup[0].id);
  const allByteIdentical =
    firstHash !== undefined && subgroup.every((asset) => contentHashByAsset.get(asset.id) === firstHash);
  return allByteIdentical ? DuplicateRelationship.Exact : DuplicateRelationship.Similar;
}

/**
 * Folds together subgroups (within the same component) whose visual content is
 * equal to, or a subset of, another's so the UI never shows two sets of the
 * same photos. Two subgroups are redundant when every member of the smaller one
 * has a visual twin (same content hash, or perceptual distance within the
 * threshold) in the larger one — this covers both equal runs and subset runs.
 */
function _mergeRedundantSubgroups(
  subgroups: Subgroup[],
  contentHashByAsset: Map<string, string>,
  pHashByAsset: Map<string, bigint>,
  similarityThreshold: number,
): Subgroup[] {
  const byRoot = Map.groupBy(subgroups, (subgroup) => subgroup.root);
  const merged: Subgroup[] = [];

  for (const [root, group] of byRoot) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // Union-find over the subgroup indices of this component.
    const parent = group.map((_, index) => index);
    const find = (index: number): number => {
      let cursor = index;
      while (parent[cursor] !== cursor) {
        parent[cursor] = parent[parent[cursor]];
        cursor = parent[cursor];
      }
      return cursor;
    };
    const union = (a: number, b: number): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent[rootB] = rootA;
    };

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (find(i) === find(j)) continue;
        if (
          _subgroupsAreRedundant(
            group[i].members,
            group[j].members,
            contentHashByAsset,
            pHashByAsset,
            similarityThreshold,
          )
        ) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, number[]>();
    for (let i = 0; i < group.length; i++) {
      const clusterRoot = find(i);
      const bucket = clusters.get(clusterRoot);
      if (bucket) bucket.push(i);
      else clusters.set(clusterRoot, [i]);
    }

    for (const indices of clusters.values()) {
      if (indices.length === 1) {
        merged.push(group[indices[0]]);
        continue;
      }
      // Combine members (asset ids are unique across subgroups, so a plain
      // concat is safe) and re-derive the relationship from the union.
      let anyBurst = false;
      const members: AssetInClient[] = [];
      for (const index of indices) {
        if (group[index].relationship === DuplicateRelationship.Burst) anyBurst = true;
        members.push(...group[index].members);
      }
      const baseRelationship = _subgroupRelationship(members, contentHashByAsset);
      const relationship: DuplicateRelationship =
        baseRelationship === DuplicateRelationship.Exact
          ? DuplicateRelationship.Exact
          : anyBurst
            ? DuplicateRelationship.Burst
            : DuplicateRelationship.Similar;

      // Merging can chain sets (each member has a twin *somewhere* in the
      // other), leaving photos outside the threshold of the merged set's
      // representative. Keep the original subgroups then: each already holds
      // every member within the threshold of its own representative (the split
      // seeds them strongest-first), so the slider stays the rule and no pair
      // it allowed is lost. This also applies to bursts: a chain of merges
      // would otherwise glue unrelated frames from outside the burst window.
      const representative = [...members].sort(_byStrength)[0];
      const keepsThreshold = members.every((member) =>
        _assetsAreSimilar(member, representative, contentHashByAsset, pHashByAsset, similarityThreshold),
      );
      if (keepsThreshold) merged.push({ root, members, relationship });
      else for (const index of indices) merged.push(group[index]);
    }
  }

  return merged;
}

/**
 * True when the smaller subgroup is visually contained in the larger one: every
 * member of the smaller has a visual twin in the larger. Equal runs satisfy
 * this in both directions; subset runs satisfy it one way.
 */
function _subgroupsAreRedundant(
  a: AssetInClient[],
  b: AssetInClient[],
  contentHashByAsset: Map<string, string>,
  pHashByAsset: Map<string, bigint>,
  similarityThreshold: number,
): boolean {
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  return small.every((asset) =>
    large.some((other) =>
      _assetsAreSimilar(asset, other, contentHashByAsset, pHashByAsset, similarityThreshold),
    ),
  );
}

/**
 * Strongest file first: highest resolution, then largest, then earliest, then
 * id. Shared by the subgroup split (whose seed is the first member) and the set
 * representative, so the member every match % is measured against is the one
 * the split guaranteed them close to.
 */
function _byStrength(a: AssetInClient, b: AssetInClient): number {
  return (
    b.metadata.width * b.metadata.height - a.metadata.width * a.metadata.height ||
    b.filesize - a.filesize ||
    _captureMs(a) - _captureMs(b) ||
    a.id.localeCompare(b.id)
  );
}

function _splitSimilarComponent(
  groupAssets: AssetInClient[],
  contentHashByAsset: Map<string, string>,
  pHashByAsset: Map<string, bigint>,
  similarityThreshold: number,
): AssetInClient[][] {
  // Seed stronger files first so each subgroup representative is stable/useful.
  const ordered = [...groupAssets].sort(_byStrength);

  const clusters: { representative: AssetInClient; members: AssetInClient[] }[] = [];
  for (const asset of ordered) {
    const target = clusters.find(
      (cluster) =>
        _assetsAreSimilar(
          asset,
          cluster.representative,
          contentHashByAsset,
          pHashByAsset,
          similarityThreshold,
        ) &&
        cluster.members.some((member) =>
          _assetsAreSimilar(asset, member, contentHashByAsset, pHashByAsset, similarityThreshold),
        ),
    );
    if (target) target.members.push(asset);
    else clusters.push({ representative: asset, members: [asset] });
  }

  return clusters.map((cluster) => cluster.members);
}

function _assetsAreSimilar(
  a: AssetInClient,
  b: AssetInClient,
  contentHashByAsset: Map<string, string>,
  pHashByAsset: Map<string, bigint>,
  similarityThreshold: number,
): boolean {
  const contentA = contentHashByAsset.get(a.id);
  const contentB = contentHashByAsset.get(b.id);
  if (contentA && contentB && contentA === contentB) return true;

  const hashA = pHashByAsset.get(a.id);
  const hashB = pHashByAsset.get(b.id);
  if (hashA === undefined || hashB === undefined) return false;
  return hammingDistance(hashA, hashB) <= similarityThreshold;
}

async function _detectBursts(
  images: AssetInClient[],
  pHashByAsset: Map<string, bigint>,
  uf: UnionFind,
  burstRunByAsset: Map<string, string>,
  similarityThreshold: number,
  reporter?: ProcessReporter,
): Promise<void> {
  // A burst is a camera-capture event, so it must be anchored to a real EXIF
  // capture time. Without one we'd be timing by `dateAdded`, which for a bulk
  // import is near-identical across unrelated photos — a classic false-burst
  // source. Only photos with a genuine capture date are eligible.
  const sorted = images
    .filter((asset) => asset.metadata.date != null)
    .sort((a, b) => _captureMs(a) - _captureMs(b));

  let runStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const delta = i < sorted.length ? _captureMs(sorted[i]) - _captureMs(sorted[i - 1]) : Infinity;
    const breaks =
      i === sorted.length ||
      delta < BURST_MIN_DELTA_MS ||
      delta > BURST_TIME_WINDOW_MS ||
      !_sameCamera(sorted[i], sorted[i - 1]) ||
      !_visuallyClose(sorted[i], sorted[i - 1], pHashByAsset, similarityThreshold);

    if (breaks) {
      const runLength = i - runStart;
      if (runLength >= BURST_MIN_FRAMES) {
        const runId = sorted[runStart].id;
        for (let k = runStart; k < i; k++) {
          burstRunByAsset.set(sorted[k].id, runId);
          if (k > runStart) uf.union(sorted[runStart].id, sorted[k].id);
        }
      }
      runStart = i;
    }
    if (i % LOOP_YIELD_EVERY === 0) {
      await yieldToUi();
      reporter?.throwIfStopped();
    }
  }
}

function _captureMs(asset: AssetInClient): number {
  return asset.metadata.date?.getTime() ?? asset.dateAdded.getTime();
}

function _sameCamera(a: AssetInClient, b: AssetInClient): boolean {
  const camA = a.metadata.camera;
  const camB = b.metadata.camera;
  // Treat "no camera info on both" as compatible (still time+visually gated).
  return camA.Make === camB.Make && camA.Model === camB.Model;
}

function _visuallyClose(
  a: AssetInClient,
  b: AssetInClient,
  pHashByAsset: Map<string, bigint>,
  similarityThreshold: number,
): boolean {
  const hashA = pHashByAsset.get(a.id);
  const hashB = pHashByAsset.get(b.id);
  if (hashA === undefined || hashB === undefined) return false;
  return hammingDistance(hashA, hashB) <= Math.min(BURST_MAX_DISTANCE, similarityThreshold);
}

function _buildSet(
  id: string,
  groupAssets: AssetInClient[],
  relationship: DuplicateRelationship,
  contentHashByAsset: Map<string, string>,
  pHashByAsset: Map<string, bigint>,
): DuplicateSet {
  // Representative = strongest file (anchor for the similarity readout).
  const representative = [...groupAssets].sort(_byStrength)[0];

  const repHash = pHashByAsset.get(representative.id);
  const repContent = contentHashByAsset.get(representative.id);

  const orderedAssets = [...groupAssets].sort((a, b) => _captureMs(a) - _captureMs(b));

  const members: DuplicateMember[] = orderedAssets.map((asset) => {
    const pHash = pHashByAsset.get(asset.id) ?? null;
    const contentHash = contentHashByAsset.get(asset.id) ?? null;

    let matchPercent = 100;
    if (asset.id !== representative.id) {
      if (contentHash && repContent && contentHash === repContent) {
        matchPercent = 100;
      } else if (pHash !== null && repHash !== undefined) {
        matchPercent = distanceToMatchPercent(hammingDistance(pHash, repHash));
      }
    }

    return { asset, pHash, contentHash, matchPercent };
  });

  // Display order. A burst reads as its sequence, so it stays chronological.
  // Otherwise the reference leads, so every "% match" reads against it, then
  // closest first: the likeliest false matches end up last. Ties keep time order.
  if (relationship !== DuplicateRelationship.Burst) {
    const isReference = (member: DuplicateMember) => Number(member.asset.id === representative.id);
    members.sort((a, b) => isReference(b) - isReference(a) || b.matchPercent - a.matchPercent);
  }

  const representativeIndex = members.findIndex((member) => member.asset.id === representative.id);

  return {
    id,
    relationship,
    members,
    representativeIndex: representativeIndex === -1 ? 0 : representativeIndex,
    capturedAt: representative.metadata.date ?? null,
    title: representative.filename,
  };
}

/** Bytes freed if every member but the smallest-needed one is removed. */
function _recoverableBytes(set: DuplicateSet): number {
  const totalBytes = set.members.reduce((acc, member) => acc + member.asset.filesize, 0);
  const largest = Math.max(...set.members.map((member) => member.asset.filesize));
  return totalBytes - largest;
}
