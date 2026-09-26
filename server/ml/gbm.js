// Minimal gradient-boosted regression trees (squared loss) — used to learn non-linear
// interactions the additive model misses (e.g. "rainy Friday during exams").

function bestSplit(X, residuals, idx, minLeaf) {
  let best = null;
  const featureCount = X[0].length;
  for (let f = 0; f < featureCount; f++) {
    const sorted = [...idx].sort((a, b) => X[a][f] - X[b][f]);
    let leftSum = 0;
    const total = sorted.reduce((s, i) => s + residuals[i], 0);
    for (let k = 0; k < sorted.length - 1; k++) {
      leftSum += residuals[sorted[k]];
      const nL = k + 1;
      const nR = sorted.length - nL;
      if (nL < minLeaf || nR < minLeaf) continue;
      const vHere = X[sorted[k]][f];
      const vNext = X[sorted[k + 1]][f];
      if (vHere === vNext) continue;
      const gain = (leftSum * leftSum) / nL + ((total - leftSum) ** 2) / nR;
      if (!best || gain > best.gain) best = { gain, feature: f, threshold: (vHere + vNext) / 2 };
    }
  }
  return best;
}

function buildTree(X, residuals, idx, depth, opts) {
  const mean = idx.reduce((s, i) => s + residuals[i], 0) / idx.length;
  if (depth >= opts.maxDepth || idx.length < 2 * opts.minLeaf) return { leaf: mean };
  const split = bestSplit(X, residuals, idx, opts.minLeaf);
  if (!split) return { leaf: mean };
  const left = idx.filter((i) => X[i][split.feature] <= split.threshold);
  const right = idx.filter((i) => X[i][split.feature] > split.threshold);
  return {
    feature: split.feature,
    threshold: split.threshold,
    left: buildTree(X, residuals, left, depth + 1, opts),
    right: buildTree(X, residuals, right, depth + 1, opts),
  };
}

function predictTree(node, row) {
  while (node.leaf === undefined) node = row[node.feature] <= node.threshold ? node.left : node.right;
  return node.leaf;
}

function fitGbm(X, y, { rounds = 60, learningRate = 0.1, maxDepth = 3, minLeaf = 8 } = {}) {
  const residuals = [...y];
  const trees = [];
  const idx = X.map((_, i) => i);
  for (let r = 0; r < rounds; r++) {
    const tree = buildTree(X, residuals, idx, 0, { maxDepth, minLeaf });
    trees.push(tree);
    for (let i = 0; i < X.length; i++) residuals[i] -= learningRate * predictTree(tree, X[i]);
  }
  return { trees, learningRate };
}

function predictGbm(model, row) {
  return model.trees.reduce((s, t) => s + model.learningRate * predictTree(t, row), 0);
}

module.exports = { fitGbm, predictGbm };
