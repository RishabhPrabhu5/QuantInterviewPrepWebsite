/* ============================================================
   CODING SECTION — problems + pyodide runner + desk coach
   ============================================================ */
const PETS_SETUP = `
def _make_pets():
    rng = np.random.default_rng(7)
    n = 400
    species = rng.choice(['dog', 'cat', 'bird'], n, p=[.5, .4, .1])
    variants = {'dog': ['dog','Dog','DOG'], 'cat': ['cat','Cat','CAT'], 'bird': ['bird','Bird','BIRD']}
    disp = [variants[s][rng.integers(0, 3)] for s in species]
    age = rng.integers(1, 15, n).astype(float)
    weight = np.where(species == 'dog', rng.normal(25, 8, n), np.where(species == 'cat', rng.normal(4.5, 1, n), rng.normal(0.4, 0.1, n)))
    base = np.array([{'dog': 320, 'cat': 180, 'bird': 90}[s] for s in species])
    y1 = np.clip(base + 12 * age + rng.normal(0, 60, n), 0, None).round(0)
    y2 = np.clip(0.6 * y1 + 0.4 * (base + 12 * age) + rng.normal(0, 50, n), 0, None).round(0)
    df = pd.DataFrame({'pet_id': np.arange(n), 'species': disp, 'age_years': age,
                       'weight_kg': weight.round(1), 'y1_claims': y1, 'y2_claims': y2})
    bad_age = rng.choice(n, 40, replace=False); df.loc[bad_age, 'age_years'] = -1.0
    bad_w = rng.choice(n, 30, replace=False); df.loc[bad_w, 'weight_kg'] = np.nan
    bad_y1 = rng.choice(n, 25, replace=False); df.loc[bad_y1, 'y1_claims'] = np.nan
    train = df[df['pet_id'] < 320].copy()
    test = df[df['pet_id'] >= 320].copy()
    truth = test['y2_claims'].to_numpy()
    test = test.drop(columns=['y2_claims'])
    dup = train.sample(15, random_state=3)
    train = pd.concat([train, dup], ignore_index=True).sample(frac=1, random_state=4).reset_index(drop=True)
    return train, test, truth

PETS_TRAIN, PETS_TEST, _PETS_TRUTH = _make_pets()
PETS_NAIVE_MAE = float(np.mean(np.abs(_PETS_TRUTH - PETS_TRAIN['y2_claims'].mean())))

def pets_mae(fn):
    preds = np.asarray(fn(PETS_TRAIN.copy(), PETS_TEST.copy()), dtype=float)
    assert len(preds) == len(PETS_TEST), "prediction length mismatch"
    return float(np.mean(np.abs(preds - _PETS_TRUTH)))
`;

const TICKS_SETUP = `
def _make_ticks():
    rng = np.random.default_rng(11)
    n = 500
    t = np.sort(rng.integers(0, 3000, n))
    px = 100 + np.cumsum(rng.normal(0, 0.05, n))
    sz = rng.integers(1, 100, n).astype(float)
    df = pd.DataFrame({'t': t, 'px': px.round(2), 'sz': sz})
    bad = rng.choice(n, 25, replace=False)
    df.loc[bad[:10], 'px'] = -999.0
    df.loc[bad[10:18], 'px'] = 0.0
    df.loc[bad[18:], 'px'] = np.nan
    ff = rng.choice(np.setdiff1d(np.arange(n), bad), 5, replace=False)
    df.loc[ff, 'px'] = df.loc[ff, 'px'] * 100
    dup = df.sample(20, random_state=5)
    df = pd.concat([df, dup], ignore_index=True).sample(frac=1, random_state=9).reset_index(drop=True)
    return df

TICKS = _make_ticks()
`;

const RENT_SETUP = `
def _make_rent():
    rng = np.random.default_rng(21)
    n = 500
    nb = rng.choice(['downtown', 'midtown', 'uptown', 'suburbs'], n, p=[.3, .3, .2, .2])
    mess = {'downtown': ['downtown','Downtown',' DOWNTOWN'], 'midtown': ['midtown','Midtown ','MIDTOWN'],
            'uptown': ['uptown','Uptown','UPTOWN '], 'suburbs': ['suburbs',' Suburbs','SUBURBS']}
    nb_disp = [mess[x][rng.integers(0, 3)] for x in nb]
    sqft = np.clip(rng.normal(850, 280, n), 320, 2200).round(0)
    beds = np.clip((sqft / 420 + rng.normal(0, 0.5, n)).round(0), 0, 4)
    park_true = rng.random(n) < 0.4
    pk = np.array(['yes', 'no'])[(~park_true).astype(int)]
    pk = np.array([{'yes': ['yes','Y','YES'], 'no': ['no','N','NO']}[p][rng.integers(0, 3)] for p in pk], dtype=object)
    base = np.array([{'downtown': 1900, 'midtown': 1550, 'uptown': 1300, 'suburbs': 950}[x] for x in nb])
    rent = (base + 2.1 * sqft + 140 * beds + 300 * park_true + rng.normal(0, 130, n)).round(0)
    df = pd.DataFrame({'apt_id': np.arange(n), 'neighborhood': nb_disp, 'sqft': sqft, 'beds': beds, 'parking': pk, 'rent': rent})
    z = rng.choice(n, 35, replace=False); df.loc[z, 'sqft'] = 0.0
    pn = rng.choice(n, 30, replace=False); df.loc[pn, 'parking'] = None
    train = df[df['apt_id'] < 400].copy()
    test = df[df['apt_id'] >= 400].copy()
    truth = test['rent'].to_numpy()
    test = test.drop(columns=['rent'])
    return train, test, truth

RENT_TRAIN, RENT_TEST, _RENT_TRUTH = _make_rent()
RENT_NAIVE_MAE = float(np.mean(np.abs(_RENT_TRUTH - RENT_TRAIN['rent'].mean())))

def rent_mae(fn):
    preds = np.asarray(fn(RENT_TRAIN.copy(), RENT_TEST.copy()), dtype=float)
    assert len(preds) == len(RENT_TEST), "prediction length mismatch"
    return float(np.mean(np.abs(preds - _RENT_TRUTH)))
`;

const CODING_PROBLEMS = [
/* ================= ALGORITHMS ================= */
{ id:"a1", mode:"algo", diff:1, title:"Two Sum (warmup)",
  desc:`Given a list of integers nums and an integer target, return the indices of the two numbers that add up to target, as a sorted list [i, j]. Exactly one solution exists; you may not use the same element twice.

Example: nums = [2, 7, 11, 15], target = 9  →  [0, 1]

Target: O(n) time with a hash map.`,
  hints:[
    "For each element x, you already know exactly what its partner must be: target − x.",
    "Keep a dict mapping value → index as you scan. Before inserting x, check whether target − x is already in the dict.",
    "One pass: for i, x in enumerate(nums): if target − x in seen: return sorted([seen[target−x], i]); seen[x] = i."],
  review:[{re:"\\{|dict\\(", miss:"No dict in sight — the O(n) solution needs a value → index hash map."}],
  starter:`def two_sum(nums, target):
    # return sorted [i, j] with nums[i] + nums[j] == target
    pass
`,
  solution:`def two_sum(nums, target):
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:
            return sorted([seen[target - x], i])
        seen[x] = i
`,
  tests:[
    { call:"two_sum([2, 7, 11, 15], 9)",        expected:"[0, 1]",  show:true },
    { call:"two_sum([3, 2, 4], 6)",             expected:"[1, 2]",  show:true },
    { call:"two_sum([-3, 4, 3, 90], 0)",        expected:"[0, 2]",  show:false },
    { call:"two_sum([5, 5], 10)",               expected:"[0, 1]",  show:false },
  ]},
{ id:"a2", mode:"algo", diff:1, title:"Buy & Sell Once (warmup)",
  desc:`prices[i] is a stock's price on day i. Choose one day to buy and a later day to sell to maximize profit. Return the max profit (0 if no profitable trade exists).

Example: [7, 1, 5, 3, 6, 4] → 5  (buy at 1, sell at 6)

Target: one pass, O(1) space — track the running minimum.`,
  hints:[
    "At each day, if you were to sell today, when would you have wanted to buy?",
    "Track the minimum price seen so far; the best sale today is price − min_so_far.",
    "best = max(best, p − low); low = min(low, p) — one line each per element."],
  review:[],
  starter:`def max_profit(prices):
    pass
`,
  solution:`def max_profit(prices):
    best, low = 0, float('inf')
    for p in prices:
        low = min(low, p)
        best = max(best, p - low)
    return best
`,
  tests:[
    { call:"max_profit([7, 1, 5, 3, 6, 4])", expected:"5", show:true },
    { call:"max_profit([7, 6, 4, 3, 1])",    expected:"0", show:true },
    { call:"max_profit([2, 4, 1, 8])",       expected:"7", show:false },
    { call:"max_profit([5])",                expected:"0", show:false },
  ]},
{ id:"a3", mode:"algo", diff:2, title:"Longest Substring, No Repeats",
  desc:`Given a string s, return the length of the longest substring without repeating characters.

Example: "abcabcbb" → 3 ("abc")   ·   "bbbbb" → 1   ·   "pwwkew" → 3 ("wke")

Target: sliding window, O(n).`,
  hints:[
    "Maintain a window [start, i] that never contains a repeat. When does start need to move?",
    "Store each character's last-seen index. On a repeat INSIDE the window, jump start past it.",
    "if c in last and last[c] >= start: start = last[c] + 1 — the >= start guard is the classic bug."],
  review:[],
  starter:`def longest_unique(s):
    pass
`,
  solution:`def longest_unique(s):
    last, start, best = {}, 0, 0
    for i, c in enumerate(s):
        if c in last and last[c] >= start:
            start = last[c] + 1
        last[c] = i
        best = max(best, i - start + 1)
    return best
`,
  tests:[
    { call:"longest_unique('abcabcbb')", expected:"3", show:true },
    { call:"longest_unique('bbbbb')",    expected:"1", show:true },
    { call:"longest_unique('pwwkew')",   expected:"3", show:false },
    { call:"longest_unique('')",         expected:"0", show:false },
    { call:"longest_unique('dvdf')",     expected:"3", show:false },
  ]},
{ id:"a4", mode:"algo", diff:2, title:"Merge Intervals",
  desc:`Given a list of [start, end] intervals, merge all overlapping intervals and return the result sorted by start.

Example: [[1,3],[2,6],[8,10],[15,18]] → [[1,6],[8,10],[15,18]]

Target: sort + single sweep. Touching intervals ([1,4],[4,5]) merge.`,
  hints:[
    "What ordering makes overlaps easy to detect between neighbors only?",
    "After sorting by start, an interval overlaps the merged pile iff its start ≤ the pile's last end.",
    "for s, e in sorted(intervals): extend out[-1][1] or append [s, e]."],
  review:[{re:"sorted|\\.sort", miss:"Without sorting first, overlap detection needs O(n²) — sort by start."}],
  starter:`def merge_intervals(intervals):
    pass
`,
  solution:`def merge_intervals(intervals):
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out
`,
  tests:[
    { call:"merge_intervals([[1,3],[2,6],[8,10],[15,18]])", expected:"[[1,6],[8,10],[15,18]]", show:true },
    { call:"merge_intervals([[1,4],[4,5]])",                expected:"[[1,5]]",                show:true },
    { call:"merge_intervals([[5,6],[1,2]])",                expected:"[[1,2],[5,6]]",          show:false },
    { call:"merge_intervals([[1,10],[2,3],[4,5]])",         expected:"[[1,10]]",               show:false },
  ]},
{ id:"a5", mode:"algo", diff:2, title:"Daily Temperatures",
  desc:`temps[i] is the temperature on day i. Return a list where answer[i] is the number of days you wait for a warmer temperature (0 if none comes).

Example: [73,74,75,71,69,72,76,73] → [1,1,4,2,1,1,0,0]

Target: monotonic stack, O(n). (This exact structure — "next event that exceeds this level" — is everywhere in order-book code.)`,
  hints:[
    "Brute force is O(n²). What information about past days becomes useless once a warm day arrives?",
    "Keep a stack of indices with strictly decreasing temperatures — a new temp resolves everything cooler on top.",
    "while stack and temps[stack[-1]] < t: j = stack.pop(); ans[j] = i − j."],
  review:[],
  starter:`def daily_temperatures(temps):
    pass
`,
  solution:`def daily_temperatures(temps):
    ans, stack = [0] * len(temps), []   # stack of indices, temps decreasing
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans
`,
  tests:[
    { call:"daily_temperatures([73,74,75,71,69,72,76,73])", expected:"[1,1,4,2,1,1,0,0]", show:true },
    { call:"daily_temperatures([30,40,50,60])",             expected:"[1,1,1,0]",         show:true },
    { call:"daily_temperatures([90,80,70])",                expected:"[0,0,0]",           show:false },
    { call:"daily_temperatures([50])",                      expected:"[0]",               show:false },
  ]},
{ id:"a6", mode:"algo", diff:2, title:"Sliding Window Maximum",
  desc:`Given nums and window size k, return the maximum of each contiguous window of length k, left to right.

Example: nums = [1,3,-1,-3,5,3,6,7], k = 3 → [3,3,5,5,6,7]

Target: O(n) with a monotonic deque — the recomputing-max-per-window O(nk) version is the "you'd fail HRT" answer. This is literally "best bid over the last k updates."`,
  hints:[
    "When a new element arrives, which older elements can never again be a window max?",
    "Keep a deque of INDICES with decreasing values: pop smaller values from the back before pushing, pop from the front when the index leaves the window.",
    "from collections import deque; pop back while nums[dq[-1]] <= x; if dq[0] <= i − k: popleft; append window max nums[dq[0]] once i ≥ k−1."],
  review:[{re:"deque", miss:"No deque — the O(n) solution keeps a monotonic deque of indices (collections.deque)."}],
  starter:`from collections import deque

def window_max(nums, k):
    pass
`,
  solution:`from collections import deque

def window_max(nums, k):
    dq, out = deque(), []          # indices, values decreasing
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out
`,
  tests:[
    { call:"window_max([1,3,-1,-3,5,3,6,7], 3)", expected:"[3,3,5,5,6,7]", show:true },
    { call:"window_max([9,8,7,6], 2)",           expected:"[9,8,7]",       show:true },
    { call:"window_max([1], 1)",                 expected:"[1]",           show:false },
    { call:"window_max([4,4,4], 2)",             expected:"[4,4]",         show:false },
    { call:"window_max([1,2,3,4,3,2,1], 3)",     expected:"[3,4,4,4,3]",   show:false },
  ]},
{ id:"a7", mode:"algo", diff:3, title:"Running Median",
  desc:`Given a stream of numbers (a list), return the median after EACH element arrives. For an even count, the median is the average of the two middle values.

Example: [2,1,5,7,2,0,5] → [2, 1.5, 2, 3.5, 2, 2.0, 2]

Target: O(n log n) total with two heaps (max-heap of the low half, min-heap of the high half). Sorting per element is O(n² log n) — an instant follow-up question at HRT/Jump.`,
  hints:[
    "You need fast access to the two middle elements as data streams in. What pair of structures gives you 'largest of the small half' and 'smallest of the large half'?",
    "Two heaps: max-heap (negate values, heapq is a min-heap) for the lower half, min-heap for the upper half. Keep sizes balanced within 1.",
    "Push onto the low heap, move its top to the high heap, then rebalance if high grew larger — this ordering handles all cases without branching on the value."],
  review:[{re:"heapq|heappush", miss:"No heapq usage — sorting inside the loop is the O(n² log n) trap this question exists to catch."}],
  starter:`import heapq

def running_median(nums):
    pass
`,
  solution:`import heapq

def running_median(nums):
    low, high, out = [], [], []    # low: max-heap (negated), high: min-heap
    for x in nums:
        heapq.heappush(low, -x)
        heapq.heappush(high, -heapq.heappop(low))
        if len(high) > len(low):
            heapq.heappush(low, -heapq.heappop(high))
        out.append(-low[0] if len(low) > len(high) else (-low[0] + high[0]) / 2)
    return out
`,
  tests:[
    { call:"running_median([2,1,5,7,2,0,5])", expected:"[2, 1.5, 2, 3.5, 2, 2.0, 2]", show:true },
    { call:"running_median([5,4,3,2,1])",     expected:"[5, 4.5, 4, 3.5, 3]",         show:true },
    { call:"running_median([1,2])",           expected:"[1, 1.5]",                    show:false },
    { call:"running_median([10,10,10])",      expected:"[10, 10.0, 10]",              show:false },
  ]},
{ id:"a8", mode:"algo", diff:3, title:"Matching Engine",
  desc:`Implement a limit-order matching engine. Events arrive as ['B'|'S', price, qty] (a limit buy/sell). An incoming BUY matches resting sells with sell_px ≤ buy_px; an incoming SELL matches resting buys with buy_px ≥ sell_px. Matching rules:
• best price first (lowest ask / highest bid),
• FIFO time priority within a price level,
• trades execute at the RESTING order's price,
• partial fills allowed; any unfilled remainder rests in the book.
Return the list of trades as [price, qty], in execution order.

Example: [['B',100,5], ['S',99,3]] → [[100, 3]]  (the sell crosses and trades at the resting bid's price)

This is the canonical HFT interview problem — correctness on price-time priority is the whole game.`,
  hints:[
    "Keep two books: resting bids and resting asks. For each you need 'best price, earliest arrival' — a sort key or a heap.",
    "A heap works: asks keyed (px, seq), bids keyed (−px, seq). Loop: while incoming qty > 0 and the best opposite order crosses, fill min(qty, resting qty) at the RESTING price.",
    "Careful with partial fills of the resting order — decrement its qty and leave it at the front, don't pop it entirely. And only push the remainder of the incoming order after matching completes."],
  review:[{re:"heap|sort", miss:"You need explicit best-price-then-time ordering — a heap keyed (price, seq) or equivalent."}],
  starter:`import heapq

def match_orders(events):
    # events: list of [side, price, qty]; return trades as [price, qty]
    pass
`,
  solution:`import heapq

def match_orders(events):
    bids, asks, seq, trades = [], [], 0, []      # heaps: (key, seq, [qty], px)
    for side, px, qty in events:
        seq += 1
        if side == 'B':
            while qty > 0 and asks and asks[0][3] <= px:
                q = min(qty, asks[0][2][0])
                trades.append([asks[0][3], q])
                qty -= q; asks[0][2][0] -= q
                if asks[0][2][0] == 0: heapq.heappop(asks)
            if qty > 0: heapq.heappush(bids, (-px, seq, [qty], px))
        else:
            while qty > 0 and bids and bids[0][3] >= px:
                q = min(qty, bids[0][2][0])
                trades.append([bids[0][3], q])
                qty -= q; bids[0][2][0] -= q
                if bids[0][2][0] == 0: heapq.heappop(bids)
            if qty > 0: heapq.heappush(asks, (px, seq, [qty], px))
    return trades
`,
  tests:[
    { call:"match_orders([['B',100,5],['S',99,3]])", expected:"[[100, 3]]", show:true },
    { call:"match_orders([['B',100,5],['S',99,3],['S',101,4],['B',102,5]])", expected:"[[100, 3], [101, 4]]", show:true },
    { call:"match_orders([['S',101,2],['S',101,3],['S',100,1],['B',101,5]])", expected:"[[100, 1], [101, 2], [101, 2]]", show:false },
    { call:"match_orders([['B',50,10],['S',50,4],['S',50,7]])", expected:"[[50, 4], [50, 6]]", show:false },
    { call:"match_orders([['B',10,1],['B',11,1],['S',9,3]])", expected:"[[11, 1], [10, 1]]", show:false },
  ]},
{ id:"a9", mode:"algo", diff:3, title:"Trapping Rain Water",
  desc:`Given an elevation map (list of non-negative ints), compute how much water it traps after raining.

Example: [0,1,0,2,1,0,1,3,2,1,2,1] → 6

Target: O(n) time, O(1) space with two pointers (the O(n)-space prefix-max version is a warmup; say both).`,
  hints:[
    "Water above position i = min(max height to the left, max height to the right) − height[i]. Why?",
    "Two pointers from the ends: the side with the smaller current max is the binding constraint — you can settle that column immediately.",
    "if left_max <= right_max: water += left_max − h[l] (if positive); advance l. Mirror on the right."],
  review:[],
  starter:`def trap(height):
    pass
`,
  solution:`def trap(height):
    l, r = 0, len(height) - 1
    lmax = rmax = water = 0
    while l < r:
        if height[l] < height[r]:
            lmax = max(lmax, height[l])
            water += lmax - height[l]
            l += 1
        else:
            rmax = max(rmax, height[r])
            water += rmax - height[r]
            r -= 1
    return water
`,
  tests:[
    { call:"trap([0,1,0,2,1,0,1,3,2,1,2,1])", expected:"6", show:true },
    { call:"trap([4,2,0,3,2,5])",             expected:"9", show:true },
    { call:"trap([1,2,3])",                   expected:"0", show:false },
    { call:"trap([])",                        expected:"0", show:false },
    { call:"trap([5,0,5,0,5])",               expected:"10", show:false },
  ]},
{ id:"a10", mode:"algo", diff:2, title:"Course Schedule (Cycle Detection)",
  desc:`n tasks labeled 0…n−1; prereqs is a list of [a, b] meaning "b must run before a". Return True iff all tasks can be completed (i.e., the dependency graph has no cycle).

Example: n=2, [[1,0]] → True   ·   n=2, [[1,0],[0,1]] → False

Target: topological sort (Kahn's) or DFS coloring. Dependency-graph cycle detection shows up constantly in build systems and pricing-graph questions at Jump.`,
  hints:[
    "A dependency graph is completable iff it's a DAG. What are the two standard DAG tests?",
    "Kahn's algorithm: repeatedly remove nodes with in-degree 0. If you can remove all n, no cycle.",
    "Build adjacency + indegree arrays; BFS from all indegree-0 nodes; count processed == n."],
  review:[],
  starter:`from collections import deque

def can_finish(n, prereqs):
    pass
`,
  solution:`from collections import deque

def can_finish(n, prereqs):
    adj = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in prereqs:
        adj[b].append(a)
        indeg[a] += 1
    q = deque(i for i in range(n) if indeg[i] == 0)
    seen = 0
    while q:
        u = q.popleft(); seen += 1
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0: q.append(v)
    return seen == n
`,
  tests:[
    { call:"can_finish(2, [[1,0]])",                     expected:"True",  show:true },
    { call:"can_finish(2, [[1,0],[0,1]])",               expected:"False", show:true },
    { call:"can_finish(4, [[1,0],[2,1],[3,2]])",         expected:"True",  show:false },
    { call:"can_finish(5, [[0,1],[1,2],[2,0],[3,4]])",   expected:"False", show:false },
    { call:"can_finish(3, [])",                          expected:"True",  show:false },
  ]},

/* ================= DATA & ML ================= */
{ id:"d1", mode:"data", diff:1, title:"Daily Returns (warmup)",
  desc:`You get a DataFrame df with columns ['date', 'close'] in date order. Return the list of simple daily returns (close_t / close_{t−1} − 1), skipping the first row.

Example: closes [100, 102, 99.96] → [0.02, -0.02]

One-liner territory: pct_change.`,
  hints:[
    "pandas has a method that computes exactly this on a Series.",
    "df['close'].pct_change() — then deal with the NaN in row 0.",
    "return df['close'].pct_change().dropna().tolist()"],
  review:[],
  starter:`import pandas as pd

def daily_returns(df):
    # return a plain Python list of floats
    pass
`,
  solution:`import pandas as pd

def daily_returns(df):
    return df['close'].pct_change().dropna().tolist()
`,
  tests:[
    { call:"daily_returns(pd.DataFrame({'date':['d1','d2','d3'],'close':[100.0,102.0,99.96]}))", expected:"[0.02, -0.02]", show:true },
    { call:"daily_returns(pd.DataFrame({'date':['d1','d2'],'close':[50.0,55.0]}))",              expected:"[0.1]",        show:true },
    { call:"daily_returns(pd.DataFrame({'date':['d1','d2','d3','d4'],'close':[10.0,10.0,12.0,9.0]}))", expected:"[0.0, 0.2, -0.25]", show:false },
  ]},
{ id:"d3", mode:"data", diff:1, title:"Max Drawdown (warmup)",
  desc:`df has column 'close' (an equity curve). Return the maximum drawdown as a POSITIVE fraction: the largest peak-to-trough decline, max(1 − close/running_peak).

Example: [100, 120, 90, 100] → peak 120 → trough 90 → drawdown 0.25

Target: cummax, fully vectorized.`,
  hints:[
    "At each point, the relevant peak is the running maximum so far.",
    "cummax() gives the running peak as a Series; drawdown is elementwise 1 − close/peak.",
    "return float((1 − df['close']/df['close'].cummax()).max())"],
  review:[{re:"cummax", miss:"cummax() is the vectorized running peak — a Python loop here is a red flag in interviews."}],
  starter:`import pandas as pd

def max_drawdown(df):
    # return a float, e.g. 0.25 for a 25% drawdown
    pass
`,
  solution:`import pandas as pd

def max_drawdown(df):
    peak = df['close'].cummax()
    return float((1 - df['close'] / peak).max())
`,
  tests:[
    { call:"max_drawdown(pd.DataFrame({'close':[100.0,120.0,90.0,100.0]}))", expected:"0.25", show:true },
    { call:"max_drawdown(pd.DataFrame({'close':[1.0,2.0,3.0]}))",            expected:"0.0",  show:true },
    { call:"max_drawdown(pd.DataFrame({'close':[10.0,5.0,8.0,4.0]}))",       expected:"0.6",  show:false },
  ]},
{ id:"d5", mode:"data", diff:2, title:"SMA Crossover Signal",
  desc:`df has column 'close'. Compute short- and long-window simple moving averages and return a list of ints: 1 where SMA(short) > SMA(long), else 0. Rows where the long SMA is not yet defined are 0.

Example: closes [1..6], short=2, long=3 → [0, 0, 1, 1, 1, 1]

Target: rolling().mean(), boolean ops, astype — no loops.`,
  hints:[
    "rolling(w).mean() produces NaN until the window fills — that's your 'not yet defined' for free.",
    "Compare the two SMA Series directly; a comparison with NaN is False, but be explicit anyway.",
    "((s > l) & l.notna()).astype(int).tolist()"],
  review:[{re:"rolling", miss:"Use .rolling(window).mean() — hand-rolled loops for moving averages are the anti-pattern being screened."}],
  starter:`import pandas as pd

def sma_signal(df, short, long):
    # return list of 0/1 ints, same length as df
    pass
`,
  solution:`import pandas as pd

def sma_signal(df, short, long):
    s = df['close'].rolling(short).mean()
    l = df['close'].rolling(long).mean()
    return ((s > l) & l.notna()).astype(int).tolist()
`,
  tests:[
    { call:"sma_signal(pd.DataFrame({'close':[1.0,2,3,4,5,6]}), 2, 3)", expected:"[0,0,1,1,1,1]", show:true },
    { call:"sma_signal(pd.DataFrame({'close':[5.0,4,3,2,1]}), 2, 3)",   expected:"[0,0,0,0,0]",   show:true },
    { call:"sma_signal(pd.DataFrame({'close':[1.0,3,2,5,1,1,1]}), 2, 4)", expected:"[0,0,0,1,1,0,0]", show:false },
  ]},
{ id:"dm2", mode:"data", diff:2, title:"Clean the Tick Tape",
  desc:`A global DataFrame TICKS is preloaded: ~520 rows of trade prints with columns ['t' (seconds), 'px', 'sz'] — and it's filthy: bad prints encoded as −999 / 0 / NaN, a few fat-fingered prices (×100), and duplicated rows from a feed replay.

Write clean_ticks(df) applying EXACTLY these rules, in order:
1. Drop rows where px is NaN or ≤ 0.
2. Drop rows where px > 5 × the median px of what remains after step 1.
3. Drop exact duplicate rows (all columns), keeping the first.
Return {'n_good': <int rows remaining>, 'vwap': <Σ(px·sz)/Σ(sz), rounded to 2 dp>}.

This is the unglamorous 80% of every quant-research job: precise, ordered cleaning rules, no creativity.`,
  hints:[
    "Boolean masks chain naturally: df[df.px.notna() & (df.px > 0)]. Compute the median AFTER this filter, or rule 2 is wrong.",
    "The fat-finger filter must use the median of the step-1 survivors — the −999s would poison a median taken earlier.",
    "d = df[df.px.notna() & (df.px>0)]; d = d[d.px <= 5*d.px.median()]; d = d.drop_duplicates(); then the vwap is one line."],
  review:[
    {re:"notna|isna|dropna", miss:"No NaN handling — rule 1 drops NaN prices."},
    {re:"drop_duplicates", miss:"No drop_duplicates() — the replayed rows are still in your data."},
    {re:"median", miss:"Rule 2 needs the median of the post-step-1 data for the fat-finger cutoff."}],
  setup:TICKS_SETUP,
  starter:`import pandas as pd
import numpy as np

def clean_ticks(df):
    # rules 1-3 in order, then {'n_good': int, 'vwap': float (2dp)}
    pass
`,
  solution:`import pandas as pd

def clean_ticks(df):
    d = df[df['px'].notna() & (df['px'] > 0)]
    d = d[d['px'] <= 5 * d['px'].median()]
    d = d.drop_duplicates()
    return {'n_good': int(len(d)),
            'vwap': round(float((d['px'] * d['sz']).sum() / d['sz'].sum()), 2)}
`,
  tests:[
    { call:"clean_ticks(TICKS.copy())['n_good']", expected:"470", show:true, label:"row count after cleaning" },
    { call:"clean_ticks(TICKS.copy())", expected:"{'n_good': 470, 'vwap': 100.64}", show:false, label:"full result dict" },
  ]},
{ id:"dm1", mode:"data", diff:3, title:"Pet Insurance Claims (Jump-style)",
  desc:`The real thing. Globals PETS_TRAIN (~335 rows, includes 'y2_claims') and PETS_TEST (80 rows, no 'y2_claims') are preloaded with columns:
  pet_id · species · age_years · weight_kg · y1_claims · [y2_claims]

The data is a mess, on purpose:
• species strings mix case: 'dog', 'Dog', 'DOG', …
• age_years uses −1 as a missing-value sentinel
• weight_kg and y1_claims have NaNs
• a merge bug duplicated some training pets (same pet_id twice)

Write predict_claims(train, test) returning a list of predicted year-2 claims for each test row, in order. Grading (MAE vs held-out truth):
• beat the naive predict-the-global-mean baseline (MAE ≈ 101)
• hidden bar: MAE < 55 — species averages alone (~65) won't cut it; you need age and y1_claims in the model. A cleaned linear regression (np.linalg.lstsq) or per-species fits get ~42.

Exactly the shape of Jump's data screen: clean → feature → fit → predict, in 30 minutes.`,
  hints:[
    "Pipeline: (1) dedupe train on pet_id, (2) species.str.lower(), (3) replace age −1 with NaN then impute (species median), (4) impute y1_claims, (5) fit something using species, age, y1.",
    "y2 was generated as roughly 0.6·y1 + 0.4·(species base + 12·age) + noise — so a linear model on [age, y1, species dummies] is the right shape. pd.get_dummies for species.",
    "X = np.column_stack([np.ones(len(tr)), tr.age_years, tr.y1_claims, pd.get_dummies(tr.species).to_numpy(float)]); beta = np.linalg.lstsq(X, y, rcond=None)[0]; build the same matrix for test (reindex dummy columns!) and return Xt @ beta."],
  review:[
    {re:"drop_duplicates", miss:"Duplicated training pets are still in — drop_duplicates(subset='pet_id')."},
    {re:"lower|casefold|upper", miss:"'Dog' ≠ 'dog' ≠ 'DOG' until you normalize case — any groupby/dummies without it fragments into 9 species."},
    {re:"-1|< *0|sentinel", miss:"age_years uses −1 as a sentinel; treat it as missing, don't feed it to a model."},
    {re:"fillna|dropna|impute", miss:"NaNs in y1_claims/weight need explicit handling before fitting."},
    {re:"lstsq|polyfit|groupby", miss:"No model detected — the hidden MAE bar needs a fit on age + y1 (lstsq / polyfit / per-group regressions)."}],
  setup:PETS_SETUP,
  starter:`import pandas as pd
import numpy as np

def predict_claims(train, test):
    # return a list of len(test) predictions of y2_claims
    pass
`,
  solution:`import pandas as pd
import numpy as np

def predict_claims(train, test):
    def clean(d):
        d = d.copy()
        d['species'] = d['species'].str.lower()
        d.loc[d['age_years'] < 0, 'age_years'] = np.nan
        d['age_years'] = d['age_years'].fillna(d.groupby('species')['age_years'].transform('median'))
        d['y1_claims'] = d['y1_claims'].fillna(d.groupby('species')['y1_claims'].transform('median'))
        return d
    tr = clean(train.drop_duplicates(subset='pet_id'))
    te = clean(test)
    D = pd.get_dummies(tr['species'])
    X = np.column_stack([np.ones(len(tr)), tr['age_years'], tr['y1_claims'], D.to_numpy(dtype=float)])
    beta, *_ = np.linalg.lstsq(X, tr['y2_claims'].to_numpy(), rcond=None)
    Dt = pd.get_dummies(te['species']).reindex(columns=D.columns, fill_value=0)
    Xt = np.column_stack([np.ones(len(te)), te['age_years'], te['y1_claims'], Dt.to_numpy(dtype=float)])
    return (Xt @ beta).tolist()
`,
  tests:[
    { call:"len(predict_claims(PETS_TRAIN.copy(), PETS_TEST.copy())) == len(PETS_TEST)", expected:"True", show:true, label:"returns one prediction per test pet" },
    { call:"pets_mae(predict_claims) < PETS_NAIVE_MAE", expected:"True", show:true, label:"beats naive global-mean baseline (MAE ~101)" },
    { call:"pets_mae(predict_claims) < 55.0", expected:"True", show:false, label:"hidden bar: MAE < 55 (needs a real model)" },
  ]},
{ id:"dm3", mode:"data", diff:3, title:"Rent Prediction, Messy Features",
  desc:`Globals RENT_TRAIN (400 rows, includes 'rent') and RENT_TEST (100 rows, no 'rent'):
  apt_id · neighborhood · sqft · beds · parking · [rent]

The mess this time:
• neighborhood has stray whitespace AND mixed case: ' DOWNTOWN', 'Midtown ', …
• sqft uses 0 as a missing sentinel (no studio is 0 sqft)
• parking is inconsistent strings: 'yes'/'Y'/'YES'/'no'/'N'/'NO' — plus real NaNs

Write predict_rent(train, test) → list of predictions. Grading (MAE):
• beat naive global mean (MAE ≈ 620)
• hidden bar: MAE < 220 — needs sqft in a regression with cleaned neighborhood dummies. Full cleaning + lstsq lands ≈ 134.

The trap to find: without .str.strip(), ' DOWNTOWN' and 'downtown' become different dummy columns and your test-time design matrix silently misaligns — the #1 real-world failure mode this question screens for.`,
  hints:[
    "Normalize the categorical FIRST: .str.strip().str.lower(). Then sentinel: sqft 0 → NaN → impute by neighborhood median.",
    "parking: .astype(str).str.strip().str.lower().str[0].map({'y':1,'n':0}) handles all variants; fillna with the training mean.",
    "Same lstsq pattern as the pets problem: [1, sqft, beds, parking, neighborhood dummies]. Remember reindex(columns=train_dummies.columns, fill_value=0) on the test dummies."],
  review:[
    {re:"strip", miss:"No .str.strip() — the whitespace variants (' DOWNTOWN', 'Midtown ') will fragment your categories."},
    {re:"lower|casefold", miss:"Case-normalize neighborhood or the dummies split."},
    {re:"== *0|<= *0|sqft", miss:"sqft == 0 is a sentinel, not a studio — mask it before fitting."},
    {re:"map|replace", miss:"parking needs mapping to numeric ('y…'→1, 'n…'→0) before it can enter a model."},
    {re:"lstsq|polyfit|groupby", miss:"The hidden MAE bar needs sqft in an actual fit, not just group means."}],
  setup:RENT_SETUP,
  starter:`import pandas as pd
import numpy as np

def predict_rent(train, test):
    # return a list of len(test) rent predictions
    pass
`,
  solution:`import pandas as pd
import numpy as np

def predict_rent(train, test):
    def clean(d):
        d = d.copy()
        d['neighborhood'] = d['neighborhood'].str.strip().str.lower()
        d.loc[d['sqft'] <= 0, 'sqft'] = np.nan
        d['sqft'] = d['sqft'].fillna(d.groupby('neighborhood')['sqft'].transform('median'))
        d['pk'] = d['parking'].astype(str).str.strip().str.lower().str[0].map({'y': 1.0, 'n': 0.0})
        d['pk'] = d['pk'].fillna(0.4)
        return d
    tr, te = clean(train), clean(test)
    D = pd.get_dummies(tr['neighborhood'])
    X = np.column_stack([np.ones(len(tr)), tr['sqft'], tr['beds'], tr['pk'], D.to_numpy(dtype=float)])
    beta, *_ = np.linalg.lstsq(X, tr['rent'].to_numpy(), rcond=None)
    Dt = pd.get_dummies(te['neighborhood']).reindex(columns=D.columns, fill_value=0)
    Xt = np.column_stack([np.ones(len(te)), te['sqft'], te['beds'], te['pk'], Dt.to_numpy(dtype=float)])
    return (Xt @ beta).tolist()
`,
  tests:[
    { call:"len(predict_rent(RENT_TRAIN.copy(), RENT_TEST.copy())) == len(RENT_TEST)", expected:"True", show:true, label:"returns one prediction per test apartment" },
    { call:"rent_mae(predict_rent) < RENT_NAIVE_MAE", expected:"True", show:true, label:"beats naive global-mean baseline (MAE ~620)" },
    { call:"rent_mae(predict_rent) < 220.0", expected:"True", show:false, label:"hidden bar: MAE < 220 (sqft must be in the model)" },
  ]},
];

/* ---------- pyodide runtime management ---------- */
const Runtime = {
  pyodide: null, loading: null, pandasReady: false, source: null,
  CANDIDATES: [
    { indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" },
    { indexURL: "https://cdnjs.cloudflare.com/ajax/libs/pyodide/0.26.4/" },
    { indexURL: "https://cdnjs.cloudflare.com/ajax/libs/pyodide/0.24.1/" },
  ],
  loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("script load failed: " + src));
      document.head.appendChild(s);
    });
  },
  async init(statusCb) {
    if (this.pyodide) return this.pyodide;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      let lastErr;
      for (const c of this.CANDIDATES) {
        try {
          statusCb("loading Python runtime… (" + new URL(c.indexURL).host + ")");
          await this.loadScript(c.indexURL + "pyodide.js");
          this.pyodide = await loadPyodide({ indexURL: c.indexURL });
          this.source = c.indexURL;
          return this.pyodide;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("no pyodide source reachable");
    })();
    try { return await this.loading; } finally { this.loading = null; }
  },
  async ensurePandas(statusCb) {
    if (this.pandasReady) return true;
    statusCb("loading pandas + numpy (~15 MB, one time)…");
    try { await this.pyodide.loadPackage(["numpy", "pandas"]); this.pandasReady = true; return true; }
    catch (e) { return false; }
  },
};

function buildRunnerScript(userCode, tests, needPandas, setup) {
  return `
import json, math, io, contextlib
def _deep_eq(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(float(a), float(b), rel_tol=1e-6, abs_tol=1e-9)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(_deep_eq(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(_deep_eq(a[k], b[k]) for k in a)
    return a == b

_g = {}
${needPandas ? 'exec("import pandas as pd\\nimport numpy as np", _g)' : ""}
_setup = ${JSON.stringify(setup || "")}
_src = ${JSON.stringify(userCode)}
_tests = json.loads(${JSON.stringify(JSON.stringify(tests.map(t => ({ call: t.call, expected: t.expected }))))})
_results = []
_err = None
try:
    if _setup:
        exec(_setup, _g)
except Exception as e:
    _err = "problem setup failed: " + type(e).__name__ + ": " + str(e)
if _err is None:
    try:
        exec(_src, _g)
    except Exception as e:
        _err = type(e).__name__ + ": " + str(e)
if _err is None:
    for _t in _tests:
        _buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(_buf):
                _got = eval(_t["call"], _g)
                _exp = eval(_t["expected"], _g)
            _results.append({"ok": bool(_deep_eq(_got, _exp)), "got": repr(_got)[:300], "exp": repr(_exp)[:300], "out": _buf.getvalue()[:800]})
        except Exception as e:
            _results.append({"ok": False, "got": type(e).__name__ + ": " + str(e), "exp": _t["expected"], "out": _buf.getvalue()[:800]})
json.dumps({"error": _err, "results": _results})
`;
}

/* ============================================================
   DESK COACH — offline hints/lint/review + optional Claude API
   ============================================================ */
const Coach = {
  apiKey: null, model: "claude-sonnet-4-5", histories: {}, hintIdx: {}, busy: false,

  hist(pid) { return this.histories[pid] || (this.histories[pid] = []); },

  push(pid, role, text) {
    this.hist(pid).push({ role, text });
    this.renderLog(pid);
  },

  renderLog(pid) {
    const log = $("#coachLog"); if (!log) return;
    const h = this.hist(pid);
    log.innerHTML = h.length ? h.map(m =>
      `<div class="chat-msg ${m.role === "user" ? "me" : "coach"}"><div class="who">${m.role === "user" ? "you" : "coach"}</div><div class="body">${esc(m.text)}</div></div>`
    ).join("") : `<div class="muted small" style="padding:8px">Ask anything — syntax, approach, "why does my test fail". Use <b>Hint</b> for a staged nudge, <b>Review</b> for a checklist pass on your current code.</div>`;
    log.scrollTop = log.scrollHeight;
  },

  statusLabel() { return this.apiKey ? "Claude connected" : (window.claude && window.claude.complete) ? "Claude (built-in)" : "offline coach"; },

  giveHint(p) {
    const i = this.hintIdx[p.id] || 0;
    if (i < p.hints.length) {
      this.hintIdx[p.id] = i + 1;
      this.push(p.id, "coach", `Hint ${i + 1}/${p.hints.length}: ${p.hints[i]}`);
    } else {
      this.push(p.id, "coach", "That was the last hint. The reference solution is in the panel below the tests — read it, then rewrite it from memory; that's the drill that sticks.");
    }
  },

  reviewCode(p, code, lastResults) {
    if (code.trim() === p.starter.trim()) {
      this.push(p.id, "coach", "That's still the starter template — nothing to review yet. Sketch your approach in code (even pseudocode-ish) and I'll critique it, or hit 💡 Hint to get moving.");
      return;
    }
    const notes = [];
    if (!new RegExp("def\\s+" + this.fnName(p) + "\\s*\\(").test(code)) {
      notes.push(`I don't see \`def ${this.fnName(p)}(…)\` — the tests call exactly that name.`);
    }
    for (const r of (p.review || [])) {
      if (!new RegExp(r.re, "i").test(code)) notes.push(r.miss);
    }
    if (/\.iterrows\(/.test(code)) notes.push("iterrows() spotted — in an interview, vectorize it; row loops in pandas are what the screen is screening for.");
    if (p.mode === "data" && /for .* in .*range\(len/.test(code)) notes.push("Indexed row loop over the frame — try a vectorized or groupby formulation.");
    if (!/return/.test(code)) notes.push("No return statement yet.");
    if (lastResults && lastResults.failed > 0) notes.push(`Last run: ${lastResults.passed}/${lastResults.total} tests passed — look at the first failing 'got vs expected' pair; it usually names the bug.`);
    this.push(p.id, "coach", notes.length
      ? "Code review:\n• " + notes.join("\n• ")
      : "Structurally this looks on track — the ingredients I'd expect are all present. Run the tests; if something fails, bring me the got-vs-expected diff.");
  },

  fnName(p) { const m = p.starter.match(/def\s+(\w+)/); return m ? m[1] : "solve"; },

  KB: [
    { re: /group\s*by|groupby/i, a: "groupby patterns:\ndf.groupby('key')['col'].mean() → per-group stat\ndf.groupby('key')['col'].transform('median') → same length as df, great for imputation\ng = df.groupby('key').agg(n=('col','size'), avg=('col','mean'))" },
    { re: /merge|join/i, a: "df.merge(other, on='key', how='left') — how ∈ {left, inner, outer}. Column mismatch after merge is usually a dtype or whitespace issue in the key: check .str.strip() first." },
    { re: /dumm|one.?hot|categor/i, a: "pd.get_dummies(s) one-hots a Series. The interview trap: test data may lack some categories — align with .reindex(columns=train_dummies.columns, fill_value=0)." },
    { re: /lstsq|regress|linear|fit\b/i, a: "No sklearn needed:\nX = np.column_stack([np.ones(n), f1, f2, dummies])\nbeta, *_ = np.linalg.lstsq(X, y, rcond=None)\npreds = X_test @ beta\nRemember the intercept column of ones." },
    { re: /fillna|impute|missing|nan/i, a: "s.fillna(value) or s.fillna(s.median()). Group-aware: s.fillna(df.groupby('k')[col].transform('median')). Sentinels (−1, 0, −999) must be converted to NaN FIRST: d.loc[d.age < 0, 'age'] = np.nan." },
    { re: /duplicate|dedup/i, a: "df.drop_duplicates() → exact row dupes; df.drop_duplicates(subset='id', keep='first') → entity dupes. Do it before any aggregation or the dupes bias your stats." },
    { re: /rolling|moving avg|sma/i, a: "df['x'].rolling(w).mean() — NaN until the window fills; add min_periods=1 to change that. .rolling(w).max(), .std() etc. all exist." },
    { re: /heap|priority/i, a: "import heapq — min-heap only. Max-heap: push negated values. heappush(h, x), heappop(h), h[0] peeks. For (priority, tiebreak) push tuples — that's how you get price-time priority." },
    { re: /deque/i, a: "from collections import deque — O(1) append/pop at BOTH ends: append, appendleft, pop, popleft. It's the backbone of sliding-window-max and BFS." },
    { re: /sort/i, a: "sorted(xs, key=lambda t: (t[0], -t[1])) for multi-key. list.sort() is in-place. For 'best price then earliest time', sort by (price, seq) or use a heap with that tuple." },
    { re: /pct_change|return/i, a: "df['close'].pct_change() → simple returns (NaN first row). Log returns: np.log(df.close).diff()." },
    { re: /apply\b/i, a: ".apply(f) runs Python per row/element — slow and usually avoidable. Prefer vectorized ops, .map for dict lookups, np.where / np.select for conditionals." },
  ],

  offlineReply(p, msg) {
    const m = msg.toLowerCase();
    if (/hint|stuck|help me|where do i start|idk/.test(m)) { this.giveHint(p); return null; }
    if (/review|feedback|look at my|check my/.test(m)) { this.reviewCode(p, $("#codeArea").value, Coding.lastResults[p.id]); return null; }
    if (/solution|answer|give up/.test(m)) return "The full reference solution is in the collapsible panel under the test results. Honest advice: take one more hint first — you learn 5× more finishing it yourself.";
    for (const k of this.KB) if (k.re.test(m)) return k.a;
    return "Offline coach here — I can do staged hints (button above), a checklist review of your code, and syntax help (ask about: groupby, merge, dummies, lstsq, fillna, duplicates, rolling, heaps, deque, sorting). For free-form conversation, click ⚙ and connect a Claude API key — it stays in memory only and talks straight to api.anthropic.com from your browser.";
  },

  async claudeReply(p, msg) {
    const code = $("#codeArea").value;
    const lastR = Coding.lastResults[p.id];
    const sys = `You are Desk Coach, a quant-interview coding coach inside a practice app. Be Socratic and concise (<150 words): nudge toward the answer, name the concept, show at most 1-3 line snippets. Only give a full solution if the user explicitly insists after you've offered a hint. Problem "${p.title}":\n${p.desc}\n\nUser's current code:\n${code}\n\nLatest test results: ${lastR ? `${lastR.passed}/${lastR.total} passed. Failures: ${lastR.failSummary}` : "not run yet"}`;
    const messages = this.hist(p.id).slice(-12).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    if (!messages.length || messages[messages.length - 1].role !== "user") messages.push({ role: "user", content: msg });
    if (this.apiKey) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: this.model, max_tokens: 700, system: sys, messages }),
      });
      if (!r.ok) throw new Error("API " + r.status + ": " + (await r.text()).slice(0, 160));
      const data = await r.json();
      return data.content.map(c => c.text || "").join("");
    }
    if (window.claude && window.claude.complete) {
      return await window.claude.complete(sys + "\n\nConversation:\n" + messages.map(m => m.role + ": " + m.content).join("\n") + "\nassistant:");
    }
    throw new Error("no engine");
  },

  async send(p, msg) {
    if (!msg.trim() || this.busy) return;
    this.push(p.id, "user", msg.trim());
    const hasAI = this.apiKey || (window.claude && window.claude.complete);
    if (!hasAI) {
      const reply = this.offlineReply(p, msg);
      if (reply) this.push(p.id, "coach", reply);
      return;
    }
    this.busy = true;
    this.push(p.id, "coach", "…");
    try {
      const reply = await this.claudeReply(p, msg);
      this.hist(p.id).pop();
      this.push(p.id, "coach", reply);
    } catch (e) {
      this.hist(p.id).pop();
      this.push(p.id, "coach", "API call failed (" + e.message + "). Falling back to offline mode — check the key in ⚙, and note browser keys need an Anthropic key with CORS access enabled.");
    } finally { this.busy = false; }
  },

  /* ---- live lint ---- */
  lintTimer: null,
  scheduleLint(p) {
    clearTimeout(this.lintTimer);
    this.lintTimer = setTimeout(() => this.lint(p), 900);
  },
  async lint(p) {
    const strip = $("#lintStrip"); if (!strip) return;
    const code = $("#codeArea").value;
    if (!code.trim()) { strip.textContent = "live review: waiting for code…"; strip.className = "lint-strip"; return; }
    const notes = [];
    if (Runtime.pyodide) {
      try {
        const res = await Runtime.pyodide.runPythonAsync(
          `import json\ntry:\n    compile(${JSON.stringify(code)}, "solution.py", "exec")\n    _r = {"ok": True}\nexcept SyntaxError as e:\n    _r = {"ok": False, "line": e.lineno, "msg": e.msg}\njson.dumps(_r)`);
        const r = JSON.parse(res);
        if (!r.ok) { strip.textContent = `✗ SyntaxError line ${r.line}: ${r.msg}`; strip.className = "lint-strip bad"; return; }
        notes.push("✓ parses");
      } catch (e) { notes.push("lint unavailable"); }
    } else {
      for (const [o, c] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        const no = code.split(o).length, nc = code.split(c).length;
        if (no !== nc) notes.push(`⚠ unbalanced ${o}${c}`);
      }
      if (!notes.length) notes.push("✓ basic checks (full syntax check after first run loads Python)");
    }
    if (!new RegExp("def\\s+" + this.fnName(p) + "\\s*\\(").test(code)) notes.push(`⚠ tests call ${this.fnName(p)}() — not defined yet`);
    if (/\.iterrows\(/.test(code)) notes.push("⚠ iterrows() — vectorize");
    strip.textContent = "live review: " + notes.join(" · ");
    strip.className = "lint-strip" + (notes.some(n => n.startsWith("⚠")) ? " warn" : " ok");
  },
};

/* ============================================================
   CODING UI
   ============================================================ */
const Coding = {
  mode: "algo", selected: null, drafts: {}, lastResults: {},
  render() {
    const el = $("#view-coding");
    if (!el.dataset.built) {
      el.dataset.built = "1";
      el.innerHTML = `
        <div class="row spread">
          <div>
            <h1>Coding</h1>
            <p class="lede"><b>Algorithms</b> is the HRT/Jump screen — the hard ones (matching engine, running median) are the real thing.
            <b>Data &amp; ML</b> is the research screen: preloaded messy datasets you clean, model, and get graded on by held-out MAE.
            Real Python runs in your browser, and the Desk Coach watches your code as you type.</p>
          </div>
          <div class="mode-switch" id="modeSwitch">
            <button data-mode="algo" class="active">Algorithms</button>
            <button data-mode="data">Data &amp; ML</button>
          </div>
        </div>
        <div class="code-layout">
          <div class="prob-list" id="probList"></div>
          <div id="probPane"></div>
        </div>`;
      $("#modeSwitch").addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        this.mode = b.dataset.mode;
        this.selected = null;
        this.render();
      });
    }
    $$("#modeSwitch button").forEach(x => x.classList.toggle("active", x.dataset.mode === this.mode));
    this.renderList(); this.renderPane();
  },
  renderList() {
    const probs = CODING_PROBLEMS.filter(p => p.mode === this.mode);
    if (!this.selected || !probs.find(p => p.id === this.selected)) this.selected = probs[0].id;
    $("#probList").innerHTML = probs.map(p => {
      const st = state.codingStatus[p.id];
      const [cls, lbl] = DIFF_LABEL[p.diff];
      return `<div class="prob-item ${p.id === this.selected ? "sel" : ""}" data-p="${p.id}">
        <div class="p-name"><span>${st === "passed" ? "✓ " : ""}${esc(p.title)}</span><span class="badge ${cls}">${lbl}</span></div>
      </div>`;
    }).join("");
    $$("#probList .prob-item").forEach(i => i.addEventListener("click", () => {
      this.saveDraft(); this.selected = i.dataset.p; this.renderList(); this.renderPane();
    }));
  },
  saveDraft() {
    const ta = $("#codeArea");
    if (ta && this.selected) this.drafts[this.selected] = ta.value;
  },
  renderPane() {
    const p = CODING_PROBLEMS.find(x => x.id === this.selected);
    const visible = p.tests.filter(t => t.show);
    const hiddenCount = p.tests.length - visible.length;
    $("#probPane").innerHTML = `
      <div class="card">
        <div class="row spread"><h2>${esc(p.title)}</h2><span class="runner-status" id="runStatus">${Runtime.pyodide ? "python ready" : "python loads on first run"}</span></div>
        <div class="mt8" style="color:var(--ink-2); white-space:pre-line; font-size:14px">${esc(p.desc)}</div>
        <div class="mt16 small muted">Visible tests${hiddenCount ? ` (+${hiddenCount} hidden)` : ""}:</div>
        <pre class="io mt8">${visible.map(t => esc(t.label ? t.label + ":  " + t.call : t.call) + "  →  " + esc(t.expected)).join("\n")}</pre>
        <div class="editor-wrap mt16">
          <div class="editor-head">
            <span class="small muted mono">solution.py</span>
            <div class="row" style="gap:8px">
              <button class="btn sm ghost" id="btnReset">reset</button>
              <button class="btn sm primary" id="btnRun">▶ Run tests</button>
            </div>
          </div>
          <textarea class="code" id="codeArea" spellcheck="false">${esc(this.drafts[p.id] ?? p.starter)}</textarea>
          <div class="lint-strip" id="lintStrip">live review: waiting for code…</div>
        </div>
        <div class="test-results" id="testResults"></div>
        <div class="reveal-box mt16" id="refBox"><button>📖 Reference solution</button>
          <div class="reveal-content"><pre class="io">${esc(p.solution)}</pre></div></div>

        <div class="coach-card mt16">
          <div class="row spread">
            <h3>🎧 Desk Coach <span class="badge" id="coachStatus">${Coach.statusLabel()}</span></h3>
            <div class="row" style="gap:6px">
              <button class="btn sm" id="coachHint">💡 Hint</button>
              <button class="btn sm" id="coachReview">🔍 Review my code</button>
              <button class="btn sm ghost" id="coachGear">⚙</button>
            </div>
          </div>
          <div class="coach-settings hidden" id="coachSettings">
            <div class="row" style="gap:8px">
              <input type="text" id="apiKeyIn" placeholder="sk-ant-… (Anthropic API key, kept in memory only)" style="flex:1; min-width:220px" value="${Coach.apiKey || ""}">
              <select id="modelSel">
                <option value="claude-sonnet-4-5" ${Coach.model === "claude-sonnet-4-5" ? "selected" : ""}>Sonnet (smart)</option>
                <option value="claude-haiku-4-5" ${Coach.model === "claude-haiku-4-5" ? "selected" : ""}>Haiku (fast)</option>
              </select>
              <button class="btn sm primary" id="apiKeySave">Connect</button>
            </div>
            <div class="small muted mt8">Your key is held in this page's memory only (never persisted) and requests go directly from your browser to api.anthropic.com. Leave blank + Connect to disconnect. Without a key you still get hints, live syntax review, and the offline coach.</div>
          </div>
          <div class="chat-log" id="coachLog"></div>
          <div class="row mt8" style="gap:8px">
            <input type="text" id="coachIn" placeholder="Ask the coach… (approach, syntax, why a test fails)" style="flex:1">
            <button class="btn sm primary" id="coachSend">Send</button>
          </div>
        </div>
      </div>`;
    $("#refBox > button").addEventListener("click", () => $("#refBox").classList.toggle("open"));
    $("#btnReset").addEventListener("click", () => { delete this.drafts[p.id]; $("#codeArea").value = p.starter; Coach.scheduleLint(p); });
    $("#btnRun").addEventListener("click", () => this.run(p));
    const ta = $("#codeArea");
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 4;
      }
    });
    ta.addEventListener("input", () => Coach.scheduleLint(p));
    /* coach bindings */
    $("#coachHint").addEventListener("click", () => Coach.giveHint(p));
    $("#coachReview").addEventListener("click", () => Coach.reviewCode(p, $("#codeArea").value, this.lastResults[p.id]));
    $("#coachGear").addEventListener("click", () => $("#coachSettings").classList.toggle("hidden"));
    $("#apiKeySave").addEventListener("click", () => {
      Coach.apiKey = $("#apiKeyIn").value.trim() || null;
      Coach.model = $("#modelSel").value;
      $("#coachStatus").textContent = Coach.statusLabel();
      Coach.push(p.id, "coach", Coach.apiKey ? "Claude connected — full conversational coaching is on. Ask me anything about this problem." : "Disconnected — back to the offline coach.");
    });
    const sendMsg = () => { const v = $("#coachIn").value; $("#coachIn").value = ""; Coach.send(p, v); };
    $("#coachSend").addEventListener("click", sendMsg);
    $("#coachIn").addEventListener("keydown", e => { if (e.key === "Enter") sendMsg(); });
    Coach.renderLog(p.id);
    Coach.scheduleLint(p);
  },
  async run(p) {
    this.saveDraft();
    const status = m => { const el = $("#runStatus"); if (el) el.textContent = m; };
    const results = $("#testResults");
    const btn = $("#btnRun");
    btn.disabled = true;
    try {
      await Runtime.init(status);
      const needPandas = p.mode === "data";
      if (needPandas) {
        const ok = await Runtime.ensurePandas(status);
        if (!ok) {
          status("pandas unavailable from this CDN");
          results.innerHTML = `<div class="note">Couldn't fetch the pandas package in this embedded preview (CDN restrictions).
            The pure-Python <b>Algorithms</b> track still runs fine here. To run Data &amp; ML problems, download the file and open it
            in your browser directly — or compare against the reference solution below.</div>`;
          return;
        }
      }
      status("running…");
      const script = buildRunnerScript($("#codeArea").value, p.tests, needPandas, p.setup);
      const raw = await Runtime.pyodide.runPythonAsync(script);
      const data = JSON.parse(raw);
      state.codingAtt[p.id] = (state.codingAtt[p.id] || 0) + 1;
      if (data.error) {
        results.innerHTML = `<div class="tcase fail"><span class="tt">✗ failed to load</span><span>${esc(data.error)}</span></div>`;
        state.codingStatus[p.id] = "attempted";
        this.lastResults[p.id] = { passed: 0, failed: 1, total: p.tests.length, failSummary: data.error };
        logEvent("code", p.id, false); Store.save();
      } else {
        let passed = 0; const failParts = [];
        results.innerHTML = data.results.map((r, i) => {
          if (r.ok) passed++;
          const t = p.tests[i];
          const label = t.show ? esc(t.label || t.call) : (t.label ? esc(t.label) : "hidden test " + (i + 1));
          if (!r.ok) failParts.push(`${t.label || t.call}: got ${r.got} expected ${r.exp}`);
          return `<div class="tcase ${r.ok ? "pass" : "fail"}">
            <span class="tt">${r.ok ? "✓" : "✗"}</span><span>${label}</span>
            ${r.ok ? "" : `<span class="muted">got</span> <span>${esc(r.got)}</span> <span class="muted">expected</span> <span>${esc(r.exp)}</span>`}
            ${r.out ? `<span class="muted">stdout: ${esc(r.out.trim().slice(0, 200))}</span>` : ""}
          </div>`;
        }).join("");
        const all = passed === data.results.length;
        results.innerHTML += `<div class="tcase ${all ? "pass" : "fail"}"><span class="tt">${all ? "✓ ALL TESTS PASSED" : `✗ ${passed}/${data.results.length} passed`}</span></div>`;
        state.codingStatus[p.id] = all ? "passed" : "attempted";
        this.lastResults[p.id] = { passed, failed: data.results.length - passed, total: data.results.length, failSummary: failParts.slice(0, 3).join(" | ") };
        logEvent("code", p.id, all); Store.save();
        status("python ready");
        this.renderList(); updatePill();
      }
    } catch (e) {
      status("runtime unavailable");
      results.innerHTML = `<div class="note">Python runtime couldn't load in this embedded preview (network restrictions on CDN scripts).
        Download the HTML file and open it directly in your browser — the runner and coach lint work there. Meanwhile, write your
        solution and check it against the reference below.</div>`;
    } finally { btn.disabled = false; }
  },
};
