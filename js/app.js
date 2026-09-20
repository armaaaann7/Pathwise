/*
 * app.js
 * ------
 * Everything that touches the screen: board state, canvas rendering,
 * the animator that replays an algorithm's result, and the UI controls.
 * The algorithms themselves live in algorithms.js.
 */
(() => {
'use strict';

/* ================================================================
   1. CONSTANTS AND BOARD STATE
   The board is two flat typed arrays. A cell at (row, col) has the
   index  row * COLS + col.  Odd dimensions let the maze generator
   carve clean corridors.
   ================================================================ */
const ROWS = 21, COLS = 41, CELL = 26, N = ROWS * COLS;
const MUD = 5;                                  // cost of crossing a mud cell
const idx = (r, c) => r * COLS + c;
const rcOf = i => ({ r: (i / COLS) | 0, c: i % COLS });

const walls = new Uint8Array(N);                // 1 = wall
const weights = new Uint8Array(N).fill(1);      // cost to ENTER the cell
let start = idx(10, 6);
let end = idx(10, 34);

// A starter board so the first Run already shows something interesting.
for (let r = 0; r <= 14; r++) walls[idx(r, 17)] = 1;
for (let r = 6; r <= 20; r++) walls[idx(r, 24)] = 1;

// Algorithms come from js/algorithms.js (loaded first in index.html)
const { bfs, dfs, dijkstra, astar, greedy } = window.Pathfinding;


const ALGOS = {
  bfs: {
    label: 'BFS', name: 'Breadth-First Search', run: bfs, usesWeights: false,
    desc: 'Explores in rings outward from the start, one step at a time, so it reaches the goal in the fewest steps.',
    ds: 'Queue (FIFO)', time: 'O(V + E)', space: 'O(V)', optimal: 'Yes, in steps (every step counts the same)'
  },
  dfs: {
    label: 'DFS', name: 'Depth-First Search', run: dfs, usesWeights: false,
    desc: 'Dives as deep as it can down one branch, then backtracks. It finds a route, but often a long and winding one.',
    ds: 'Stack (LIFO)', time: 'O(V + E)', space: 'O(V)', optimal: 'No'
  },
  dijkstra: {
    label: 'Dijkstra', name: "Dijkstra's Algorithm", run: dijkstra, usesWeights: true,
    desc: 'Always expands the cheapest known cell next, so the first time it reaches the goal, the route is guaranteed cheapest.',
    ds: 'Min-heap priority queue', time: 'O((V + E) log V)', space: 'O(V)', optimal: 'Yes (no negative costs)'
  },
  astar: {
    label: 'A*', name: 'A* Search', run: astar, usesWeights: true,
    desc: 'Dijkstra plus a guess of the distance left (Manhattan). It leans toward the goal and usually explores far fewer cells.',
    ds: 'Min-heap + heuristic', time: 'O((V + E) log V) worst case', space: 'O(V)', optimal: 'Yes (heuristic never overestimates)'
  },
  greedy: {
    label: 'Greedy', name: 'Greedy Best-First Search', run: greedy, usesWeights: false,
    desc: 'Always chases whichever cell looks closest to the goal. Very fast, but walls can trick it into a long detour.',
    ds: 'Min-heap on heuristic only', time: 'O((V + E) log V)', space: 'O(V)', optimal: 'No'
  }
};


/* ================================================================
   2. THEME + RENDERING (canvas)
   Colours come from the CSS variables so light/dark just work.
   ================================================================ */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 3);
canvas.width = COLS * CELL * dpr;
canvas.height = ROWS * CELL * dpr;

let T = {}, LUT = [];
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  T = {
    cell: g('--cell'), line: g('--grid-line'), wall: g('--wall'), mud: g('--mud'), mudDot: g('--mud-dot'),
    path: g('--path'), start: g('--start'), end: g('--end'), on: g('--on-mark'), text: g('--text')
  };
  const a = hexToRgb(g('--visit-a')), b = hexToRgb(g('--visit-b'));
  LUT = [];
  for (let k = 0; k < 64; k++) {
    const t = k / 63;
    LUT.push(`rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * t)).join(',')})`);
  }
}

let raf = 0;
function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = T.line;
  ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c, x = c * CELL, y = r * CELL;
      const isMud = !walls[i] && weights[i] > 1;
      let fill = T.cell;
      if (walls[i]) fill = T.wall;
      else if (pathMark[i]) fill = T.path;
      else if (visOrder[i] >= 0) fill = LUT[Math.min(63, Math.floor((visOrder[i] / visTotal) * 63))];
      else if (isMud) fill = T.mud;
      ctx.fillStyle = fill;
      ctx.fillRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      if (isMud) {
        ctx.fillStyle = pathMark[i] ? T.on : T.mudDot;
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // the "head" of the search: outline the most recently explored cell
  if ((mode === 'running' || mode === 'paused') && pos > 0 && pos <= vCells.length) {
    const { r, c } = rcOf(vCells[pos - 1]);
    ctx.strokeStyle = T.text; ctx.lineWidth = 2;
    ctx.strokeRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
  }

  marker(start, T.start, 'S');
  marker(end, T.end, 'E');
}
function marker(i, color, letter) {
  const { r, c } = rcOf(i), cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = T.on;
  ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + 1);
}


/* ================================================================
   3. ANIMATOR
   The algorithm has already finished. We just replay its result:
   first the explored cells in order, then the final path.
   Modes: idle -> running <-> paused -> done
   ================================================================ */
let mode = 'idle';
let result = null, vCells = [], pCells = [], pos = 0, total = 0;
let runMs = 0, runKey = 'dijkstra', visCount = 0, visTotal = 1;
let lastTs = null, acc = 0;
const visOrder = new Int32Array(N).fill(-1);   // -1 = not explored, else exploration order
const pathMark = new Uint8Array(N);            // 1 = on final path

const RATES = [6, 12, 25, 45, 80, 140, 260, 500, 1200, Infinity];   // cells per second
const SPEED_LABELS = ['Crawl', 'Very slow', 'Slow', 'Relaxed', 'Medium', 'Brisk', 'Fast', 'Very fast', 'Turbo', 'Instant'];
let speed = 7;
const explorRate = () => RATES[speed - 1];
const pathRate = () => (explorRate() === Infinity ? Infinity : Math.min(Math.max(explorRate(), 40), 100));

function frame(ts) {
  raf = 0;
  if (mode === 'running') {
    const dt = lastTs == null ? 16 : Math.min(ts - lastTs, 100);
    lastTs = ts;
    const rate = pos < vCells.length ? explorRate() : pathRate();
    if (rate === Infinity) advance(total);
    else { acc += (dt / 1000) * rate; const n = Math.floor(acc); acc -= n; advance(n); }
    renderStats();
  }
  draw();
  if (mode === 'running') requestDraw();
}

function advance(n) {
  while (n-- > 0 && pos < total) {
    if (pos < vCells.length) { visOrder[vCells[pos]] = pos; visCount = pos + 1; }
    else pathMark[pCells[pos - vCells.length]] = 1;
    pos++;
  }
  if (pos >= total && mode !== 'done') complete();
}

function startRun(stepOnly) {
  clearPath();
  runKey = algoSel.value;
  const g = { rows: ROWS, cols: COLS, walls, weights };
  const t0 = performance.now();
  result = ALGOS[runKey].run(g, start, end);
  runMs = performance.now() - t0;
  vCells = result.visitedInOrder.map(p => idx(p.r, p.c));
  pCells = result.path.map(p => idx(p.r, p.c));
  visTotal = Math.max(1, vCells.length - 1);
  total = vCells.length + pCells.length;
  pos = 0; acc = 0; lastTs = null;
  if (stepOnly) {
    mode = 'paused'; setStatus('Stepping. Press Step again, or Resume to play.');
    advance(1);
  } else {
    mode = 'running'; setStatus(`Running ${ALGOS[runKey].name}...`);
    if (explorRate() === Infinity) advance(total);
  }
  syncUI(); renderStats(); requestDraw();
}

function complete() {
  mode = 'done';
  const steps = result.found ? result.path.length - 1 : null;
  history.unshift({ key: runKey, visited: vCells.length, steps, cost: result.found ? result.cost : null, ms: runMs });
  history = history.slice(0, 6);
  if (result.found) setStatus(`Path found: ${steps} steps, total cost ${result.cost}.`);
  else setStatus('No path found. The goal is walled off from the start.');
  const anyMud = weights.some((w, i) => w > 1 && !walls[i]);
  const info = ALGOS[runKey];
  $('note').textContent = result.found && anyMud && !info.usesWeights
    ? `${info.label} ignores mud costs, so its route can be more expensive than the cheapest one. Try Dijkstra or A* on the same board.`
    : '';
  renderHistory(); syncUI(); renderStats(); requestDraw();
}

function clearPath() {
  visOrder.fill(-1); pathMark.fill(0);
  result = null; vCells = []; pCells = []; pos = 0; total = 0; visCount = 0; visTotal = 1;
  mode = 'idle'; lastTs = null; acc = 0;
  $('note').textContent = '';
  setStatus('Ready. Draw some walls, then press Run.');
  syncUI(); renderStats(); requestDraw();
}


/* ================================================================
   4. BOARD EDITING (pointer events work for mouse, pen and touch)
   ================================================================ */
let brush = 'wall';
let drag = null;

function cellIndexFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const c = Math.min(COLS - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * COLS)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)));
  return idx(r, c);
}

// Bresenham line so fast drags don't leave gaps
function lineCells(a, b) {
  let { r: r0, c: c0 } = rcOf(a);
  const { r: r1, c: c1 } = rcOf(b);
  const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dc - dr; const out = [];
  for (;;) {
    out.push(idx(r0, c0));
    if (r0 === r1 && c0 === c1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c0 += sc; }
    if (e2 < dc) { err += dc; r0 += sr; }
  }
  return out;
}

function paintCell(i, type, b) {
  if (i === start || i === end) return;
  let changed = false;
  if (b === 'wall') {
    if (type === 'paint' && (!walls[i] || weights[i] > 1)) { walls[i] = 1; weights[i] = 1; changed = true; }
    else if (type === 'erase' && walls[i]) { walls[i] = 0; changed = true; }
  } else {
    if (walls[i]) return;
    if (type === 'paint' && weights[i] !== MUD) { weights[i] = MUD; changed = true; }
    else if (type === 'erase' && weights[i] !== 1) { weights[i] = 1; changed = true; }
  }
  if (changed) { boardChanged(); requestDraw(); }
}

function moveMarker(which, i) {
  if (walls[i]) return;
  if (which === 'start' ? i === end : i === start) return;
  if ((which === 'start' ? start : end) === i) return;
  if (which === 'start') start = i; else end = i;
  weights[i] = 1;
  boardChanged(); requestDraw();
}

canvas.addEventListener('pointerdown', e => {
  if (mode === 'running' || mode === 'paused') { setStatus('Press Reset to edit the board.'); return; }
  e.preventDefault();
  if (mode === 'done') clearPath();
  canvas.setPointerCapture(e.pointerId);
  const i = cellIndexFromEvent(e);
  if (i === start) drag = { type: 'start', last: i };
  else if (i === end) drag = { type: 'end', last: i };
  else {
    const erase = brush === 'wall' ? walls[i] === 1 : (!walls[i] && weights[i] > 1);
    drag = { type: erase ? 'erase' : 'paint', last: i, brush };
    paintCell(i, drag.type, drag.brush);
  }
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const i = cellIndexFromEvent(e);
  if (i === drag.last) return;
  if (drag.type === 'start' || drag.type === 'end') moveMarker(drag.type, i);
  else for (const k of lineCells(drag.last, i)) paintCell(k, drag.type, drag.brush);
  drag.last = i;
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Maze: randomized DFS ("recursive backtracker") carves a spanning tree of
// corridors through a solid grid, so a route always exists. Then ~8% of the
// interior walls are knocked out to create loops. Without loops there is
// exactly one route and every algorithm would look identical.
function generateMaze() {
  walls.fill(1); weights.fill(1);
  const stack = [[1, 1]];
  walls[idx(1, 1)] = 0;
  const jumps = [[-2, 0], [0, 2], [2, 0], [0, -2]];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = jumps.filter(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return nr > 0 && nc > 0 && nr < ROWS - 1 && nc < COLS - 1 && walls[idx(nr, nc)] === 1;
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dr, dc] = opts[Math.floor(Math.random() * opts.length)];
    walls[idx(r + dr / 2, c + dc / 2)] = 0;
    walls[idx(r + dr, c + dc)] = 0;
    stack.push([r + dr, c + dc]);
  }
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const between = (r % 2 === 1 && c % 2 === 0) || (r % 2 === 0 && c % 2 === 1);
      if (between && walls[idx(r, c)] && Math.random() < 0.08) walls[idx(r, c)] = 0;
    }
  }
  start = idx(1, 1);
  end = idx(ROWS - 2, COLS - 2);
}


/* ================================================================
   5. UI WIRING
   ================================================================ */
const $ = id => document.getElementById(id);
const algoSel = $('algo'), runBtn = $('runBtn'), stepBtn = $('stepBtn'), resetBtn = $('resetBtn');
const speedIn = $('speed'), speedOut = $('speedOut');
const brushWall = $('brushWall'), brushMud = $('brushMud');
const mazeBtn = $('mazeBtn'), mudBtn = $('mudBtn'), clearBtn = $('clearBtn');

let history = [];

function setStatus(msg) { $('status').textContent = msg; }

function boardChanged() {             // a different board means old runs are no longer comparable
  if (history.length) { history = []; renderHistory(); }
}

function syncUI() {
  const busy = mode === 'running' || mode === 'paused';
  const play = '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>';
  const pause = '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" fill="currentColor"/></svg>';
  runBtn.innerHTML = mode === 'running' ? pause + 'Pause' : mode === 'paused' ? play + 'Resume' : play + 'Run';
  stepBtn.disabled = mode === 'running';
  algoSel.disabled = busy;
  [mazeBtn, mudBtn, clearBtn, brushWall, brushMud].forEach(b => (b.disabled = busy));
}

function renderStats() {
  const dash = '-';
  if (!result) { ['sVisited', 'sSteps', 'sCost', 'sTime'].forEach(k => ($(k).textContent = dash)); return; }
  $('sVisited').textContent = mode === 'done' ? vCells.length : visCount;
  if (mode === 'done') {
    $('sSteps').textContent = result.found ? result.path.length - 1 : dash;
    $('sCost').textContent = result.found ? result.cost : dash;
    $('sTime').textContent = runMs < 1 ? runMs.toFixed(2) + ' ms' : runMs.toFixed(1) + ' ms';
  } else {
    $('sSteps').textContent = dash; $('sCost').textContent = dash; $('sTime').textContent = dash;
  }
}

function renderAbout() {
  const a = ALGOS[algoSel.value];
  $('aName').textContent = a.name;
  $('aDesc').textContent = a.desc;
  $('aDs').textContent = a.ds;
  $('aTime').textContent = a.time;
  $('aSpace').textContent = a.space;
  $('aOpt').textContent = a.optimal;
  $('aMud').textContent = a.usesWeights ? 'Yes, respects cost' : 'No, ignores cost';
}

function renderHistory() {
  const body = $('histBody');
  $('histClear').style.display = history.length ? '' : 'none';
  if (!history.length) {
    body.innerHTML = '<p class="empty">Run two or more algorithms on the same board to compare them here. Editing the board clears this list.</p>';
    return;
  }
  const rows = history.map(h => `<tr><td>${ALGOS[h.key].label}</td><td>${h.visited}</td><td>${h.steps ?? '-'}</td><td>${h.cost ?? '-'}</td></tr>`).join('');
  body.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Algorithm</th><th>Explored</th><th>Steps</th><th>Cost</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function setBrush(b) {
  brush = b;
  brushWall.setAttribute('aria-pressed', String(b === 'wall'));
  brushMud.setAttribute('aria-pressed', String(b === 'mud'));
}

function togglePlay() {
  if (mode === 'idle' || mode === 'done') startRun(false);
  else if (mode === 'running') { mode = 'paused'; setStatus('Paused. Press Resume, or Step one cell at a time.'); syncUI(); requestDraw(); }
  else if (mode === 'paused') { mode = 'running'; lastTs = null; setStatus(`Running ${ALGOS[runKey].name}...`); syncUI(); requestDraw(); }
}
function doStep() {
  if (mode === 'idle' || mode === 'done') startRun(true);
  else if (mode === 'paused') { advance(1); renderStats(); requestDraw(); }
}
function doReset() { clearPath(); }
function doMaze() {
  if (mode === 'running' || mode === 'paused') return;
  generateMaze(); clearPath(); boardChanged();
  setStatus('New maze. Start and goal moved to opposite corners.');
}
function doMud() {
  if (mode === 'running' || mode === 'paused') return;
  for (let i = 0; i < N; i++) if (!walls[i] && i !== start && i !== end) weights[i] = Math.random() < 0.14 ? MUD : 1;
  clearPath(); boardChanged(); setStatus('Mud scattered. Compare BFS with Dijkstra now.');
}
function doClear() {
  if (mode === 'running' || mode === 'paused') return;
  walls.fill(0); weights.fill(1); clearPath(); boardChanged();
}

runBtn.addEventListener('click', togglePlay);
stepBtn.addEventListener('click', doStep);
resetBtn.addEventListener('click', doReset);
mazeBtn.addEventListener('click', doMaze);
mudBtn.addEventListener('click', doMud);
clearBtn.addEventListener('click', doClear);
brushWall.addEventListener('click', () => setBrush('wall'));
brushMud.addEventListener('click', () => setBrush('mud'));
$('histClear').addEventListener('click', () => { history = []; renderHistory(); });
algoSel.addEventListener('change', () => { renderAbout(); if (mode === 'done') clearPath(); });
speedIn.addEventListener('input', () => { speed = +speedIn.value; speedOut.textContent = SPEED_LABELS[speed - 1]; });

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'SELECT' || tag === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); togglePlay(); }
  else if (k === 's') doStep();
  else if (k === 'r') doReset();
  else if (k === 'm') doMaze();
  else if (k === 'w' && !(mode === 'running' || mode === 'paused')) setBrush(brush === 'wall' ? 'mud' : 'wall');
});


/* ================================================================
   6. START UP
   ================================================================ */
if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
  speed = 10; speedIn.value = 10;
}
speedOut.textContent = SPEED_LABELS[speed - 1];

readTheme();
if (window.matchMedia) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); requestDraw(); });
}
new MutationObserver(() => { readTheme(); requestDraw(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

renderAbout();
renderHistory();
clearPath();
})();
