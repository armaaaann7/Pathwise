# Pathwise

*Get wise to how algorithms find the way.*

Pathwise is an interactive pathfinding visualizer. It shows how classic graph algorithms find a path through a grid, one step at a time. Draw walls, add costly "mud" cells, pick an algorithm and watch it explore.

Built with **vanilla JavaScript and HTML Canvas**. No framework, no build step, no dependencies.

**Live demo:** `https://armaaaann7.github.io/pathwise/` 

## Why this project

It demonstrates algorithm design and analysis in a form anyone can understand in seconds. Running several algorithms on the same maze makes their trade-offs visible: which one is optimal, which explores the least, which gets fooled by walls.

## Features

- **5 algorithms:** BFS, DFS, Dijkstra, A\*, Greedy Best-First
- **Step-by-step animation** with Run, Pause, Step, Reset and a 10-level speed slider (Crawl to Instant)
- **Draw the board:** drag to draw or erase walls, drag the start and goal markers
- **Weighted cells:** "mud" costs 5 to enter, which shows why Dijkstra and A\* differ from BFS
- **Maze generator:** randomized DFS (recursive backtracker) with extra loops so different algorithms give different results
- **Live stats:** cells explored, path steps, path cost, compute time
- **Compare runs:** a table of recent runs on the same board
- **Complexity panel:** time, space, data structure and optimality for the selected algorithm
- Light and dark theme (follows your system), keyboard shortcuts, touch support

**Shortcuts:** `Space` run/pause, `S` step, `R` reset, `W` switch brush, `M` new maze

## Quick start

No install needed. Open `index.html` in a browser.

To serve it locally instead:

```bash
npm start          # or: python3 -m http.server 8000
```

## Project structure

```
pathwise/
├── index.html                  Page markup (toolbar, canvas, side panels)
├── css/
│   └── style.css               Styles, light/dark theme tokens
├── js/
│   ├── algorithms.js           The 5 algorithms + min-heap. Pure functions, no DOM.
│   └── app.js                  Board state, canvas rendering, animator, UI wiring
├── tests/
│   └── algorithms.test.js      Unit + randomized tests (Node built-in test runner)
├── .github/workflows/test.yml  CI: runs the tests on every push and pull request
├── package.json
├── LICENSE
└── README.md
```

## How it works

The code is split into three layers so each part can be read and explained on its own:

```
Board state            Algorithm (pure function)           Animator + Renderer
walls[], weights[]  -> { visitedInOrder, path, cost, found } -> replays the result on the canvas
start, end                                                     (pause, step, speed live here)
```

1. **Board state.** The grid is two flat typed arrays (`walls` and `weights`). Cell `(row, col)` has index `row * 41 + col`. `weights[i]` is the cost to *enter* that cell (1 normally, 5 for mud).
2. **Algorithms** (`js/algorithms.js`). Every algorithm has the same signature and returns the full result at once: the cells it explored in order, the final path, its cost, and whether a path exists. They never touch the canvas.
3. **Animator** (`js/app.js`). Replays the finished result frame by frame: explored cells first (coloured from early to late), then the final path. Because the result is precomputed, pause, step and speed control are trivial and the algorithms stay clean.

### The algorithms

| Algorithm | Data structure | Time | Space | Shortest path? | Uses mud cost? |
|---|---|---|---|---|---|
| BFS | Queue | O(V + E) | O(V) | Yes, in steps | No |
| DFS | Stack | O(V + E) | O(V) | No | No |
| Dijkstra | Min-heap | O((V + E) log V) | O(V) | Yes | Yes |
| A\* | Min-heap + heuristic | O((V + E) log V) worst case | O(V) | Yes | Yes |
| Greedy best-first | Min-heap (heuristic only) | O((V + E) log V) | O(V) | No | No |

`V` is the number of cells and `E` is the number of connections between them (about `4V` on a grid).

- **BFS** explores in rings, so the first time it reaches the goal it used the fewest steps. It counts steps, not cost, so it walks straight through mud.
- **DFS** commits to one direction until stuck, then backtracks. It finds *a* path, often a very long one.
- **Dijkstra** always expands the cheapest known cell next, so the first time it reaches the goal, the cost is minimal.
- **A\*** is Dijkstra with a compass. It orders cells by `cost so far + Manhattan distance to goal`. Every step costs at least 1, so the estimate never overestimates and the result stays optimal, while far fewer cells are explored.
- **Greedy best-first** orders cells by distance to the goal only. Very fast, but it ignores the cost of the route so far, so walls can trick it into detours.

The min-heap is hand-written (`MinHeap` in `js/algorithms.js`) rather than re-sorting an array on every step.

### Maze generation

The maze uses a randomized depth-first "recursive backtracker" to carve corridors through a solid grid, which guarantees the start and goal are always connected. About 8% of interior walls are then removed to create loops. A perfect maze has exactly one route between any two cells, so every algorithm would return the same path and the comparison would be pointless.

## Things to try

1. On the starter board, run **BFS, Dijkstra, A\*, DFS** in turn and read the *Compare runs* table. All but DFS find a 48-step path, but A\* explores far fewer cells than Dijkstra, and DFS takes over 200 steps.
2. Click **Scatter mud**, then run **BFS** and **Dijkstra**. BFS ignores the extra cost and ends up with a more expensive route.
3. Click **Maze** and run **Greedy** vs **A\***.
4. Use **Step** and the slow speeds to watch exactly which cell each algorithm picks next.

## Testing

```bash
npm test
```

Requires Node 18 or newer. There are no dependencies to install. The tests cover:

- the min-heap ordering
- valid paths on open grids
- BFS and Dijkstra agreeing on path length when there is no mud
- Dijkstra beating BFS on cost when mud is present
- unreachable goals reported as "no path" by all five algorithms
- a randomized check on 2,000 boards: all algorithms agree on whether a path exists, paths are valid, A\* always matches Dijkstra's cost, nothing beats BFS on steps or Dijkstra on cost, and A\* never explores more cells than Dijkstra

The same tests run automatically on GitHub for every push and pull request (`.github/workflows/test.yml`).

## Deploy to GitHub Pages

1. Push the repo to GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. After a minute the site is live at `https://armaaaann7.github.io/pathwise/`.

## Roadmap

- Diagonal movement
- A\* heuristic picker (Manhattan, Euclidean, Chebyshev)
- Side-by-side comparison of two algorithms running at once
- Shareable boards via URL
- More algorithms (bidirectional BFS, Jump Point Search)

## License

MIT. See [LICENSE](LICENSE). R
