'use strict';
/*
 * Unit tests for js/algorithms.js
 * Run with:  npm test   (uses Node's built-in test runner, no dependencies)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bfs, dfs, dijkstra, astar, greedy, MinHeap } = require('../js/algorithms.js');

const ROWS = 21, COLS = 41, N = ROWS * COLS;
const idx = (r, c) => r * COLS + c;
const ALGOS = { bfs, dfs, dijkstra, astar, greedy };

function emptyGrid() {
  return { rows: ROWS, cols: COLS, walls: new Uint8Array(N), weights: new Uint8Array(N).fill(1) };
}

// small deterministic random number generator so failures are reproducible
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGrid(rand) {
  const g = emptyGrid();
  const density = rand() * 0.35, useMud = rand() < 0.5;
  for (let i = 0; i < N; i++) {
    if (rand() < density) g.walls[i] = 1;
    else if (useMud && rand() < 0.2) g.weights[i] = 5;
  }
  return g;
}

// A path is valid if it starts/ends correctly, never touches a wall, and moves one cell at a time
function assertValidPath(g, res, s, e) {
  if (!res.found) { assert.equal(res.path.length, 0); return; }
  const ids = res.path.map(p => idx(p.r, p.c));
  assert.equal(ids[0], s);
  assert.equal(ids[ids.length - 1], e);
  for (let k = 0; k < ids.length; k++) {
    assert.equal(g.walls[ids[k]], 0, 'path crosses a wall');
    if (k) {
      const a = res.path[k - 1], b = res.path[k];
      assert.equal(Math.abs(a.r - b.r) + Math.abs(a.c - b.c), 1, 'path jumps');
    }
  }
}

test('MinHeap pops keys in ascending order', () => {
  const rand = mulberry32(1), h = new MinHeap();
  for (let i = 0; i < 500; i++) h.push(rand(), i, i);
  let prev = -Infinity;
  while (h.size) { const { k } = h.pop(); assert.ok(k >= prev); prev = k; }
});

test('every algorithm finds a valid path on an open grid', () => {
  const g = emptyGrid(), s = idx(10, 5), e = idx(10, 35);
  for (const [name, fn] of Object.entries(ALGOS)) {
    const res = fn(g, s, e);
    assert.ok(res.found, name + ' should find a path');
    assertValidPath(g, res, s, e);
  }
});

test('BFS and Dijkstra agree on path length when there is no mud', () => {
  const g = emptyGrid();
  for (let r = 0; r <= 14; r++) g.walls[idx(r, 17)] = 1;
  const s = idx(10, 6), e = idx(10, 34);
  assert.equal(bfs(g, s, e).path.length, dijkstra(g, s, e).path.length);
  assert.equal(astar(g, s, e).path.length, dijkstra(g, s, e).path.length);
});

test('Dijkstra routes around mud that BFS walks straight through', () => {
  const g = emptyGrid();
  for (let c = 10; c <= 30; c++) g.weights[idx(10, c)] = 5;   // mud corridor along the direct line
  const s = idx(10, 5), e = idx(10, 35);
  const b = bfs(g, s, e), d = dijkstra(g, s, e);
  assert.ok(d.cost < b.cost, 'Dijkstra should be cheaper than BFS here');
});

test('goal walled off: every algorithm reports no path', () => {
  const g = emptyGrid();
  for (let r = 0; r < ROWS; r++) g.walls[idx(r, 20)] = 1;
  for (const [name, fn] of Object.entries(ALGOS)) {
    const res = fn(g, idx(10, 5), idx(10, 35));
    assert.equal(res.found, false, name);
    assert.equal(res.path.length, 0, name);
  }
});

test('A* matches Dijkstra cost and never explores more cells (2000 random boards)', () => {
  const rand = mulberry32(42);
  let checked = 0;
  for (let t = 0; t < 2000; t++) {
    const g = randomGrid(rand);
    const s = Math.floor(rand() * N), e = Math.floor(rand() * N);
    if (s === e) continue;
    g.walls[s] = g.walls[e] = 0; g.weights[s] = g.weights[e] = 1;

    const res = {};
    for (const [name, fn] of Object.entries(ALGOS)) { res[name] = fn(g, s, e); assertValidPath(g, res[name], s, e); }

    const found = res.bfs.found;
    for (const name in res) assert.equal(res[name].found, found, 'algorithms disagree on reachability');
    if (!found) continue;
    checked++;

    assert.equal(res.astar.cost, res.dijkstra.cost, 'A* must be optimal');
    for (const name in res) {
      assert.ok(res[name].cost >= res.dijkstra.cost, name + ' beat Dijkstra on cost');
      assert.ok(res[name].path.length >= res.bfs.path.length, name + ' beat BFS on steps');
    }
    assert.ok(res.astar.visitedInOrder.length <= res.dijkstra.visitedInOrder.length, 'A* explored more than Dijkstra');
  }
  assert.ok(checked > 1000, 'too few solvable boards were generated');
});
