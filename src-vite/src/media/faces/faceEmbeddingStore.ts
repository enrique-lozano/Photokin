import { isSupportedVideoPath } from '@/common/supportedFormats';
import { executeInDB, selectFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';
import { FaceStatus } from '@/db/models/TagRegionInfoDTO';
import { cosineDistance, decodeEmbedding, encodeEmbedding } from '@/media/embeddings';

/**
 * One unconfirmed face after a re-check: who it was suggested as before, and
 * who (if anyone) it matches now. `null` on either side means "no person".
 */
export type FaceCandidate = {
  regionId: string;
  previousTagId: string | null;
  matchedTagId: string | null;
};

export type FaceMatchResult = {
  candidates: FaceCandidate[];
  /** People that contributed at least one reference embedding to this pass. */
  referencePeople: number;
};

/** A single k-NN edge: neighbor node index + similarity weight. */
export type FaceGraphEdge = { to: number; weight: number };

/**
 * The k-NN similarity graph over every unknown face. `edges[i]` are the
 * neighbors of `regionIds[i]`; the caller runs Chinese Whispers over it.
 */
export type FaceClusterGraph = { regionIds: string[]; edges: FaceGraphEdge[][] };

/**
 * Drops embeddings used as references for named people. Face regions and their
 * assignments remain untouched; the next matching pass recreates the vectors.
 */
export async function clearReferenceFaceEmbeddings(): Promise<void> {
  const confirmedRegionIds = kyselyDB
    .selectFrom('tagRegionInfo')
    .select('id')
    .where('confirmed', '=', 1)
    .where('tagId', 'is not', null);

  await executeInDB(kyselyDB.deleteFrom('faceEmbeddings').where('regionId', 'in', confirmedRegionIds), [
    'faceEmbeddings',
  ]);
}

/** Upsert face embeddings (stored unit-normalized as base64 float32) keyed by region id. */
export async function storeRegionEmbeddings(
  items: { regionId: string; embedding: number[] }[],
): Promise<void> {
  if (items.length === 0) return;

  await executeInDB(
    kyselyDB
      .insertInto('faceEmbeddings')
      .values(items.map((item) => ({ regionId: item.regionId, embedding: encodeEmbedding(item.embedding) })))
      .onConflict((oc) =>
        oc.column('regionId').doUpdateSet((eb) => ({ embedding: eb.ref('excluded.embedding') })),
      ),
    ['faceEmbeddings'],
  );
}

/**
 * Picks up to `count` references that span how a person actually looks, instead
 * of whichever rows the database happened to return first: the face closest to
 * the person's average, then repeatedly the face farthest from everything
 * already picked.
 *
 * Two properties matter more than the exact criterion. It is deterministic, so
 * re-running Recognize over unchanged data reaches the same verdict rather than
 * making suggestions appear and vanish between runs. And confirming a face that
 * looks unlike the current picks — a profile, glasses, a much younger photo —
 * does change the set, which is what lets a second Recognize run find faces the
 * first one missed.
 */
export function selectDiverseReferences<T>(
  items: T[],
  embeddingOf: (item: T) => Float32Array,
  count: number,
): T[] {
  if (count <= 0) return [];
  if (items.length <= count) return items;

  const embeddings = items.map(embeddingOf);
  const dimensions = embeddings[0].length;

  // Unit-normalized vectors, so the largest dot product with the summed vector
  // is the face nearest the person's average direction.
  const centroid = new Float64Array(dimensions);
  for (const embedding of embeddings) {
    for (let index = 0; index < dimensions; index += 1) centroid[index] += embedding[index];
  }

  let seed = 0;
  let bestAlignment = -Infinity;
  for (let item = 0; item < embeddings.length; item += 1) {
    let alignment = 0;
    for (let index = 0; index < dimensions; index += 1)
      alignment += embeddings[item][index] * centroid[index];
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      seed = item;
    }
  }

  const picked = [seed];
  const pickedItems = new Set([seed]);
  // Distance from each candidate to the closest picked reference, so each round
  // only has to fold in the one just added.
  const distanceToPicked = embeddings.map((embedding) => cosineDistance(embedding, embeddings[seed]));

  while (picked.length < count) {
    let farthest = -1;
    let farthestDistance = -Infinity;
    for (let item = 0; item < embeddings.length; item += 1) {
      if (pickedItems.has(item)) continue;
      if (distanceToPicked[item] > farthestDistance) {
        farthestDistance = distanceToPicked[item];
        farthest = item;
      }
    }
    if (farthest < 0) break;

    picked.push(farthest);
    pickedItems.add(farthest);
    for (let item = 0; item < embeddings.length; item += 1) {
      distanceToPicked[item] = Math.min(
        distanceToPicked[item],
        cosineDistance(embeddings[item], embeddings[farthest]),
      );
    }
  }

  return picked.map((item) => items[item]);
}

/**
 * Re-evaluate each unconfirmed face against the nearest confirmed person within
 * `matchMaxDistance`. Every person's confirmed faces are loaded and then thinned
 * to `maxRefsPerTag` by {@link selectDiverseReferences}, so the cap bounds the
 * comparison cost without deciding *which* references it keeps by row order.
 */
export async function matchFacesToPeople(options: {
  candidateAssetIds?: string[];
  matchMaxDistance: number;
  maxRefsPerTag: number;
}): Promise<FaceMatchResult> {
  const refRows = await selectFromDB(
    kyselyDB
      .selectFrom('tagRegionInfo')
      .innerJoin('faceEmbeddings', 'faceEmbeddings.regionId', 'tagRegionInfo.id')
      .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
      .select([
        'tagRegionInfo.tagId as tagId',
        'faceEmbeddings.embedding as embedding',
        'assets.filename as filename',
      ])
      .where('tagRegionInfo.confirmed', '=', 1)
      .where('tagRegionInfo.tagId', 'is not', null),
  );

  const refsByTag = new Map<string, Float32Array[]>();
  for (const row of refRows) {
    if (!row.tagId || (row.filename && isSupportedVideoPath(row.filename))) continue;
    const list = refsByTag.get(row.tagId) ?? [];
    list.push(decodeEmbedding(row.embedding));
    refsByTag.set(row.tagId, list);
  }
  for (const [tagId, refs] of refsByTag) {
    refsByTag.set(
      tagId,
      selectDiverseReferences(refs, (embedding) => embedding, options.maxRefsPerTag),
    );
  }

  const unconfirmedRows = (await selectFromDB(_selectUnconfirmedFaces())).filter(
    (row) => !row.filename || !isSupportedVideoPath(row.filename),
  );
  const scopedAssetIds = options.candidateAssetIds?.length ? new Set(options.candidateAssetIds) : null;
  const candidateRows = scopedAssetIds
    ? unconfirmedRows.filter((row) => scopedAssetIds.has(row.assetId))
    : unconfirmedRows;

  const candidates: FaceCandidate[] = [];
  for (const row of candidateRows) {
    const embedding = decodeEmbedding(row.embedding);

    let bestTagId: string | undefined;
    let bestDistance = Infinity;
    for (const [tagId, refs] of refsByTag) {
      for (const reference of refs) {
        const distance = cosineDistance(embedding, reference);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestTagId = tagId;
        }
      }
    }

    const matched = bestTagId && bestDistance <= options.matchMaxDistance ? bestTagId : null;
    candidates.push({
      regionId: row.regionId,
      previousTagId: row.tagId ?? null,
      matchedTagId: matched,
    });
  }

  return { candidates, referencePeople: refsByTag.size };
}

/**
 * Build a symmetric top-`kNeighbors` similarity graph over every unknown face,
 * skipping pairs from the same asset (two faces in one photo can't be the same
 * person). Edge weight is `similarity²`.
 */
export async function clusterFaceEdges(options: {
  maxDistance: number;
  kNeighbors: number;
}): Promise<FaceClusterGraph> {
  const rows = (await selectFromDB(_selectUnknownFaces())).filter(
    (row) => !row.filename || !isSupportedVideoPath(row.filename),
  );
  const nodes = rows.map((row) => ({
    regionId: row.regionId,
    assetId: row.assetId,
    embedding: decodeEmbedding(row.embedding),
  }));

  const edges: FaceGraphEdge[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (nodes[i].assetId === nodes[j].assetId) continue;
      const distance = cosineDistance(nodes[i].embedding, nodes[j].embedding);
      if (distance >= options.maxDistance) continue;
      const similarity = 1 - distance;
      const weight = similarity * similarity;
      edges[i].push({ to: j, weight });
      edges[j].push({ to: i, weight });
    }
  }

  for (const list of edges) {
    list.sort((a, b) => b.weight - a.weight);
    list.length = Math.min(list.length, options.kNeighbors);
  }

  return { regionIds: nodes.map((node) => node.regionId), edges };
}

function _selectUnknownFaces() {
  return kyselyDB
    .selectFrom('tagRegionInfo')
    .innerJoin('faceEmbeddings', 'faceEmbeddings.regionId', 'tagRegionInfo.id')
    .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
    .select([
      'tagRegionInfo.id as regionId',
      'tagRegionInfo.assetId as assetId',
      'faceEmbeddings.embedding as embedding',
      'assets.filename as filename',
    ])
    .where('tagRegionInfo.tagId', 'is', null)
    .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending);
}

function _selectUnconfirmedFaces() {
  return kyselyDB
    .selectFrom('tagRegionInfo')
    .innerJoin('faceEmbeddings', 'faceEmbeddings.regionId', 'tagRegionInfo.id')
    .innerJoin('assets', 'assets.id', 'tagRegionInfo.assetId')
    .select([
      'tagRegionInfo.id as regionId',
      'tagRegionInfo.assetId as assetId',
      'tagRegionInfo.tagId as tagId',
      'faceEmbeddings.embedding as embedding',
      'assets.filename as filename',
    ])
    .where('tagRegionInfo.faceStatus', '=', FaceStatus.Pending);
}
