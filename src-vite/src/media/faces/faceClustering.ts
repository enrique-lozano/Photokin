import { generateID } from '@/db/models/dbEntityWithID';
import { shuffle } from '@/utils/array.utils';
import { FaceClusterGraph, FaceGraphEdge } from './faceEmbeddingStore';

/** Neighbors considered per node when building the similarity graph (in Rust). */
export const FACE_CLUSTER_K_NEIGHBORS = 8;
const MAX_ITERATIONS = 20;

export type FaceClusteringResult = {
  clusteredRegionIds: Record<string, string[]>;
  unclusteredRegionIds: string[];
};

/**
 * Groups unknown faces via Chinese Whispers label propagation over the k-NN
 * similarity graph computed in Rust. Groups smaller than `minClusterSize` are
 * left unclustered. The vector math (normalization, cosine, k-NN) lives in the
 * Rust `cluster_face_edges` command; only the community detection is here.
 */
export function clusterUnknownFaces(
  graph: FaceClusterGraph,
  options: { minClusterSize: number },
): FaceClusteringResult {
  const { regionIds, edges } = graph;

  if (regionIds.length === 0) {
    return { clusteredRegionIds: {}, unclusteredRegionIds: [] };
  }

  const labels = _runChineseWhispers(edges, MAX_ITERATIONS);

  const clustersByLabel = new Map<number, string[]>();
  for (let index = 0; index < labels.length; index += 1) {
    const regionId = regionIds[index];
    if (!regionId) continue;
    const items = clustersByLabel.get(labels[index]) ?? [];
    items.push(regionId);
    clustersByLabel.set(labels[index], items);
  }

  const clusteredRegionIds: Record<string, string[]> = {};
  const unclusteredRegionIds: string[] = [];

  for (const [, clusterRegionIds] of clustersByLabel) {
    if (clusterRegionIds.length < options.minClusterSize) {
      unclusteredRegionIds.push(...clusterRegionIds);
      continue;
    }
    clusteredRegionIds[`cluster-${generateID()}`] = clusterRegionIds;
  }

  return { clusteredRegionIds, unclusteredRegionIds };
}

function _runChineseWhispers(graph: FaceGraphEdge[][], maxIterations: number): number[] {
  const labels = graph.map((_, index) => index);
  const order = graph.map((_, index) => index);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let hasChanged = false;

    for (const nodeIndex of shuffle(order)) {
      const edges = graph[nodeIndex];
      if (!edges || edges.length === 0) continue;

      const labelWeightMap = new Map<number, number>();
      for (const edge of edges) {
        const neighborLabel = labels[edge.to];
        labelWeightMap.set(neighborLabel, (labelWeightMap.get(neighborLabel) ?? 0) + edge.weight);
      }

      let bestLabel = labels[nodeIndex]!;
      let bestWeight = Number.NEGATIVE_INFINITY;
      for (const [label, weight] of labelWeightMap) {
        if (weight > bestWeight) {
          bestWeight = weight;
          bestLabel = label;
        }
      }

      if (labels[nodeIndex] !== bestLabel) {
        labels[nodeIndex] = bestLabel;
        hasChanged = true;
      }
    }

    if (!hasChanged) break;
  }

  return labels;
}
