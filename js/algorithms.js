/*
 * algorithms.js
 * -------------
 * Pure pathfinding algorithms. No DOM, no canvas, no globals.
 * Works in the browser (window.Pathfinding) and in Node (require), so it can be unit tested.
 *
 * Every algorithm has the same signature:
 *     algorithm(grid, startIndex, endIndex) -> { visitedInOrder, path, cost, found }
 *
 *   grid = { rows, cols, walls: Uint8Array, weights: Uint8Array }
 *   cell (r, c) has index  r * cols + c
 *   weights[i] = cost to ENTER cell i (1 = normal, 5 = mud)
 *
 *   visitedInOrder : [{r, c}]  cells in the order the algorithm explored them
 *   path           : [{r, c}]  start -> end (empty if no path)
 *   cost           : number    sum of entry costs along the path
 *   found          : boolean
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pathfinding = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // up, right, down, left

  function neighbors(g, i) {
    const r = (i / g.cols) | 0, c = i % g.cols, out = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
      const j = nr * g.cols + nc;
      if (!g.walls[j]) out.push(j);
    }
    return out;
  }

  // Binary min-heap, hand-written. Ordered by key k, ties broken by t.
  // push/pop are O(log n), which is what gives Dijkstra and A* their log V factor.
  class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    static less(x, y) { return x.k < y.k || (x.k === y.k && x.t < y.t); }
    push(k, t, n) {
      const a = this.a;
      a.push({ k, t, n });
      let i = a.length - 1;
      while (i > 0) {                                   // sift up
        const p = (i - 1) >> 1;
        if (!MinHeap.less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {                                      // sift down
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
          if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    }
  }

  const manhattan = (g, i, e) =>
    Math.abs(((i / g.cols) | 0) - ((e / g.cols) | 0)) + Math.abs((i % g.cols) - (e % g.cols));

  const toCells = (g, list) => list.map(i => ({ r: (i / g.cols) | 0, c: i % g.cols }));

  // Walk the "came from" chain backwards from the goal, then sum the entry cost of each step.
  function buildResult(g, order, prev, e, found) {
    const path = [];
    let cost = 0;
    if (found) {
      for (let v = e; v !== -1; v = prev[v]) path.push(v);
      path.reverse();
      for (let k = 1; k < path.length; k++) cost += g.weights[path[k]];
    }
    return { visitedInOrder: toCells(g, order), path: toCells(g, path), cost, found };
  }

  // BFS: queue. Explores in rings, so the first time it reaches the goal it
  // used the fewest steps. It counts steps, not cost, so it ignores mud.
  function bfs(g, s, e) {
    const n = g.rows * g.cols;
    const prev = new Int32Array(n).fill(-1), seen = new Uint8Array(n), order = [];
    const q = [s]; let head = 0; seen[s] = 1; let found = false;
    while (head < q.length) {
      const u = q[head++];
      order.push(u);
      if (u === e) { found = true; break; }
      for (const v of neighbors(g, u)) if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); }
    }
    return buildResult(g, order, prev, e, found);
  }

  // DFS: stack. Commits to one direction until stuck, then backtracks.
  // Finds a path if one exists, but makes no promise it is short.
  function dfs(g, s, e) {
    const n = g.rows * g.cols;
    const prev = new Int32Array(n).fill(-1), seen = new Uint8Array(n), order = [];
    const stack = [[s, -1]]; let found = false;
    while (stack.length) {
      const [u, p] = stack.pop();
      if (seen[u]) continue;
      seen[u] = 1; prev[u] = p; order.push(u);
      if (u === e) { found = true; break; }
      const ns = neighbors(g, u);
      for (let k = ns.length - 1; k >= 0; k--) if (!seen[ns[k]]) stack.push([ns[k], u]);
    }
    return buildResult(g, order, prev, e, found);
  }

  // Dijkstra: min-heap keyed by cost-so-far. Always expands the cheapest
  // frontier cell, so the first time it pops the goal the cost is minimal.
  function dijkstra(g, s, e) {
    const n = g.rows * g.cols;
    const prev = new Int32Array(n).fill(-1), dist = new Float64Array(n).fill(Infinity);
    const closed = new Uint8Array(n), order = [], heap = new MinHeap();
    dist[s] = 0; heap.push(0, 0, s); let found = false;
    while (heap.size) {
      const { n: u } = heap.pop();
      if (closed[u]) continue;                 // stale duplicate entry
      closed[u] = 1; order.push(u);
      if (u === e) { found = true; break; }
      for (const v of neighbors(g, u)) {
        if (closed[v]) continue;
        const nd = dist[u] + g.weights[v];
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; heap.push(nd, 0, v); }
      }
    }
    return buildResult(g, order, prev, e, found);
  }

  // A*: Dijkstra with a compass. Key = cost so far (g) + Manhattan distance
  // to the goal (h). Since every step costs at least 1, h never overestimates,
  // so the answer stays optimal while far fewer cells are explored.
  function astar(g, s, e) {
    const n = g.rows * g.cols;
    const prev = new Int32Array(n).fill(-1), gs = new Float64Array(n).fill(Infinity);
    const closed = new Uint8Array(n), order = [], heap = new MinHeap();
    gs[s] = 0; heap.push(manhattan(g, s, e), manhattan(g, s, e), s); let found = false;
    while (heap.size) {
      const { n: u } = heap.pop();
      if (closed[u]) continue;
      closed[u] = 1; order.push(u);
      if (u === e) { found = true; break; }
      for (const v of neighbors(g, u)) {
        if (closed[v]) continue;
        const ng = gs[u] + g.weights[v];
        if (ng < gs[v]) {
          gs[v] = ng; prev[v] = u;
          const h = manhattan(g, v, e);
          heap.push(ng + h, h, v);
        }
      }
    }
    return buildResult(g, order, prev, e, found);
  }

  // Greedy best-first: key = distance to goal ONLY. Fast and eager, but it
  // ignores what the route has cost so far, so walls can fool it.
  function greedy(g, s, e) {
    const n = g.rows * g.cols;
    const prev = new Int32Array(n).fill(-1), seen = new Uint8Array(n), order = [], heap = new MinHeap();
    let tie = 0; seen[s] = 1; heap.push(manhattan(g, s, e), tie++, s); let found = false;
    while (heap.size) {
      const { n: u } = heap.pop();
      order.push(u);
      if (u === e) { found = true; break; }
      for (const v of neighbors(g, u)) {
        if (!seen[v]) { seen[v] = 1; prev[v] = u; heap.push(manhattan(g, v, e), tie++, v); }
      }
    }
    return buildResult(g, order, prev, e, found);
  }

  return { bfs, dfs, dijkstra, astar, greedy, MinHeap, neighbors, manhattan };
});
