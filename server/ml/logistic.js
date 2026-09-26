// L2-regularised logistic regression trained by batch gradient descent on standardised features.

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function standardise(X) {
  const k = X[0].length;
  const mean = Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[j], 0) / X.length);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / X.length) || 1);
  return { mean, sd };
}

const scaleRow = (row, norm) => row.map((v, j) => (v - norm.mean[j]) / norm.sd[j]);

function fit(X, y, { epochs = 800, lr = 0.2, l2 = 0.01 } = {}) {
  const norm = standardise(X);
  const Xs = X.map((r) => scaleRow(r, norm));
  const k = Xs[0].length;
  const w = new Array(k).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(k).fill(0);
    let gb = 0;
    for (let i = 0; i < Xs.length; i++) {
      const err = sigmoid(b + Xs[i].reduce((s, v, j) => s + v * w[j], 0)) - y[i];
      for (let j = 0; j < k; j++) gw[j] += err * Xs[i][j];
      gb += err;
    }
    for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / Xs.length + l2 * w[j]);
    b -= lr * (gb / Xs.length);
  }
  return { w, b, norm };
}

function predictProba(model, row) {
  const xs = scaleRow(row, model.norm);
  return sigmoid(model.b + xs.reduce((s, v, j) => s + v * model.w[j], 0));
}

module.exports = { fit, predictProba };
