// Isolation Forest (Liu, Ting & Zhou 2008) for unsupervised anomaly detection on machine telemetry.
// Anomalies are isolated in fewer random splits, so they get shorter average path lengths.

const EULER = 0.5772156649;
const harmonic = (n) => Math.log(n) + EULER;
const avgPathLength = (n) => (n <= 1 ? 0 : 2 * harmonic(n - 1) - (2 * (n - 1)) / n);

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildITree(points, depth, maxDepth, rand) {
  if (depth >= maxDepth || points.length <= 1) return { size: points.length };
  const dims = points[0].length;
  const feature = Math.floor(rand() * dims);
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    min = Math.min(min, p[feature]);
    max = Math.max(max, p[feature]);
  }
  if (min === max) return { size: points.length };
  const split = min + rand() * (max - min);
  return {
    feature,
    split,
    left: buildITree(points.filter((p) => p[feature] < split), depth + 1, maxDepth, rand),
    right: buildITree(points.filter((p) => p[feature] >= split), depth + 1, maxDepth, rand),
  };
}

function pathLength(node, point, depth = 0) {
  if (node.size !== undefined) return depth + avgPathLength(node.size);
  return pathLength(point[node.feature] < node.split ? node.left : node.right, point, depth + 1);
}

function fit(points, { trees = 100, sampleSize = 256, seed = 42 } = {}) {
  const rand = seededRandom(seed);
  const psi = Math.min(sampleSize, points.length);
  const maxDepth = Math.ceil(Math.log2(Math.max(2, psi)));
  const forest = [];
  for (let t = 0; t < trees; t++) {
    const sample = Array.from({ length: psi }, () => points[Math.floor(rand() * points.length)]);
    forest.push(buildITree(sample, 0, maxDepth, rand));
  }
  return { forest, psi };
}

// Score in (0,1]; > ~0.6 is typically anomalous.
function score(model, point) {
  const mean = model.forest.reduce((s, t) => s + pathLength(t, point), 0) / model.forest.length;
  return 2 ** (-mean / avgPathLength(model.psi));
}

module.exports = { fit, score };
