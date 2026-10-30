export interface PerceptualHashPoint {
  hi: number;
  lo: number;
  representative: string;
}

function _popcount32(value: number): number {
  let n = value - ((value >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function hammingPointDistance(a: PerceptualHashPoint, b: PerceptualHashPoint): number {
  return _popcount32(a.hi ^ b.hi) + _popcount32(a.lo ^ b.lo);
}

class HammingBkNode {
  readonly children = new Map<number, HammingBkNode>();

  constructor(readonly point: PerceptualHashPoint) {}
}

/**
 * Exact metric index for Hamming-distance lookups. Branches outside the
 * query's triangle-inequality range are skipped without losing matches.
 */
export class HammingBkTree {
  private root: HammingBkNode | null = null;

  insert(point: PerceptualHashPoint): void {
    if (!this.root) {
      this.root = new HammingBkNode(point);
      return;
    }

    let node = this.root;
    while (true) {
      const distance = hammingPointDistance(point, node.point);
      const child = node.children.get(distance);
      if (!child) {
        node.children.set(distance, new HammingBkNode(point));
        return;
      }
      node = child;
    }
  }

  within(point: PerceptualHashPoint, maxDistance: number): string[] {
    if (!this.root) return [];
    const matches: string[] = [];
    const pending = [this.root];

    while (pending.length > 0) {
      const node = pending.pop()!;
      const distance = hammingPointDistance(point, node.point);
      if (distance <= maxDistance) matches.push(node.point.representative);

      const minEdge = distance - maxDistance;
      const maxEdge = distance + maxDistance;
      for (const [edge, child] of node.children) {
        if (edge >= minEdge && edge <= maxEdge) pending.push(child);
      }
    }
    return matches;
  }
}
