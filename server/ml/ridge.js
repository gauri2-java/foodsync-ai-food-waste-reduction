// Ridge regression solved in closed form: (XᵀX + λI)β = Xᵀy. Intercept (column 0) is not penalised.

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const p = M[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / p;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

function fitRidge(X, y, lambda = 1.0) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = X[i];
    for (let a = 0; a < k; a++) {
      Xty[a] += row[a] * y[i];
      for (let b = a; b < k; b++) XtX[a][b] += row[a] * row[b];
    }
  }
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
    if (a > 0) XtX[a][a] += lambda;
  }
  return solveLinearSystem(XtX, Xty);
}

const predictRidge = (beta, row) => row.reduce((s, v, i) => s + v * beta[i], 0);

module.exports = { fitRidge, predictRidge };
