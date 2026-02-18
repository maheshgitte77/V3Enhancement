// Shared Programming Logic Categories - Judge0 compatible only
// Used for category tracking and identification
// FOR-Loop categories are interspersed throughout to avoid clustering
//
// DUPLICATE-RISK OVERLAPS (keep examples/keywords distinct per category):
// - String Logic vs String Traversal Using FOR: prefer anagram/rotation in String; toggle/consecutive duplicates in String Traversal
// - Number-Based vs Mathematical FOR-Loop vs Recursion: prime/fibonacci/factorial in multiple; prefer one concept per category
// - Array Logic vs Frequency & Hash-Like vs Constraint-Driven: missing number, duplicate, frequency; assign to one primary category
// - Nested FOR (pair sum all pairs) vs Two-Pointer (pair sum sorted array): same "pair sum" phrase; descriptions must differ
// - Sorting & Searching (use algorithms) vs Sorting Logic Using FOR (implement sort): both have sort names; one is "implement", one is "search"
// - Loop + Counter vs Run-Length: run-length encoding in both; keep in Run-Length only
// - Logical/Brain Teaser vs Constraint-Driven: "duplicate without extra space" in both; keep in Brain Teaser only
// - Algorithm Identification vs Competitive/Greedy/Two-Pointer: Kadane, pair sum, sliding window; Algorithm ID = pattern recognition, not solve
// - Prefix vs Array Traversal: "prefix sum", "running sum"; Prefix = precompute/range query, Traversal = single-pass in loop
// - Validation & Rule-Engine vs Security-Aware vs Real-World: "validate input" in multiple; differentiate by context

const PROGRAMMING_LOGIC_CATEGORIES = [
    {
        name: "Number-Based Logic",
        description: "Math + loops + conditions. PREFER: Prime, Armstrong, Fibonacci, Factorial, GCD/LCM, Sum of digits, Power, Binary conversions. Use Palindrome number or Reverse number only if no other option (avoid duplicates).",
        examples: [
            "Prime number check",
            "Armstrong number",
            "Fibonacci series",
            "Factorial",
            "GCD or LCM",
            "Sum of digits",
            "Count digits",
            "Power of a number",
            "Binary to Decimal",
            "Decimal to Binary",
            "Perfect number",
            "Strong number",
            "Check if a number is a perfect square (no Math.sqrt)",
            "Sum of divisors of a number",
            "Prime factorization (simple trial division)"
        ],
        keywords: ["prime", "armstrong", "fibonacci", "factorial", "gcd", "lcm", "sum of digits", "count digits", "power", "binary", "decimal", "perfect number", "perfect square", "divisors", "factorization"]
    },
    {
        name: "Basic FOR-Loop Control",
        description: "Loop understanding (Print 1 to N, Print N to 1, Print even/odd, Sum of N numbers, Count divisible by X, Multiplication table)",
        examples: [
            "Print 1 to N",
            "Print even numbers",
            "Sum of N numbers",
            "Count divisible",
            "Print N to 1",
            "Multiplication table",
            "Sum of even numbers from 1..N",
            "Count multiples of X in 1..N",
            "Print squares from 1..N",
            "Print odd numbers",
        ],
        keywords: ["for loop", "print", "sum", "count", "multiplication table", "even", "odd", "iterate", "range"]
    },
    {
        name: "Array Logic",
        description: "Indexing + loops. Prefer diverse array problems (missing number, merge, intersection/union, frequency/mode, second largest). Move zeros/rotate live in Array Traversal.",
        examples: [
            "Find missing number in sequence",
            "Remove duplicates while preserving order",
            "Merge two sorted arrays",
            "Intersection of two arrays",
            "Union of two sorted arrays",
            "Frequency count (most frequent element)",
            "Find mode (most frequent)",
            "Second largest / second smallest",
            "Subarray with given sum (non-negative)",
            "Largest element in array (single pass)",
            "Reverse an array (two-pointer swap)",
            "Find pair with given sum (unsorted, hash allowed)"
        ],
        keywords: ["array", "missing", "duplicate", "merge", "intersection", "union", "frequency", "subarray", "mode", "second", "largest", "reverse", "pair sum"]
    },
    {
        name: "Conditional Logic Inside FOR Loop",
        description: "Branching in iteration - one distinct problem per question (Count even/odd, Count positive/negative, Sum until condition, Skip multiples of K, Conditional accumulation).",
        examples: [
            "Count even and odd in array",
            "Count positive and negative numbers",
            "Sum elements until first negative",
            "Print numbers skipping multiples of 5",
            "Sum only elements satisfying condition",
            "Count elements greater than average",
            "Sum of positive numbers and count of negative",
            "Print elements at even indices only",
            "Count divisors of N in range 1..N",
            "Sum until sum exceeds threshold"
        ],
        keywords: ["conditional", "for loop", "count", "sum", "skip", "if inside loop", "until condition", "average", "threshold"]
    },
    {
        name: "String Logic",
        description: "Manipulation, ASCII, memory. PREFER: Anagram, First non-repeating, Remove duplicates, String rotation, Longest word, Count vowels/consonants. Use Reverse string or Palindrome only if no other option (avoid duplicates).",
        examples: [
            "Anagram check",
            "First non-repeating character",
            "Remove duplicate characters",
            "String rotation",
            "Longest word in sentence",
            "Count vowels and consonants",
            "Check if two strings are rotations of each other",
            "Word count or tokenize",
            "Longest common prefix of strings",
            "Check if a string is a pangram"
        ],
        keywords: ["string", "anagram", "vowel", "consonant", "duplicate", "non-repeating", "rotation", "longest word", "tokenize", "common prefix", "pangram"]
    },
    {
        name: "Greedy Decision Logic",
        description: "Local optimal choice without backtracking. Coins, activity selection, platforms, job sequencing.",
        examples: [
            "Minimum coins for amount (greedy when denominations allow)",
            "Activity selection (max non-overlapping intervals)",
            "Minimum platforms required (sort + merge intervals)",
            "Job sequencing with deadlines (profit sort)",
            "Fractional knapsack",
            "Huffman coding (tree build)",
            "Minimum spanning tree (Prim/Kruskal idea)",
            "Coin change (greedy when possible)",
            "Maximum meetings in one room",
            "Largest number from array of numbers (custom sort)"
        ],
        keywords: ["greedy", "optimal choice", "minimum", "maximum", "local optimum", "activity", "platforms", "knapsack"]
    },
    {
        name: "Sorting & Searching",
        description: "Search only: binary search, rotated, bounds, occurrences. No sort implementation (use Sorting Logic Using FOR).",
        examples: [
            "Binary Search (exact match)",
            "Search in rotated sorted array",
            "Find first occurrence using binary search",
            "Lower bound insertion index",
            "Upper bound insertion index",
            "Count occurrences in sorted array",
            "Find minimum in rotated sorted array (index)",
            "Search insert position (where to insert to keep sorted)",
            "Binary search on answer (monotonic predicate)",
            "Find peak element (binary search)"
        ],
        keywords: ["search", "binary search", "rotated array", "lower bound", "upper bound", "first occurrence", "last occurrence", "count occurrences", "insertion index"]
    },

    // --- Added: data-structure driven categories (distinct logic + examples) ---
    {
        name: "HashMap & Set Fundamentals",
        description: "Hashing for lookup/counting/uniqueness. Distinct from frequency-with-fixed-array (Counting & Bucketing).",
        examples: [
            "Two Sum using HashMap",
            "First unique number using HashSet",
            "Group words by anagram signature (key = sorted word)",
            "Detect duplicates with HashSet (early exit)",
            "Count word frequency in a paragraph",
            "Longest substring without repeating (map char → index)",
            "Intersection of two arrays (set)",
            "First repeating character (map)",
            "Group anagrams together (hash by signature)",
            "Two arrays same set of elements (set equality)"
        ],
        keywords: ["hashmap", "hash map", "hashset", "set", "dictionary", "frequency map", "unique", "lookup", "anagram grouping"]
    },
    {
        name: "Stack-Based Logic",
        description: "LIFO: balanced brackets, postfix, next greater, path simplify. Stack as primary DS.",
        examples: [
            "Validate bracket sequence using stack",
            "Evaluate postfix expression (RPN)",
            "Next greater element (stack approach)",
            "Simplify file path (stack simulation)",
            "Undo operations in text editor (stack)",
            "Infix to postfix conversion",
            "Stock span problem (monotonic stack)",
            "Previous smaller element (stack)",
            "Remove adjacent duplicates (stack)",
            "Decode string (3[a]2[bc] → aaabcbc)"
        ],
        keywords: ["stack", "lifo", "balanced parentheses", "postfix", "rpn", "next greater", "monotonic stack", "undo", "span"]
    },
    {
        name: "Queue/Deque Logic",
        description: "FIFO or deque: round-robin, sliding window max, stream processing.",
        examples: [
            "Round-robin task scheduling with queue",
            "Generate binary numbers from 1..N using queue",
            "Sliding window maximum using deque",
            "First non-repeating character in stream (queue + counts)",
            "Simulate printer queue (FIFO or priority)",
            "Level order traversal (BFS with queue)",
            "Implement stack using two queues",
            "Reverse first K elements of queue",
            "Circular tour (petrol pump) with queue",
            "Sliding window minimum (deque)"
        ],
        keywords: ["queue", "deque", "fifo", "round robin", "sliding window maximum", "stream", "non-repeating stream", "bfs"]
    },
    {
        name: "Bit Manipulation Basics",
        description: "Bitwise: set bits, power of two, XOR unique, toggle bit, parity. No heavy math.",
        examples: [
            "Count set bits (Brian Kernighan or loop)",
            "Check if a number is power of two (n & (n-1) == 0)",
            "Find the unique element using XOR (others twice)",
            "Toggle a specific bit in a number",
            "Compute parity (odd/even set bits)",
            "Set or clear bit at position",
            "Swap two numbers using XOR",
            "Check if kth bit is set",
            "Turn off rightmost set bit",
            "Count bits to flip (A to B)"
        ],
        keywords: ["bit", "bitwise", "xor", "and", "or", "shift", "mask", "set bits", "parity", "toggle bit", "power of two"]
    },

    {
        name: "Linked List Basics",
        description: "Singly linked list: reverse, cycle, middle, merge, nth from end. Pointer manipulation.",
        examples: [
            "Reverse a singly linked list",
            "Detect cycle in linked list (Floyd)",
            "Find middle node (slow-fast pointers)",
            "Merge two sorted linked lists",
            "Remove nth node from end (two pointers)",
            "Remove duplicates from sorted list",
            "Intersection point of two lists",
            "Palindrome linked list (middle + reverse half)",
            "Rotate list by K nodes",
            "Delete node given pointer (no head)"
        ],
        keywords: ["linked list", "singly", "node", "pointer", "reverse list", "cycle", "floyd", "middle node", "merge lists", "nth from end"]
    },
    {
        name: "Binary Tree Traversal Basics",
        description: "Traversals (in/pre/post/level) and simple properties: height, sum, count.",
        examples: [
            "Inorder traversal (recursive or iterative)",
            "Preorder traversal",
            "Postorder traversal",
            "Level order traversal (BFS with queue)",
            "Compute height of binary tree",
            "Sum of all nodes",
            "Count nodes in tree",
            "Mirror/invert binary tree",
            "Same tree check (structure and value)",
            "Maximum depth (same as height)"
        ],
        keywords: ["binary tree", "inorder", "preorder", "postorder", "level order", "bfs", "height", "traversal", "mirror", "depth"]
    },
    {
        name: "Graph BFS/DFS Basics",
        description: "BFS/DFS on graph: traversal, components, path, cycle. Adjacency list or matrix.",
        examples: [
            "BFS traversal from a source node",
            "DFS traversal (recursive or stack)",
            "Count connected components (undirected)",
            "Check if path exists between two nodes",
            "Detect cycle in undirected graph (DFS)",
            "Shortest path in unweighted graph (BFS)",
            "Detect cycle in directed graph",
            "Topological sort (Kahn or DFS)",
            "Number of islands (2D grid as graph)",
            "Bipartite check (BFS/DFS coloring)"
        ],
        keywords: ["graph", "bfs", "dfs", "connected components", "reachability", "adjacency list", "cycle detection", "shortest path", "topological", "bipartite"]
    },
    {
        name: "Dynamic Programming Basics",
        description: "1D DP: stairs, house robber, coin change, LIS, edit distance. Clear state and recurrence.",
        examples: [
            "Climbing stairs (ways to reach n)",
            "House robber (max sum non-adjacent)",
            "Minimum coins for amount (DP)",
            "Longest increasing subsequence (O(n^2))",
            "Edit distance (Levenshtein)",
            "Fibonacci (DP tabulation)",
            "Maximum sum subarray (Kadane as DP)",
            "Coin change (number of ways)",
            "Min cost climbing stairs",
            "Longest common subsequence (LCS)"
        ],
        keywords: ["dp", "dynamic programming", "tabulation", "memoization", "climbing stairs", "house robber", "coin change", "lis", "edit distance", "lcs"]
    },
    {
        name: "Nested FOR-Loop Logic",
        description: "Nested iteration - two loops. All pairs, compare every pair, O(n²) duplicate detection. Distinct from Two-Pointer (sorted pair sum).",
        examples: [
            "Find all pairs in array that sum to target",
            "Compare every element with every other",
            "Duplicate detection with two loops",
            "Generate all subarrays",
            "Two-sum brute force with nested loops",
            "Find all triplets with zero sum (brute force)",
            "Bubble sort implementation (nested loops)",
            "Selection sort implementation",
            "Print all pairs (i, j) where i < j",
            "Count inversions in array (nested loop)"
        ],
        keywords: ["nested loop", "nested for", "all pairs", "compare all", "every pair", "subarray", "brute force", "triplets", "inversions"]
    },
    {
        name: "Pattern Printing",
        description: "Loop control & visualization - one pattern type per question (star/number pyramid, diamond, spiral, hollow, alternating).",
        examples: [
            "Star pyramid (asterisks)",
            "Number pyramid (1 12 123)",
            "Diamond pattern (stars)",
            "Spiral number pattern (matrix)",
            "Hollow square pattern",
            "Alternating character pattern",
            "Inverted pyramid pattern",
            "Right-angled triangle (numbers)",
            "Pascal triangle (first N rows)",
            "Chessboard pattern (0 and 1)"
        ],
        keywords: ["pattern", "star", "pyramid", "triangle", "diamond", "spiral", "hollow", "alternating", "inverted", "pascal", "chessboard"]
    },
    {
        name: "Prefix Computation Logic",
        description: "Precompute prefix arrays to answer range queries. Distinct from single-pass 'running sum' in traversal.",
        examples: [
            "Prefix sum array",
            "Prefix max / min array",
            "Prefix product array",
            "Range sum query (using prefix sum)",
            "Equilibrium index (prefix sum)",
            "Cumulative frequency (prefix)",
            "Left/right prefix max for each index",
            "Prefix XOR array",
            "Running sum from left (precompute)",
            "Count zeros in range using prefix"
        ],
        keywords: ["prefix", "cumulative", "running sum", "precompute", "range query", "equilibrium", "prefix xor"]
    },
    {
        name: "2D/Matrix Logic",
        description: "Indexing, nested loops. Transpose, diagonals, rotate, spiral, row/column ops. No 1D array problems.",
        examples: [
            "Matrix transpose (in-place or new)",
            "Diagonal sum (main and anti)",
            "Rotate matrix 90° clockwise",
            "Spiral matrix traversal (print or fill)",
            "Search in row-wise and column-wise sorted matrix",
            "Matrix addition / subtraction",
            "Row sum and column sum",
            "Print matrix in snake pattern",
            "Boundary elements of matrix",
            "Set matrix row/column to zero if element is zero"
        ],
        keywords: ["matrix", "2d", "transpose", "diagonal", "spiral", "rotate matrix", "row", "column", "snake", "boundary"]
    },
    {
        name: "Mathematical FOR-Loop Logic",
        description: "Math + iteration: primes in range, optimized prime, divisors, factorization. No single-number Fibonacci/Armstrong (use Number-Based).",
        examples: [
            "Print all primes in range [L, R]",
            "Optimized prime check using √n",
            "Sum of divisors of N",
            "Check perfect number using loop",
            "Prime factorization (trial division)",
            "Count primes in range (sieve idea or loop)",
            "Sum of proper divisors",
            "Product of digits using loop",
            "Check if N is power of another number (loop)",
            "Find all factors of N"
        ],
        keywords: ["for loop", "prime in range", "optimized prime", "divisors", "factorization", "math", "sieve", "factors"]
    },
    {
        name: "Recursion-Based",
        description: "Base case + recurrence. Prefer Tower of Hanoi, Power, permutations, tree/grid over reverse string.",
        examples: [
            "Tower of Hanoi",
            "Factorial using recursion",
            "Fibonacci using recursion",
            "Power (x^n) using recursion",
            "Generate all permutations",
            "Binary tree height or sum (recursive)",
            "Flood fill or grid recursion",
            "Print 1 to N using recursion (no loop)",
            "Sum of array using recursion",
            "Reverse linked list using recursion"
        ],
        keywords: ["recursion", "recursive", "tower", "hanoi", "factorial", "fibonacci", "permutation", "tree", "flood fill"]
    },
    {
        name: "Suffix Computation Logic",
        description: "Right-to-left precompute (suffix max/sum). Distinct from prefix; often used with prefix for 'except self'.",
        examples: [
            "Suffix max array",
            "Suffix sum array",
            "Next greater element (right side, suffix style)",
            "Product of array except self (suffix part)",
            "Right-side smaller count (suffix)",
            "Suffix min array",
            "Trailing product (suffix)",
            "Leaders in array (suffix max check)",
            "Replace with next greater (suffix stack or array)",
            "Rain water (suffix max for right bound)"
        ],
        keywords: ["suffix", "right to left", "reverse traversal", "next greater", "except self", "leaders"]
    },
    {
        name: "Logical/Brain Teaser",
        description: "Reasoning over coding. Swap without temp, odd one out, min jumps, trapping, duplicate without extra space. No algorithm implementation.",
        examples: [
            "Swap two numbers without temp (XOR or arithmetic)",
            "Minimum jumps to reach end",
            "Water trapping / rainwater trapping",
            "Find duplicate in 1..N without extra space (index marking)",
            "Find odd one out (XOR or count)",
            "Two eggs and K floors (logic)",
            "Josephus problem (elimination game)",
            "Puzzle: measure exactly using two jugs",
            "Detect cycle in linked list (Floyd cycle)",
            "Majority element (Boyer-Moore vote)"
        ],
        keywords: ["swap", "jump", "water", "trap", "duplicate without space", "odd one out", "brain teaser", "josephus", "cycle", "majority vote"]
    },
    {
        name: "Array Traversal Using FOR",
        description: "Single-pass array iteration. Move zeros, rotate by K, partition, trailing sum. Distinct from Array Logic (no merge/intersection here).",
        examples: [
            "Move zeros to end (stable, single pass)",
            "Rotate array by K steps (reversal method)",
            "Sliding window maximum (deque or two pass)",
            "Frequency count in one pass (fixed range)",
            "Partition array by condition (pivot)",
            "Trailing sum or product in one pass",
            "Segregate even and odd in single pass",
            "Dutch national flag (three-way partition)",
            "Bring negatives to one side (single pass)",
            "Max sum of K consecutive elements (window)"
        ],
        keywords: ["for loop", "array", "traverse", "move zeros", "rotate", "sliding window", "partition", "single pass", "segregate", "dutch flag"]
    },
    {
        name: "Time & Space Complexity",
        description: "Optimization tasks: improve given solution (reduce iterations, better algo). Not theory-only; implement optimized version.",
        examples: [
            "Optimize prime check (till √n)",
            "Find duplicates efficiently (O(n) time)",
            "Reduce time complexity from O(n²) to O(n)",
            "Memory-efficient solution (in-place)",
            "Optimize nested loop to single pass",
            "Reduce space from O(n) to O(1) for same problem",
            "Best approach to find majority element",
            "Optimize two-sum (hash vs nested loop)"
        ],
        keywords: ["optimize", "complexity", "efficient", "big-o", "time complexity", "space complexity", "o(n)", "o(n²)", "in-place"]
    },
    {
        name: "In-Place Transformation Logic",
        description: "Modify data without extra space. Rotate, replace, partition, index marking. No separate buffer.",
        examples: [
            "Rotate array in-place by K (reversal method)",
            "Replace elements based on condition (in-place)",
            "Move zeros in-place (two pointers)",
            "Partition array in-place (pivot)",
            "Mark visited using same array (index/negation)",
            "Remove duplicates in-place (sorted array)",
            "Segregate 0s and 1s in-place",
            "Reverse array in-place",
            "In-place merge of two sorted halves",
            "Double every element and replace (in-place)"
        ],
        keywords: ["in-place", "no extra space", "modify array", "rotate", "partition", "replace", "segregate", "reverse in-place"]
    },
    {
        name: "Core Logic Construction",
        description: "Build from scratch without built-ins. Reverse number without string, max without Math.max, digits without length.",
        examples: [
            "Reverse number without string conversion",
            "Find max of array without Math.max",
            "Count digits without string length",
            "Manual constraint handling (bounds, overflow)",
            "Implement floor division without / operator",
            "Check palindrome number without string",
            "Sort three numbers without sort function",
            "Find min of two without conditional (bitwise)",
            "Implement abs without library",
            "Round to nearest integer without Math.round"
        ],
        keywords: ["without built-in", "from scratch", "manual", "constraint", "no math.max", "no string conversion", "no library"]
    },
    {
        name: "String Traversal Using FOR",
        description: "Character-level single-pass. Toggle case, consecutive duplicates, char frequency. No anagram/first non-repeating (String Logic).",
        examples: [
            "Toggle case of letters (upper to lower and vice versa)",
            "Remove consecutive duplicate characters",
            "Character frequency in string (single pass)",
            "Replace character at specific positions",
            "Count uppercase vs lowercase in one pass",
            "Remove all occurrences of a character",
            "Capitalize first letter of each word (single pass)",
            "Check if all characters are same (loop)",
            "Count consonants (skip vowels)",
            "Replace spaces with underscore in-place"
        ],
        keywords: ["for loop", "string", "traverse", "toggle", "consecutive", "character frequency", "uppercase", "lowercase", "capitalize"]
    },
    {
        name: "Constraint-Driven Logic",
        description: "Strict rules: single loop, O(n), no sort, no recursion. Missing number, majority, two repeated. Duplicate-without-space in Brain Teaser.",
        examples: [
            "Missing number in 1..N using single loop (sum or XOR)",
            "Majority element in O(n) time and O(1) space",
            "Single loop solution with O(1) space",
            "Find two repeated numbers in 1..N with constraints",
            "Find duplicate in 1..N+1 with single element repeated (XOR)",
            "First missing positive in array (O(n) O(1))",
            "Maximum product of two numbers (single pass)",
            "Second smallest in single pass (no sort)"
        ],
        keywords: ["single loop", "o(n)", "no sorting", "no recursion", "constraint", "missing number", "majority", "xor", "o(1) space"]
    },
    {
        name: "Counting & Bucketing Logic",
        description: "Count using fixed-size arrays only (no HashMap). Counting sort, digit frequency, bucket counts.",
        examples: [
            "Character frequency using array of size 256",
            "Counting sort (integer range known)",
            "Frequency of digits 0-9 in number",
            "Bucket-based counting (range buckets)",
            "Sort array of 0s 1s 2s (count then fill)",
            "Find max frequency element using count array",
            "Anagram check using two count arrays",
            "Count vowels using array index (a,e,i,o,u)",
            "Histogram of values in range",
            "Most frequent digit in number (count array)"
        ],
        keywords: ["counting", "bucket", "frequency array", "count sort", "fixed size", "digit frequency"]
    },
    {
        name: "Edge-Case Dominant",
        description: "Production-ready: empty input, overflow, negatives, single element, all same. Focus on handling, not finding bugs.",
        examples: [
            "Sum of empty array (return 0 or handle)",
            "String with only spaces (trim or skip)",
            "Array with all zeros (avoid division by zero)",
            "Overflow handling in sum/product",
            "Single element array (no loop needed)",
            "All elements same (early exit or special case)",
            "Negative numbers in input (absolute or range)",
            "Very large N (avoid O(n²))",
            "Empty string palindrome check",
            "Zero as pivot in partition"
        ],
        keywords: ["empty", "large input", "negative", "overflow", "single element", "edge case", "boundary", "production"]
    },
    {
        name: "Two-Pointer FOR-Loop Logic",
        description: "Two indices: pair sum in sorted array, merge sorted, partition, container water. Distinct from Nested FOR (all pairs).",
        examples: [
            "Pair sum in sorted array (two pointers)",
            "Remove duplicates from sorted array (in-place)",
            "Merge two sorted arrays (two pointers)",
            "Partition array around pivot (two pointers)",
            "Container with most water",
            "Triplet sum in sorted array (fix one, two pointers)",
            "Remove element in-place (two pointers)",
            "Move zeros to end (two pointers)",
            "Palindrome check in string (start and end pointers)",
            "Intersection of two sorted arrays (two pointers)"
        ],
        keywords: ["two pointer", "for loop", "sorted", "pair sum", "merge sorted", "partition", "optimize", "in-place"]
    },
    {
        name: "Input Parsing & Data Handling",
        description: "Standard I/O: multi-line, EOF, unknown size, matrix input, command parsing.",
        examples: [
            "Multi-line input parsing (read N then N lines)",
            "Basic string parsing (split, trim)",
            "Matrix input parsing (rows and columns)",
            "Commands from input (loop until quit)",
            "EOF handling (read until end of file)",
            "Parse CSV line into fields",
            "Read unknown number of integers until sentinel",
            "Parse key-value pairs from input",
            "Handle mixed types (int then string)",
            "Read and parse JSON-like structure (simple)"
        ],
        keywords: ["parse", "multi-line", "input", "eof", "unknown size", "mixed input", "command", "csv", "sentinel"]
    },
    {
        name: "Window Expansion & Shrinking Logic",
        description: "Sliding window with variable size: expand/shrink based on condition.",
        examples: [
            "Smallest subarray with sum ≥ K",
            "Longest substring with at most K distinct characters",
            "Longest substring without repeating characters",
            "Minimum window substring (containing all chars)",
            "Max consecutive ones with at most K flips",
            "Fruit into baskets (at most 2 types)",
            "Subarray product less than K (count)",
            "Longest subarray with sum ≤ K",
            "Window expansion and contraction (generic)",
            "Smallest window containing pattern"
        ],
        keywords: ["window", "expand", "shrink", "dynamic window", "subarray", "substring", "at most K", "sliding window"]
    },
    {
        name: "Multiple-Solution Problems",
        description: "Same problem, multiple approaches: loop vs recursion, brute vs hash, two-pointer vs nested. Compare trade-offs.",
        examples: [
            "Duplicate detection (nested loop vs set vs index marking)",
            "Factorial via loop vs recursion",
            "Search (linear vs binary)",
            "Reverse string (loop vs recursion vs two-pointer)",
            "Fibonacci (recursion vs DP vs iterative)",
            "Two sum (nested loop vs hash)",
            "Palindrome check (reverse vs two-pointer)",
            "Max element (loop vs reduce vs sort)",
            "Same problem different logic (list 2-3 approaches)",
            "Sort (bubble vs selection vs built-in)"
        ],
        keywords: ["multiple ways", "different approach", "loop-based", "math-based", "two-pointer", "hashing", "compare"]
    },
    {
        name: "Loop + Counter Logic",
        description: "Single-pass counter tracking. Consecutive sequence, majority, leaders. No run-length encoding (use Run-Length category).",
        examples: [
            "Longest consecutive sequence in array",
            "Majority element in array (Boyer-Moore or count)",
            "Count frequency without map (fixed range)",
            "Leader in array (elements greater than all on right)",
            "Longest increasing run (consecutive increasing)",
            "Count inversions (merge sort style or simple count)",
            "Max consecutive 1s in binary array",
            "Find element with count > n/2",
            "Longest alternating subsequence (greedy count)",
            "Count subarrays with given sum (prefix + map or count)"
        ],
        keywords: ["loop", "counter", "consecutive", "majority", "frequency", "leader", "run", "max consecutive"]
    },
    {
        name: "Optimization & Refactoring Logic",
        description: "Improve given code: reduce complexity, remove nested loops, refactor. Implement the better version.",
        examples: [
            "Convert O(n²) to O(n) for same problem",
            "Remove nested loops (single pass or hash)",
            "Optimize existing solution (same output)",
            "Refactor code (extract function, rename)",
            "Reduce space from O(n) to O(1)",
            "Replace recursion with iteration",
            "Cache repeated computation (memoize)",
            "Early exit to avoid unnecessary work",
            "Use better data structure for same logic",
            "Simplify conditionals (guard clauses)"
        ],
        keywords: ["refactor", "optimize", "reduce complexity", "remove nested", "improve", "better solution", "early exit"]
    },
    {
        name: "Index Mapping Logic",
        description: "Use array index to encode state (visit/mark). Negative marking, index as hash.",
        examples: [
            "Index-based marking (visited flag)",
            "Find duplicates using index mapping (1..N)",
            "Negative marking technique (flip sign at index)",
            "Find first missing positive (index mapping)",
            "Mark indices where value equals index",
            "Cycle detection in 1..N array (index chasing)",
            "Reorder array so a[i] becomes a[a[i]] (index mapping)",
            "Find two repeating elements (index negation)",
            "Segregate by sign using index swap",
            "Place elements at correct index (value as index)"
        ],
        keywords: ["index mapping", "negative marking", "encode index", "visited", "cycle", "value as index"]
    },
    {
        name: "Algorithm Identification",
        description: "Meta: recognize which pattern fits (sliding window vs two pointer vs prefix sum). No implementation; identification only.",
        examples: [
            "Identify if problem needs sliding window",
            "Recognize two-pointer pattern (when to use)",
            "Choose prefix sum vs brute force",
            "Algorithm pattern matching (which DS fits)",
            "When to use BFS vs DFS",
            "Greedy vs DP (identify from problem statement)",
            "Binary search applicability (sorted? monotonic?)",
            "Stack vs queue for problem type",
            "Hash map vs array for frequency",
            "Identify recursion vs iteration fit"
        ],
        keywords: ["algorithm pattern", "identify", "recognize", "sliding window", "two pointer", "prefix sum", "pattern fit", "when to use"]
    },
    {
        name: "Sorting Logic Using FOR",
        description: "Implement sort algorithms (bubble, selection, insertion, counting). Not 'search in sorted'; that is Sorting & Searching.",
        examples: [
            "Bubble sort",
            "Selection sort",
            "Insertion sort",
            "Counting sort (when range known)",
            "Custom sort (comparator or swap condition)",
            "Sort 0s 1s 2s (Dutch national flag)",
            "Merge two sorted halves (merge step)",
            "Sort by frequency (then by value)",
            "Sort array of pairs by first element",
            "Insertion sort for linked list (concept)"
        ],
        keywords: ["for loop", "sort", "bubble", "selection", "insertion", "counting", "swap", "merge step", "custom sort"]
    },
    {
        name: "Logical Simulation Problems",
        description: "Simulate system behavior: traffic, elevator, robot, game. Step-by-step state update.",
        examples: [
            "Traffic signal logic (RED-GREEN-YELLOW cycle)",
            "Elevator logic (up/down, floor stops)",
            "Robot movement (N-S-E-W, position after moves)",
            "Game simulation (tic-tac-toe check, move validation)",
            "Position tracking (x, y after L/R/U/D)",
            "Snake game movement (grow, boundary)",
            "LRU cache simulation (get, put, evict)",
            "Queue simulation (enqueue, dequeue, front)",
            "Clock angle (hour and minute hands)",
            "Collision detection (two moving points)"
        ],
        keywords: ["simulate", "traffic", "elevator", "robot", "game", "movement", "position", "cache", "clock"]
    },
    {
        name: "Sequence Validation Logic",
        description: "Validate order: parentheses, increasing/decreasing, sorted. Stack for brackets; loop for monotonic.",
        examples: [
            "Valid parentheses sequence (matching brackets)",
            "Increasing sequence check (strict or non-strict)",
            "Decreasing sequence check",
            "Validate sorted array (ascending/descending)",
            "Validate bracket order (multiple types)",
            "Check if array can be sorted with one swap",
            "Valid BST from preorder (range check)",
            "Consecutive sequence check (after sort or in one pass)",
            "Validate stack permutation",
            "Check arithmetic/geometric progression"
        ],
        keywords: ["validate sequence", "order", "parentheses", "sorted check", "monotonic", "progression", "BST preorder"]
    },
    {
        name: "State-Based Logic",
        description: "State transitions, previous vs current, history. Login lock, toggle, simple FSM.",
        examples: [
            "Login attempts lock logic (3 wrong → lock)",
            "Toggle switch logic (ON/OFF)",
            "State machine (states and transitions)",
            "History tracking (last N actions)",
            "Traffic light state (next state from current)",
            "Vending machine (idle, money, dispense)",
            "Previous vs current value (detect change)",
            "Toggle between two modes (A/B)",
            "Accumulator with reset condition",
            "Debounce logic (reset timer on event)"
        ],
        keywords: ["state", "transition", "toggle", "login", "history", "previous", "current", "fsm", "machine"]
    },
    {
        name: "Loop Breaking & Skipping Logic",
        description: "Control flow: break when condition met, continue to skip, first occurrence.",
        examples: [
            "Find first occurrence (break when found)",
            "Early exit (return or break on condition)",
            "Skip values (continue when predicate true)",
            "Break logic (stop at first negative, first zero)",
            "Continue logic (skip even numbers, skip invalid)",
            "Find index of first element satisfying condition",
            "Stop when sum exceeds threshold",
            "Skip duplicates (continue if seen)",
            "First non-null in array",
            "Loop until sentinel value"
        ],
        keywords: ["break", "continue", "early exit", "skip", "first occurrence", "control flow", "sentinel"]
    },
    {
        name: "Mathematical Modeling",
        description: "Translate problem to formula: profit/loss, time-distance, combinations, probability.",
        examples: [
            "Calculate minimum time (rate × time = work)",
            "Split costs fairly (equal or proportional)",
            "Profit/loss calculation (CP, SP, discount)",
            "Time & distance (speed, relative speed)",
            "Simple combination (nCr, arrangements)",
            "Probability simulation (dice, cards)",
            "Compound interest or simple interest",
            "Average speed (total distance / total time)",
            "Work and days (A does in 5 days, B in 10, together?)",
            "Age problems (ratio, after N years)"
        ],
        keywords: ["profit", "loss", "time", "distance", "combination", "probability", "mathematical", "formula", "interest", "average speed"]
    },
    {
        name: "Run-Length & Compression Logic",
        description: "Compress consecutive same elements. Run-length encoding only here (not in Loop+Counter).",
        examples: [
            "Run-length encoding (aaabbc → a3b2c1)",
            "Compress string (remove consecutive duplicates and count)",
            "Count consecutive characters (run length)",
            "Decode run-length encoded string",
            "Run-length for array of numbers",
            "Max run length (longest consecutive same)",
            "Compress sorted array (store value and count)",
            "Run-length of 0s and 1s",
            "Encode and decode (round trip)",
            "Consecutive digit groups in number"
        ],
        keywords: ["run-length", "compression", "consecutive", "encode", "decode", "run"]
    },
    {
        name: "Data Transformation Logic",
        description: "Transform structure: group by key, flat to tree, normalize. Standard library only.",
        examples: [
            "Group data by key (array of objects → map by id)",
            "Transform flat list to tree (parent-child)",
            "Data normalization (flatten nested, rename keys)",
            "Structure conversion (array of pairs → object)",
            "Pivot table (rows to columns or vice versa)",
            "Filter and map in one pass",
            "Merge two lists by key (join-like)",
            "Sort and group (group consecutive by key)",
            "Convert CSV row to object",
            "Aggregate by category (sum per key)"
        ],
        keywords: ["transform", "group", "normalize", "flat to tree", "structure", "convert", "pivot", "aggregate"]
    },
    {
        name: "Frequency & Hash-Like Logic Using FOR",
        description: "No HashMap: use index as key, fixed array, or XOR. Unique in 2N+1, frequency by index. Not missing number (Constraint-Driven/Array Logic).",
        examples: [
            "Find unique element where others appear twice (XOR)",
            "Frequency count using array index (value as index)",
            "Count occurrences using fixed-size array",
            "Space-optimized duplicate check (index marking)",
            "Find two numbers appearing once (others twice) XOR",
            "Majority element (Moore vote, no map)",
            "First element repeating (index array)",
            "Elements appearing more than n/k times (Boyer-like)",
            "Check if array has duplicate in range 1..n (index)",
            "Group elements by frequency (count then bucket)"
        ],
        keywords: ["for loop", "frequency", "array index", "unique", "fixed array", "space optimized", "xor", "no map"]
    },
    {
        name: "Validation & Rule-Engine Logic",
        description: "Format and rule validation (email, phone, range). Not security sanitization (Security-Aware) or business validation only.",
        examples: [
            "Validate email format (regex or loop)",
            "Validate phone number format",
            "Pattern matching (e.g. a*b+)",
            "Basic conditional rules (if-else chain)",
            "Input range validation (min, max)",
            "Validate parentheses balance (count or stack)",
            "Check string is numeric",
            "Validate date format (DD-MM-YYYY)",
            "Rule engine: apply rules in order",
            "Validate PIN (length and digits)"
        ],
        keywords: ["validate", "format", "pattern", "rule", "conditional", "check", "email", "phone", "balance"]
    },
    {
        name: "Segment Processing Logic",
        description: "Process in chunks of K or variable segments. Batch, group by K. No reverse-in-chunks (use other categories).",
        examples: [
            "Process array in chunks of K",
            "Process string in groups of K",
            "Batch processing logic (accumulate then flush)",
            "Apply operation to each segment (sum/max per chunk)",
            "Split array into K equal parts",
            "Process every K-th element",
            "Sliding chunk (window of size K, step 1)",
            "Group consecutive same elements (chunk by value)",
            "Paginate list (page size K, page index)",
            "Process pairs (adjacent or (a[i], a[i+K]))"
        ],
        keywords: ["segment", "chunk", "group processing", "batch", "groups of K", "paginate", "sliding chunk"]
    },
    {
        name: "Error-Handling Logic",
        description: "Defensive: divide by zero, invalid input, default values, graceful fail.",
        examples: [
            "Divide by zero handling (check before divide)",
            "Invalid input detection (null, negative, out of range)",
            "Error state management (return code or flag)",
            "Default value logic (when input missing)",
            "Array index out of bounds check",
            "Handle empty input (return default or skip)",
            "Overflow check before arithmetic",
            "Try-catch or guard clauses (concept)",
            "Validate before use (null check)",
            "Retry on transient failure (simple counter)"
        ],
        keywords: ["error", "handle", "divide by zero", "invalid input", "default", "defensive", "bounds", "overflow"]
    },
    {
        name: "Index Manipulation Logic",
        description: "Index-heavy: swap adjacent, zig-zag, off-by-one, bounds. Rotate lives in Array Traversal / In-Place.",
        examples: [
            "Swap adjacent elements (pairwise)",
            "Zig-zag array (reorder: a < b > c < d > e)",
            "Index bounds check (avoid out of range)",
            "Off-by-one in loop (fix boundary)",
            "Reverse subarray from index i to j",
            "Swap elements at positions i and j",
            "Shift array left by K (index arithmetic)",
            "Circular index (i % n) in loop",
            "Access matrix with row-major index",
            "Find index of min/max in single pass"
        ],
        keywords: ["index", "manipulation", "swap", "zig-zag", "off-by-one", "bounds", "circular", "subarray reverse"]
    },
    {
        name: "Code Output Prediction",
        description: "Predict output of given code. Loop, scope, shadowing, closures. No async.",
        examples: [
            "Loop behavior (what is printed each iteration)",
            "Scope questions (block vs function scope)",
            "Variable shadowing (inner vs outer)",
            "Basic closures (what does function return)",
            "Hoisting (var vs let/const)",
            "Reference vs value (object/array mutation)",
            "Loop with setTimeout (closure over i)",
            "Recursive call output (stack order)",
            "Operator precedence (arithmetic, logical)",
            "Type coercion (== vs ===)"
        ],
        keywords: ["output", "predict", "scope", "closure", "variable", "shadowing", "behavior", "hoisting", "reference"]
    },
    {
        name: "Boundary Traversal Logic",
        description: "Traverse only boundary: matrix border, perimeter, outer ring.",
        examples: [
            "Boundary traversal of matrix (clockwise)",
            "Outer elements of 2D array (first/last row, first/last col)",
            "Perimeter sum of matrix",
            "Spiral boundary (outer ring only)",
            "Print corner elements only",
            "Boundary of rectangle (four sides)",
            "Remove boundary and recurse (concept)",
            "Sum of boundary vs inner elements",
            "Border elements in reverse order",
            "Frame of matrix (hollow)"
        ],
        keywords: ["boundary", "perimeter", "outer traversal", "border", "frame", "corner"]
    },
    {
        name: "Time & Space Complexity Reasoning",
        description: "Theory: analyze and compare complexity (best/worst case, trade-offs). No implementation; reasoning only.",
        examples: [
            "Compare time complexity of two solutions",
            "Big-O analysis of given code",
            "Time vs space trade-off explanation",
            "Best and worst case of quicksort",
            "Complexity of recursive vs iterative solution",
            "Auxiliary space analysis",
            "Amortized analysis (e.g. dynamic array)",
            "Why binary search is O(log n)"
        ],
        keywords: ["complexity", "big-o", "trade-off", "compare", "best case", "worst case", "analysis", "amortized", "auxiliary"]
    },
    {
        name: "Range-Based FOR Logic",
        description: "Operations over [L, R]: sum, count primes, max. Often with prefix/suffix precompute.",
        examples: [
            "Sum in range [L, R] (prefix sum)",
            "Count primes in range [L, R]",
            "Maximum in range (sparse table or prefix max)",
            "Minimum in range [L, R]",
            "XOR in range (prefix XOR)",
            "Count evens in range",
            "Sum of squares in range",
            "GCD in range (segment idea or loop)",
            "Range update then point query (difference array)",
            "Range product modulo M"
        ],
        keywords: ["for loop", "range", "sum", "count", "maximum", "prefix", "suffix", "L R", "query"]
    },
    {
        name: "Monotonic Comparison Logic",
        description: "Track monotonic increase or decrease. Array or running value.",
        examples: [
            "Check if array is monotonic (non-decreasing or non-increasing)",
            "Longest increasing prefix length",
            "Trend detection (first drop or rise)",
            "Monotonic stack (next greater/smaller)",
            "Longest contiguous increasing subarray",
            "Check mountain array (increase then decrease)",
            "Find pivot in sorted rotated (monotonic break)",
            "Monotonic queue (sliding window min/max)",
            "Count reversals to make array monotonic",
            "Valid mountain array (strict increase then decrease)"
        ],
        keywords: ["monotonic", "increasing", "decreasing", "trend", "mountain", "pivot", "contiguous"]
    },
    {
        name: "Bug-Finding & Debugging Logic",
        description: "Given code with bug: find it, fix it, or explain wrong output.",
        examples: [
            "Find bug in code (off-by-one, wrong condition)",
            "Fix incorrect logic (swap operands, correct comparison)",
            "Debug output (why does it print X?)",
            "Explain wrong result (integer overflow, division)",
            "Fix infinite loop (missing update or condition)",
            "Correct boundary condition (empty, single element)",
            "Fix wrong variable used in expression",
            "Identify logic error in loop (initialization, range)",
            "Fix incorrect recursion base case",
            "Correct operator precedence mistake"
        ],
        keywords: ["bug", "debug", "fix", "incorrect", "wrong", "error", "find issue", "infinite loop", "boundary"]
    },
    {
        name: "Difference Array Logic",
        description: "Difference array for range updates: add V to [L,R] in O(1), then prefix to get final array.",
        examples: [
            "Range update queries (add V to [L,R])",
            "Efficient increment in range (difference array)",
            "Difference array technique (reconstruct array)",
            "Multiple range updates then single read",
            "Booking meetings (start +1, end -1)",
            "Cumulative sum after range updates",
            "Max overlapping intervals (sweep with diff)",
            "Car pooling (pick up + drop off diff)",
            "Range add, point query",
            "Altitude gain from range updates"
        ],
        keywords: ["difference array", "range update", "delta", "sweep", "overlapping", "booking"]
    },
    {
        name: "Code Design Thinking (Mini-LLD)",
        description: "Mini design: extensible code, SRP, calculator/cart/parser. Structure over full LLD.",
        examples: [
            "Design calculator (add, subtract, multiply, divide)",
            "Design cart logic (add item, remove, total)",
            "Extensible code design (add new operation without changing existing)",
            "Clean function separation (input → validate → compute → output)",
            "Design rate limiter (interface and simple implementation)",
            "Design parking lot (entry, exit, find slot)",
            "Design vending machine (select, pay, dispense)",
            "Design LRU cache (get, put, capacity)",
            "Design logger (levels, format, output)",
            "Design Tic-Tac-Toe (board, move, win check)"
        ],
        keywords: ["design", "extensible", "clean", "architecture", "calculator", "cart", "lld", "rate limiter", "parking"]
    },
    {
        name: "Competitive Programming Style FOR Logic",
        description: "Classic competitive problems: Kadane, trapping, max subarray, min jumps, stock. Algorithm Identification = pattern only; here = implement.",
        examples: [
            "Kadane's algorithm (max sum subarray)",
            "Rainwater trapping (prefix/suffix max)",
            "Maximum subarray sum (Kadane)",
            "Minimum jumps to reach end (greedy)",
            "Stock buy and sell (one or two transactions)",
            "Longest palindromic substring (expand or DP)",
            "Next permutation (array)",
            "Trapping rain water (two pointers or stack)",
            "Maximum product subarray",
            "Circular max sum subarray (Kadane variant)"
        ],
        keywords: ["competitive", "kadane", "rainwater", "subarray", "jumps", "stock", "for loop", "max sum", "trapping"]
    },
    {
        name: "Memory-Efficient Logic",
        description: "Minimize extra space: bit tricks, in-place, swap without temp. Implementation focus (Brain Teaser = puzzle).",
        examples: [
            "Swap without temp (XOR or arithmetic)",
            "Count set bits (Brian Kernighan or loop)",
            "Bit manipulation (mask, shift)",
            "In-place algorithms (no extra array)",
            "Reverse bits of integer (O(1) space)",
            "Find missing number using XOR (O(1) space)",
            "Two numbers appearing once (XOR split)",
            "In-place merge of two sorted arrays (O(1) space hard)",
            "Run-length encode in-place (concept)",
            "Sort array of 0s 1s in one pass O(1) space"
        ],
        keywords: ["memory", "efficient", "bit manipulation", "in-place", "swap", "set bits", "xor", "o(1) space"]
    },
    {
        name: "Simulation with Counters Logic",
        description: "Simulate with counters: queue length, turn index, round-robin index.",
        examples: [
            "Queue simulation using counters (front, size)",
            "Turn-based game simulation (currentPlayer = 0, 1, 2)",
            "Round-robin logic (index = (index + 1) % n)",
            "Slot allocation (next free slot counter)",
            "Token bucket (tokens refill per second)",
            "Step counter (move until N steps)",
            "Generation counter (simulate N generations)",
            "Frame counter (animation or game loop)",
            "Retry counter (attempts left)",
            "Countdown (timer from N to 0)"
        ],
        keywords: ["simulate", "counter-based", "round robin", "turn", "token bucket", "countdown"]
    },
    {
        name: "Test-Case Design Questions",
        description: "Design test cases: edge, negative, stress, coverage. Testing mindset.",
        examples: [
            "Design test cases for sort function",
            "Edge case identification (empty, single, sorted, reverse)",
            "Stress testing (large N, repeated values)",
            "Test coverage (branch, boundary)",
            "Negative test cases (invalid input, out of range)",
            "Equivalence partitioning (valid/invalid classes)",
            "Test for binary search (key absent, first, last)",
            "Test two-sum (no solution, duplicate indices)",
            "Test palindrome (odd/even length, single char)",
            "Minimum test set for full coverage"
        ],
        keywords: ["test case", "edge case", "stress", "coverage", "testing", "design test", "equivalence", "negative"]
    },
    {
        name: "Logical Edge-Case FOR Questions",
        description: "Interview traps: empty, single element, all same, negative, overflow. Focus on 'what breaks' in loop.",
        examples: [
            "Empty input (loop never runs)",
            "Single element array (no pair, no comparison)",
            "All same values (no max/min distinction)",
            "Negative numbers (max sum, product sign)",
            "Overflow in sum or product",
            "Zero in multiplication (product zero)",
            "All negative (Kadane, max product)",
            "Duplicate pivot (partition stability)",
            "Sorted ascending vs descending (binary search)",
            "K larger than array size (kth largest)"
        ],
        keywords: ["for loop", "edge case", "empty", "single element", "negative", "overflow", "trap", "interview"]
    },
    {
        name: "Mathematical Sequence Logic",
        description: "Generate or identify numeric sequences: AP, GP, custom formula.",
        examples: [
            "Arithmetic progression (print or sum first N terms)",
            "Geometric progression (print or sum)",
            "Custom sequence generation (e.g. 1, 2, 4, 7, 11...)",
            "Fibonacci-like (custom initial values)",
            "Triangular numbers (1, 3, 6, 10...)",
            "Nth term of sequence (formula)",
            "Sum of first N natural numbers (formula)",
            "Prime sequence (first N primes)",
            "Perfect square sequence",
            "Alternating sign series (1, -2, 3, -4...)"
        ],
        keywords: ["sequence", "ap", "gp", "series", "triangular", "fibonacci-like", "nth term"]
    },
    {
        name: "Real-World/Scenario-Based",
        description: "Practical scenarios: cache, rate limit, retry, pagination. Not generic 'validate input' (use Validation or Security-Aware).",
        examples: [
            "Basic cache logic (get, set, size limit)",
            "Simple rate limiter (requests per minute)",
            "Retry with backoff (exponential delay)",
            "Pagination (page number, page size)",
            "Shopping cart total and discount rules",
            "Booking system (check availability slot)",
            "Leaderboard update (insert score, top K)",
            "Session timeout (last activity check)",
            "Simple event counter (per user or global)",
            "Order status workflow (pending → shipped → delivered)"
        ],
        keywords: ["real-world", "scenario", "cache", "rate limit", "retry", "pagination", "cart", "booking", "leaderboard"]
    },
    {
        name: "FOR vs WHILE vs RECURSION",
        description: "Same problem in FOR, WHILE, and Recursion. Compare trade-offs.",
        examples: [
            "Factorial using FOR vs WHILE vs Recursion",
            "Fibonacci using FOR vs WHILE vs Recursion",
            "Sum of array (loop vs recursion)",
            "Print 1 to N (for vs while vs recursion)",
            "Reverse array (iterative vs recursive)",
            "Count digits (loop vs recursion)",
            "Power x^n (iterative vs recursive)",
            "When to use which (readability, stack, tail call)",
            "Convert recursive to iterative (using stack or formula)",
            "Compare space and time of each approach"
        ],
        keywords: ["for vs while", "for vs recursion", "compare", "approach", "factorial", "fibonacci", "iterative vs recursive"]
    },
    {
        name: "Security-Aware Logic",
        description: "Security-focused: sanitize input, escape output, avoid injection. Not generic validation.",
        examples: [
            "Input sanitization (strip script tags, trim)",
            "Escape special characters for output",
            "Basic SQL injection prevention (parameterize idea)",
            "Password strength check (length, digit, special)",
            "Input length limit enforcement",
            "Whitelist allowed characters",
            "Prevent path traversal (.. in path)",
            "Rate limit per IP (simple counter)",
            "Session fixation prevention (concept)",
            "XSS prevention (encode before display)"
        ],
        keywords: ["security", "sanitize", "validate", "input", "safe", "check", "injection", "xss", "escape"]
    },
    {
        name: "Threshold-Based Decision Logic",
        description: "Decisions based on thresholds: alert when exceeded, grade by score, tier by value.",
        examples: [
            "Alert when limit exceeded (e.g. speed, balance)",
            "Threshold-based classification (low/medium/high)",
            "Score grading logic (A/B/C/D/F)",
            "Discount tier by purchase amount",
            "Rate limit (requests per minute)",
            "Battery level indicators (red/yellow/green)",
            "Temperature bands (cold/warm/hot)",
            "Commission slab by sales amount",
            "Eligibility check (min score, min age)",
            "Cap value at max threshold"
        ],
        keywords: ["threshold", "limit", "classification", "tier", "grade", "slab", "cap"]
    },
    {
        name: "Real-World FOR-Loop Logic",
        description: "Backend-style: pagination, chunking, retry, batch, rate limit. Loop over items or time.",
        examples: [
            "Pagination calc (offset, limit, total pages)",
            "Chunk upload (split file into chunks of size K)",
            "Retry logic (try up to N times with backoff)",
            "Batch processing (process in batches of 100)",
            "Rate limiting (allow N per minute, loop over requests)",
            "Process queue (drain N items per tick)",
            "Scheduled tasks (run every K seconds, loop)",
            "Bulk insert (batch of 1000 records)",
            "Throttle (max M requests per window)",
            "Process until empty (while queue not empty)"
        ],
        keywords: ["for loop", "pagination", "chunk", "retry", "batch", "rate limit", "throttle", "backend"]
    },
    {
        name: "Input Normalization Logic",
        description: "Normalize before processing: trim, case, format, whitespace.",
        examples: [
            "Trim leading and trailing spaces",
            "Normalize case (to lowercase or uppercase)",
            "Convert input format (e.g. DD-MM-YYYY to YYYY-MM-DD)",
            "Collapse multiple spaces to one",
            "Remove non-alphanumeric characters",
            "Normalize phone (digits only or with dashes)",
            "Trim and split by delimiter",
            "Pad number with leading zeros",
            "Normalize line endings (CRLF to LF)",
            "Trim array (remove leading/trailing zeros)"
        ],
        keywords: ["normalize", "trim", "lowercase", "uppercase", "collapse", "pad", "format"]
    },
    {
        name: "FOR-Loop Optimization Questions",
        description: "Optimize loops: reduce iterations, nested to single, lower complexity. Implement the optimized loop.",
        examples: [
            "Reduce iterations (skip unnecessary checks)",
            "Convert nested loop to single pass (with hash or pointer)",
            "Time complexity reduction (e.g. O(n²) to O(n))",
            "Memory optimization (in-place, no extra array)",
            "Loop unrolling (manual) for small fixed N",
            "Early termination (break when condition met)",
            "Combine two passes into one",
            "Cache loop-invariant computation outside loop",
            "Use pointer instead of repeated index calculation",
            "Avoid redundant conditions inside loop"
        ],
        keywords: ["for loop", "optimize", "reduce iteration", "nested to single", "complexity", "early termination", "single pass"]
    },
    {
        name: "Comparative Evaluation Logic",
        description: "Compare entities and decide: winner, ranking, best candidate.",
        examples: [
            "Winner determination (max score, tie-break)",
            "Ranking logic (assign rank by score order)",
            "Compare scores (player A vs B, leaderboard)",
            "Find second place (max excluding winner)",
            "Sort by multiple criteria (primary and secondary key)",
            "Compare two arrays (equal, subset, disjoint)",
            "Election winner (majority or plurality)",
            "Best of N (compare and keep best so far)",
            "Lexicographic comparison of two strings",
            "Compare versions (1.2.3 vs 1.2.10)"
        ],
        keywords: ["compare", "ranking", "winner", "leaderboard", "tie-break", "lexicographic", "version compare"]
    },
    {
        name: "Constraint Validation Logic",
        description: "Validate constraints before main logic: size, range, pre-conditions.",
        examples: [
            "Input size validation (N within limit)",
            "Value range validation (min ≤ x ≤ max)",
            "Pre-condition checks (array non-empty, sorted)",
            "Validate triangle (sum of two sides > third)",
            "Check array bounds before access",
            "Validate no negative or zero where positive required",
            "Ensure distinct elements when required",
            "Check sorted order assumption",
            "Validate K ≤ N (e.g. kth largest)",
            "Pre-check divisibility or parity constraints"
        ],
        keywords: ["constraint check", "pre-condition", "validate limits", "bounds", "range", "assumption"]
    },
    {
        name: "Tricky FOR-Loop Output Questions",
        description: "Predict output: var/let in loop, setTimeout, closure, scope. Language-specific gotchas.",
        examples: [
            "setTimeout in loop (var i → same value; let i → 0,1,2)",
            "Closure in loop (captured variable)",
            "Var vs let in for loop (function scope vs block)",
            "Scope issues (shadowing, block scope)",
            "Output prediction (what gets printed?)",
            "Loop with async (await in loop vs Promise.all)",
            "Modifying loop variable inside loop",
            "Infinite loop (wrong condition or missing update)",
            "Off-by-one in condition (i < n vs i <= n-1)",
            "Reference vs value in loop (object in array)"
        ],
        keywords: ["for loop", "tricky", "setTimeout", "closure", "scope", "var", "let", "output", "async"]
    },
    {
        name: "Deterministic Rule Evaluation Logic",
        description: "Rule-based evaluation: scoring, decision table, fixed if-else. No randomness.",
        examples: [
            "Rule-based scoring (sum of weighted criteria)",
            "Decision table evaluation (lookup by conditions)",
            "If-else chain optimization (order by frequency)",
            "Tax calculation by slab (deterministic rules)",
            "Shipping cost by weight and zone",
            "Discount rules (first order, bulk, coupon)",
            "Eligibility rules (age, income, residency)",
            "Grade from marks (fixed bands)",
            "Insurance premium by age and coverage",
            "Multi-rule validator (all must pass)"
        ],
        keywords: ["rule-based", "decision table", "deterministic", "scoring", "slab", "eligibility"]
    },
    {
        name: "Decision Tree Logic",
        description: "Multi-level decisions: nested if-else, eligibility trees, classification.",
        examples: [
            "Loan eligibility check (income, age, credit)",
            "Tax slab calculation (if income in range then rate)",
            "Grade calculation system (marks → grade)",
            "Discount eligibility logic (member, amount, coupon)",
            "Insurance premium (age band, coverage type)",
            "Shipping cost (weight, zone, express)",
            "Access level (role → permissions)",
            "Voucher applicability (min order, category, user)",
            "Multi-criteria filter (AND/OR of conditions)",
            "Category routing (type A → flow 1, type B → flow 2)"
        ],
        keywords: ["decision tree", "nested if", "eligibility", "classification", "slab", "routing"]
    },
    {
        name: "Range Classification Logic",
        description: "Map value to bucket/slab by range: age group, grade, temperature band.",
        examples: [
            "Age group classification (child, teen, adult, senior)",
            "Score to grade mapping (90-100 A, 80-89 B...)",
            "Salary slab assignment (tax or tier)",
            "Temperature category (cold, warm, hot)",
            "BMI category (underweight, normal, overweight)",
            "Price range (budget, mid, premium)",
            "Distance band (local, regional, national)",
            "Lexical range (A-M first half, N-Z second)",
            "Percentile bucket (0-25, 25-50, 50-75, 75-100)",
            "Integer range to label (1-5 → low, 6-10 → high)"
        ],
        keywords: ["range", "classification", "slab", "bucket", "band", "mapping", "category"]
    },
    {
        name: "Sequential Dependency Logic",
        description: "Current step uses result of previous (cumulative, rolling, chain).",
        examples: [
            "Cumulative score tracking (add to previous total)",
            "Progressive tax calculation (each slab on marginal)",
            "Rolling balance update (balance = balance + tx)",
            "Chain calculation logic (output of step i is input of i+1)",
            "Running average (avg = (avg * n + new) / (n+1))",
            "Prefix sum (sum[i] = sum[i-1] + a[i])",
            "Fibonacci sequence (current = prev + prevPrev)",
            "Repeated application (x = f(x) in loop)",
            "State machine (next state = f(current, input))",
            "Pipeline (stage2(stage1(input)))"
        ],
        keywords: ["sequential", "dependency", "cumulative", "rolling", "chain", "pipeline", "running"]
    },
    {
        name: "Toggle & Flip Logic",
        description: "State flips: toggle bit, alternate ON/OFF, switch every K.",
        examples: [
            "Flip bits logic (0→1, 1→0)",
            "Alternate ON/OFF states (every step)",
            "Switch toggling (boolean flip)",
            "Odd-even flip logic (flip at odd indices)",
            "Toggle every K-th element",
            "Flip sign (positive ↔ negative)",
            "Lights out (toggle and neighbors)",
            "Alternate between two values (A, B, A, B...)",
            "Flip array segment (reverse bits in range)",
            "Toggle on condition (if x then flip state)"
        ],
        keywords: ["toggle", "flip", "alternate", "switch", "bit flip", "sign flip"]
    },
    {
        name: "Interval Overlap Logic",
        description: "Intervals: overlap detection, merge, max overlapping count, conflict.",
        examples: [
            "Meeting overlap detection (can two meetings be attended?)",
            "Range collision check (do two intervals overlap?)",
            "Merge overlapping intervals",
            "Maximum number of overlapping intervals",
            "Time-slot clash detection",
            "Insert interval into sorted non-overlapping list",
            "Interval intersection (common part)",
            "Minimum rooms for meetings (max concurrent)",
            "Non-overlapping subset of maximum sum",
            "Remove minimum intervals to make non-overlapping"
        ],
        keywords: ["interval", "overlap", "conflict", "range collision", "merge", "rooms", "concurrent"]
    },
    {
        name: "Normalization & Scaling Logic",
        description: "Scale values to a range: min-max norm, 0–100, ratings.",
        examples: [
            "Normalize marks to 0–100 (linear scale)",
            "Scale ratings from 1–5 to 0–1",
            "Value compression (map range [a,b] to [0,1])",
            "Min-max normalization (x - min) / (max - min)",
            "Scale array to sum to 1 (proportional)",
            "Quantize to nearest K (e.g. round to 5)",
            "Normalize vector to unit length (concept)",
            "Scale by factor (multiply all by constant)",
            "Clip values to [L, R] then scale",
            "Denormalize (reverse scale to original range)"
        ],
        keywords: ["normalize", "scale", "compress", "rescale", "min-max", "quantize", "clip"]
    },
    {
        name: "Index Jumping Logic",
        description: "Index advances by value or condition: jump game, skip, variable step.",
        examples: [
            "Jump game (can reach end? max steps = a[i])",
            "Jump game II (minimum jumps to end)",
            "Skip-based traversal (i += a[i] or i += 1)",
            "Variable-step iteration (next index from condition)",
            "Cycle in array (index = arr[index])",
            "Linked list with random pointer (traversal)",
            "Find duplicate (cycle detection with index)",
            "Teleport positions (index mapping then jump)",
            "Frog jump (can cross? step constraints)",
            "Minimum steps to reach end (BFS on indices)"
        ],
        keywords: ["jump", "skip", "dynamic index", "variable step", "jump game", "cycle", "frog"]
    },
    {
        name: "Mirror & Symmetry Logic",
        description: "Symmetry: mirror array, symmetric matrix, palindrome structure.",
        examples: [
            "Mirror array check (a[i] == a[n-1-i])",
            "Symmetric matrix check (M[i][j] == M[j][i])",
            "Check if array is symmetric about center",
            "Left-right symmetry (string or array)",
            "Mirror binary tree (left-right swap)",
            "Palindrome check (symmetry of string)",
            "Symmetric pairs in array of pairs",
            "Reflect array (reverse and compare)",
            "Check tree is mirror of itself",
            "Symmetric difference of two sets (concept)"
        ],
        keywords: ["mirror", "symmetry", "reflect", "symmetric matrix", "palindrome", "left-right"]
    },
    {
        name: "Progress Tracking Logic",
        description: "Track progress: goal completion, milestones, percentage.",
        examples: [
            "Goal completion tracking (steps done / total)",
            "Download progress (bytes received / total)",
            "Milestone detection (every 25%, 50%, 75%)",
            "Progress bar value (0–100 from ratio)",
            "Level completion (score thresholds for next level)",
            "Streak counter (consecutive days)",
            "Cumulative progress (running sum toward target)",
            "Remaining work (target - current)",
            "ETA (estimate time to complete from rate)",
            "Checkpoint reached (save state at milestones)"
        ],
        keywords: ["progress", "milestone", "target", "completion", "streak", "progress bar", "ETA"]
    },
    {
        name: "Fallback & Priority Logic",
        description: "Fallback when primary fails; priority order for selection.",
        examples: [
            "Primary/secondary selection (try A, else B)",
            "Default option resolution (missing value → default)",
            "Priority-based choice (first non-null, first valid)",
            "Cascade: try method 1, then 2, then 3",
            "Fallback value when key not in map",
            "Retry with fallback config (timeout then shorter)",
            "Priority queue poll (highest first, then next)",
            "Select first available server from list",
            "Default theme when user preference missing",
            "Fallback language (en when locale not found)"
        ],
        keywords: ["fallback", "priority", "default", "preference", "cascade", "first available"]
    },
    {
        name: "Cyclic Traversal Logic",
        description: "Wrap-around: circular array, clock, round-robin. Index = (i + k) % n.",
        examples: [
            "Circular array traversal (wrap at end)",
            "Clock rotation logic (12 → 1)",
            "Round-robin selection (next index in cycle)",
            "Circular queue (front, rear, wrap)",
            "Rotate list (last K to front) using index math",
            "Next element in cycle (i+1) % n",
            "Days of week (Mon=0, Sun=6, next day)",
            "Circular buffer read/write",
            "Josephus problem (cyclic elimination)",
            "Find position after N steps in circular path"
        ],
        keywords: ["cyclic", "circular", "wrap-around", "round robin", "mod", "buffer", "josephus"]
    },
    {
        name: "Gap & Difference Analysis Logic",
        description: "Gaps and differences: max diff, min gap, adjacent diff, delta array.",
        examples: [
            "Maximum difference (max - min, or max a[j]-a[i] for j>i)",
            "Minimum gap between elements (after sort or in place)",
            "Difference pattern (adjacent differences array)",
            "Stock buy-sell (max profit, one transaction)",
            "Maximum sum of consecutive differences (circular or linear)",
            "Find gap in sorted array (missing number)",
            "Largest gap between two 1s in binary",
            "Difference between sum of even and odd indices",
            "Cumulative difference (running delta)",
            "Minimize max gap (partition into K subsets)"
        ],
        keywords: ["difference", "gap", "delta", "compare adjacent", "max profit", "consecutive diff"]
    },
    {
        name: "Event Counting Logic",
        description: "Count events: clicks, errors, threshold-based. Increment on condition.",
        examples: [
            "Click count logic (increment on click)",
            "Error occurrence counter",
            "Threshold-based event count (count when value > K)",
            "Count inversions (i < j and a[i] > a[j])",
            "Count subarrays with sum equal K",
            "Count distinct elements in window",
            "Event in time window (last N seconds)",
            "Frequency of event per user",
            "Consecutive success count (reset on failure)",
            "Count until condition (how many until first negative?)"
        ],
        keywords: ["event", "count", "occurrence", "threshold", "inversions", "subarray count", "window"]
    },
    {
        name: "Conditional Aggregation Logic",
        description: "Aggregate only elements satisfying condition: sum evens, average positives.",
        examples: [
            "Sum only even numbers in array",
            "Average of positive values (ignore negative)",
            "Conditional total (sum where predicate true)",
            "Count elements satisfying condition",
            "Max among elements with property (e.g. even)",
            "Product of non-zero elements",
            "Sum of squares of odd numbers",
            "Weighted sum (weight by condition)",
            "Average of elements in range [L,R]",
            "Aggregate by group (sum per category)"
        ],
        keywords: ["conditional sum", "aggregate", "filter logic", "sum evens", "average positive", "weighted"]
    },
    {
        name: "Directional Traversal Logic",
        description: "Traverse by direction: L-R, R-L, zig-zag, spiral, diagonal.",
        examples: [
            "Left-to-right vs right-to-left (alternate rows)",
            "Zig-zag traversal of matrix",
            "Directional matrix traversal (right, down, left, up)",
            "Spiral order (boundary then inner)",
            "Diagonal traversal (top-left to bottom-right)",
            "Snake pattern (row 0 L-R, row 1 R-L)",
            "Reverse every K elements (direction flip)",
            "Traverse by column then row",
            "Alternate forward and backward in array",
            "Clockwise vs anticlockwise spiral"
        ],
        keywords: ["direction", "zig-zag", "left right traversal", "spiral", "diagonal", "snake"]
    },
    {
        name: "Threshold Crossing Detection",
        description: "Detect crossing: value goes above/below threshold, trigger action.",
        examples: [
            "Temperature alert (above 100 or below 0)",
            "Balance below minimum (insufficient funds)",
            "Limit breach detection (rate limit exceeded)",
            "First time crossing threshold (rising or falling)",
            "Peak detection (local max, then drop)",
            "Level crossing (signal crosses zero)",
            "Consecutive days above threshold",
            "Alert when moving average crosses price",
            "Trigger when count exceeds K",
            "Detect transition from valid to invalid"
        ],
        keywords: ["threshold crossing", "alert", "limit breach", "peak", "level crossing", "trigger"]
    },
    {
        name: "Priority Resolution Logic",
        description: "Resolve conflicts by priority: task order, tie-break, winner.",
        examples: [
            "Task priority execution (higher first)",
            "Winner selection by priority (primary key then secondary)",
            "Conflict resolution (later overwrites or earlier wins)",
            "Tie-breaker (same score → alphabetically)",
            "Merge two lists by priority (both sorted by priority)",
            "Schedule by deadline (earliest deadline first)",
            "Override order (user setting over default)",
            "Precedence of operators (which op first)",
            "Priority inheritance (concept)",
            "Resolve duplicate keys (keep first or last by rule)"
        ],
        keywords: ["priority", "resolve", "conflict", "tie-break", "precedence", "override"]
    },
    {
        name: "Finite State Validation Logic",
        description: "Validate state machine: only allowed transitions (e.g. pending → shipped).",
        examples: [
            "Order status validation (pending → shipped → delivered)",
            "Workflow step validation (draft → review → approved)",
            "State transition check (allowed next states)",
            "TCP state machine (simplified: listen, established, close)",
            "Document lifecycle (draft, submitted, published)",
            "Game state (menu, playing, paused, game over)",
            "Subscription (trial, active, cancelled)",
            "Validate no skip (e.g. cannot go draft → published)",
            "Initial and final states check",
            "Event allowed in current state"
        ],
        keywords: ["state validation", "workflow", "transition", "fsm", "allowed next", "lifecycle"]
    },
    {
        name: "Ranking Without Sorting Logic",
        description: "Rank or top-K without full sort: quickselect, heap, one pass.",
        examples: [
            "Find rank of element (how many smaller?)",
            "Top K elements without sorting (heap or quickselect)",
            "Kth largest / Kth smallest (partial sort)",
            "Find median without full sort",
            "Relative ranking (rank 1, 2, 3 by score order)",
            "Top K frequent (count then partial sort or heap)",
            "Percentile (value at P% position)",
            "Rank in stream (insert and query rank)",
            "Order statistics (kth in unsorted)",
            "Top K by custom comparator (no full sort)"
        ],
        keywords: ["rank", "top k", "without sorting", "kth largest", "median", "quickselect", "heap"]
    },
    {
        name: "Cumulative Comparison Logic",
        description: "Compare running total or running value against limit/condition.",
        examples: [
            "Running total exceeds limit (stop when sum > K)",
            "Cumulative comparison (running max vs current)",
            "Progressive validation (running sum never negative)",
            "Prefix sum equals suffix sum (equilibrium)",
            "Running average vs threshold",
            "Cumulative product overflow check",
            "First index where prefix sum >= target",
            "Running min/max in window",
            "Cumulative count of condition (how many so far)",
            "Compare cumulative to target (enough fuel? enough time?)"
        ],
        keywords: ["cumulative", "running compare", "progressive", "prefix sum", "running total", "equilibrium"]
    },
    {
        name: "Invariant Maintenance Logic",
        description: "Loop invariant: condition true before/after each iteration.",
        examples: [
            "Balance never goes negative (invariant: balance >= 0)",
            "Running minimum constraint (min so far)",
            "Window invariant (e.g. sum in [L, R] always <= K)",
            "Sorted prefix invariant (array [0..i] sorted)",
            "Parentheses count invariant (open >= 0, final == 0)",
            "Two pointers invariant (elements in [i,j] satisfy condition)",
            "Heap property invariant (after each insert)",
            "Range [left, right] always valid",
            "Accumulator invariant (result = f(processed part))",
            "No duplicate in window (set size = window size)"
        ],
        keywords: ["invariant", "always true", "maintain condition", "loop invariant", "sorted prefix"]
    },
    {
        name: "Parity-Based Logic",
        description: "Decisions by odd/even: position, value, count.",
        examples: [
            "Odd-even position behavior (process odd indices first)",
            "Parity-based swaps (swap odd with even index)",
            "Alternate parity grouping (all evens then all odds)",
            "Check parity of sum (even/odd)",
            "XOR parity (result odd iff count of 1s odd)",
            "Alternate by parity (even index = 0, odd = 1)",
            "Parity of count (even number of negatives → positive product)",
            "Odd length vs even length (middle element)",
            "Parity of permutation (inversions count)",
            "Alternate sign (positive, negative, positive...)"
        ],
        keywords: ["parity", "odd", "even", "alternate", "xor parity", "inversions"]
    },
    {
        name: "Greedy Validation Logic",
        description: "Check feasibility: can greedy assignment work? Resource allocation possible?",
        examples: [
            "Can tasks be completed? (deadline feasibility)",
            "Valid greedy assignment (no conflict)",
            "Resource allocation feasibility (enough for all)",
            "Can partition array into two equal sum? (check sum even)",
            "Greedy schedule (all jobs in time?)",
            "Can satisfy all demands with supply?",
            "Valid configuration (constraints not violated)",
            "Feasible capacity (all items fit?)",
            "Greedy choice doesn't break constraint",
            "Check if greedy produces optimal (proof idea)"
        ],
        keywords: ["greedy validation", "feasible", "allocation", "deadline", "partition", "capacity"]
    },
    {
        name: "Backtracking-Free Enumeration Logic",
        description: "Enumerate subsets/combinations with loop or bitmask, no backtracking.",
        examples: [
            "Iterative subset generation (bitmask 0 to 2^n-1)",
            "Bit-mask based enumeration (all subsets)",
            "Combination counters (nCr without recursion)",
            "Generate all pairs (i, j) with i < j",
            "Enumerate all subarrays (start, end loops)",
            "Powerset using iterative loop",
            "All combinations of K elements (nested loops for small K)",
            "Gray code generation (iterative)",
            "Enumerate permutations (next_permutation style)",
            "All possible splits (partition index 1..n-1)"
        ],
        keywords: ["enumeration", "subset", "bitmask", "powerset", "combinations", "iterative", "gray code"]
    },
    {
        name: "Token Consumption Logic",
        description: "Consume tokens/credits/energy; track remaining.",
        examples: [
            "Energy depletion logic (each action costs E)",
            "Credit usage system (deduct per use)",
            "Token-based operations (bucket of tokens)",
            "Rate limit (tokens per second, refill)",
            "Fuel consumption (distance, mpg)",
            "Budget spending (remaining budget after each purchase)",
            "Battery drain (usage per minute)",
            "Quota (N requests per day, decrement)",
            "Lives in game (lose one per failure)",
            "Consume until empty (while balance > 0)"
        ],
        keywords: ["consume", "resource", "token", "depletion", "rate limit", "quota", "budget"]
    },
    {
        name: "Checkpoint & Rollback Logic",
        description: "Save checkpoint; restore/rollback on failure or undo. Can use single saved state.",
        examples: [
            "Undo last valid state (restore previous snapshot)",
            "Rollback on failure (revert to checkpoint)",
            "Checkpoint recovery (restore from last good state)",
            "Transaction-style (commit or rollback all)",
            "Save before destructive operation (copy then restore)",
            "Undo last N operations (store last N states)",
            "Rollback pointer (move index back on condition)",
            "Restore defaults on error",
            "Checkpoint at milestone (save progress)",
            "Revert array to initial state (keep copy)"
        ],
        keywords: ["checkpoint", "rollback", "restore state", "undo", "revert", "transaction"]
    },
    {
        name: "Constraint Satisfaction Without Search",
        description: "Satisfy constraints by ordering or greedy placement, no full search.",
        examples: [
            "Arrange values under constraints (order by rule)",
            "Dependency resolution (topological order)",
            "Constraint-based placement (fill slots by rule)",
            "Schedule with deadlines (earliest deadline first)",
            "Assign without conflict (greedy coloring)",
            "Place N queens (or simplified: one per row/col)",
            "Match brackets (greedy match nearest)",
            "Allocation under capacity (fill in order)",
            "Order tasks by prerequisite (dependency order)",
            "Satisfy all inequalities (e.g. assign heights)"
        ],
        keywords: ["constraint satisfaction", "dependency", "placement", "topological", "schedule", "allocation"]
    },
    {
        name: "Implicit Ordering Logic",
        description: "Use existing order or derive order without full sort.",
        examples: [
            "Lexical comparison logic (string compare)",
            "Order inference from conditions (if a < b and b < c then a < c)",
            "Relative ordering detection (who is before whom)",
            "Use sorted order of one array to order another",
            "Merge two sorted streams (maintain order)",
            "Insert in sorted position (binary search position)",
            "Order by multiple keys (compare first key, then second)",
            "Stable partition (maintain relative order)",
            "Find position in sorted order (rank) without sorting",
            "Compare by custom key (extract key then compare)"
        ],
        keywords: ["implicit order", "relative ordering", "lexical", "merge sorted", "rank", "stable"]
    },
    {
        name: "Delayed Evaluation Logic",
        description: "Compute only when needed: lazy accumulation, deferred check.",
        examples: [
            "Lazy accumulation (compute sum when first requested)",
            "Deferred condition checks (check only at end or on demand)",
            "Delayed aggregation (buffer then flush)",
            "Lazy range (generate next on demand)",
            "Cache result (compute once, reuse)",
            "Short-circuit (skip rest if condition met)",
            "Defer side effect until commit",
            "Lazy validation (validate on access not on set)",
            "Batch updates (apply only when flush)",
            "Iterator-style (next() computes next value)"
        ],
        keywords: ["delayed", "lazy", "deferred", "cache", "short-circuit", "batch", "iterator"]
    },
    {
        name: "One-Pass Multi-Result Logic",
        description: "Single traversal: compute min, max, sum, count, etc. together.",
        examples: [
            "Min, max, sum in one pass",
            "Multiple counters in one loop (even count, odd count)",
            "Simultaneous metrics (min, max, average in one pass)",
            "First and last occurrence in one pass",
            "Sum and product in one pass",
            "Count and sum of positives and negatives",
            "Min index and max index in one pass",
            "Second min and second max (one pass)",
            "Prefix max and suffix min (two passes but O(n) each, or one pass with storage)",
            "All statistics (min, max, mean, count) one pass"
        ],
        keywords: ["one pass", "single traversal", "multi result", "min max sum", "simultaneous", "single loop"]
    },
    {
        name: "Implicit State Encoding Logic",
        description: "Encode state in existing structure: sign bit, index, value mod K.",
        examples: [
            "Sign-based state encoding (negative = visited)",
            "Value-offset encoding (value + N for visited)",
            "Index-based state storage (index i stores state for i)",
            "Use array value as index (value as key)",
            "Encode two values in one (pair encoding)",
            "Bit in integer as flag (bitmask state)",
            "Remainder as state (value % K for K states)",
            "Store state in place of value (swap out, restore later)",
            "Sign of number for extra boolean",
            "Use unused range of values (e.g. 1..n, 0 = unset)"
        ],
        keywords: ["encode state", "implicit state", "sign", "index", "bitmask", "in-place state"]
    },
    {
        name: "Temporal Ordering Logic",
        description: "Order by time or sequence: first/last occurrence, last write wins.",
        examples: [
            "First occurrence tracking (keep first index)",
            "Last valid update wins (overwrite with latest)",
            "Temporal priority logic (recent over old)",
            "First non-null in stream",
            "Last K elements (sliding window of history)",
            "Order by timestamp (process in time order)",
            "Most recent value per key (dedupe by key, keep latest)",
            "First unique (first time seeing value)",
            "Chronological merge (two time-ordered streams)",
            "Expire old entries (time-based invalidation)"
        ],
        keywords: ["temporal", "order", "first last", "last wins", "recent", "timestamp", "chronological"]
    },
    {
        name: "Convergence Detection Logic",
        description: "Detect when value or process stops changing (fixed point).",
        examples: [
            "No-change detection (compare current with previous)",
            "Steady state reached (all elements unchanged)",
            "Convergence condition (difference < epsilon)",
            "Fixed point iteration (x = f(x) until stable)",
            "Simulation until no updates (game of life step)",
            "Iterate until array unchanged",
            "Convergence of running average",
            "Detect cycle (same state seen again)",
            "Max iterations cap (stop after N steps)",
            "Stable assignment (no agent wants to switch)"
        ],
        keywords: ["convergence", "steady state", "stabilize", "fixed point", "no change", "cycle"]
    },
    {
        name: "Reverse Reasoning Logic",
        description: "Work backwards: from target to source, reverse simulation.",
        examples: [
            "Reverse simulation (run process backwards)",
            "Backward validation (check from end to start)",
            "Target-to-source reasoning (given end state find start)",
            "Reverse linked list (iterate and reverse pointers)",
            "Reconstruct path from end to start",
            "Inverse operation (undo steps)",
            "Backward DP (fill table from right to left)",
            "Print array in reverse order (without extra array)",
            "Reverse digits of number",
            "Last-to-first processing (stack or reverse iterate)"
        ],
        keywords: ["reverse logic", "backward reasoning", "reverse simulation", "inverse", "undo"]
    },
    {
        name: "Minimal Representation Logic",
        description: "Minimal encoding: compress state, use smallest type, pack bits.",
        examples: [
            "Minimal encoding (shortest representation)",
            "Compressed counters (e.g. delta encoding)",
            "Symbolic representation (map value to small id)",
            "Pack two numbers in one (a * M + b)",
            "Bit packing (multiple booleans in one int)",
            "Run-length as minimal (count + value)",
            "Minimal string (remove redundant chars)",
            "Smallest integer type that fits range",
            "Canonical form (normalize to minimal equivalent)",
            "Deduplicate then refer by index"
        ],
        keywords: ["minimal", "compressed", "compact", "pack", "bit packing", "canonical"]
    },
    {
        name: "Monotonic Boundary Tracking Logic",
        description: "Track left/right or min/max boundaries that only expand or shrink.",
        examples: [
            "Expanding/shrinking limits (window boundaries)",
            "Monotonic boundary update (left only moves right)",
            "Dynamic bounds logic (narrow range)",
            "Sliding window (left, right both non-decreasing)",
            "Binary search bounds (lo, hi narrow)",
            "Track max so far (monotonic increase)",
            "Track min in suffix (monotonic decrease backward)",
            "Valid range [L, R] (L increase or R decrease)",
            "Monotonic stack (only push when condition)",
            "Two pointers never go back (both forward)"
        ],
        keywords: ["monotonic boundary", "dynamic limits", "sliding window", "binary search bounds", "two pointers"]
    },
    {
        name: "Eligibility Accumulation Logic",
        description: "Eligibility after multiple conditions met over time (count, streak, milestones).",
        examples: [
            "Reward eligibility (complete 5 tasks)",
            "Bonus unlocking logic (reach level 10)",
            "Progress-based qualification (score >= 80 and attendance >= 90%)",
            "Unlock after N consecutive days",
            "Eligible when all criteria met (AND of conditions)",
            "Tier upgrade (total points cross threshold)",
            "Badge earned (complete set of achievements)",
            "Qualify after probation (30 days and no violation)",
            "Cumulative condition (sum of X over period >= Y)",
            "Eligibility reset (requalify after expiry)"
        ],
        keywords: ["eligibility", "qualification", "unlock", "milestone", "streak", "tier", "badge"]
    },
    {
        name: "Non-Resettable Counter Logic",
        description: "Counter only increases (or never decreases). No reset.",
        examples: [
            "Lifetime counters (total visits, all-time total)",
            "Monotonic counters (sequence number, id)",
            "Cumulative event tracking (total count)",
            "Version number (only increment)",
            "Timestamp (only move forward)",
            "Running total (never decrease)",
            "Accumulated score (add only)",
            "Global order id (monotonic)",
            "Event sequence number",
            "Cumulative sum (append-only)"
        ],
        keywords: ["monotonic counter", "lifetime count", "never reset", "sequence number", "version", "cumulative"]
    },
    {
        name: "Implicit Constraint Enforcement",
        description: "Constraints hold by construction (loop bounds, invariant), not by explicit if-check.",
        examples: [
            "Bound-safe traversal (loop limit ensures no out-of-bound)",
            "Implicit overflow prevention (use modulo or larger type)",
            "Safe iteration logic (termination by construction)",
            "Invariant ensures no negative (design so it never happens)",
            "Sorted order maintained by insert position",
            "Uniqueness by set insert (no duplicate possible)",
            "Range [0, n-1] by loop variable",
            "No division by zero (loop excludes 0)",
            "Index always valid (derived from length)",
            "Precondition satisfied by caller (document and rely)"
        ],
        keywords: ["implicit constraint", "safe traversal", "by construction", "invariant", "bound-safe"]
    },
    {
        name: "Logic Deduction from Partial Data",
        description: "Infer missing value from equations or constraints (e.g. sum, XOR).",
        examples: [
            "Find missing value from relations (sum 1..n - array sum)",
            "Infer unknowns (two equations two unknowns)",
            "Constraint-based deduction (only one value satisfies all)",
            "Missing number from XOR (xor all 1..n, xor array, result)",
            "Deduce from parity (sum even → missing is even)",
            "Find duplicate and missing (from sum and sum of squares)",
            "Infer from range (value in [min, max] and distinct)",
            "Deduce center from corners (symmetric constraint)",
            "Find hidden state from observations",
            "Constraint propagation (narrow possibilities)"
        ],
        keywords: ["deduction", "infer", "missing logic", "constraint", "xor", "equation"]
    }
];

// Helper function to identify category from question title
const identifyCategoryFromTitle = (title) => {
    if (!title || typeof title !== 'string') return null;

    const titleLower = title.toLowerCase();
    let bestMatch = null;
    let maxMatches = 0;

    PROGRAMMING_LOGIC_CATEGORIES.forEach((cat) => {
        let matches = 0;

        // Check keywords
        cat.keywords.forEach((keyword) => {
            if (titleLower.includes(keyword.toLowerCase())) {
                matches++;
            }
        });

        // Check examples
        cat.examples.forEach((example) => {
            if (titleLower.includes(example.toLowerCase())) {
                matches += 2; // Examples are weighted higher
            }
        });

        // Check category name
        const categoryNameWords = cat.name.toLowerCase().split(/[\s&/]/);
        categoryNameWords.forEach((word) => {
            if (word.length > 3 && titleLower.includes(word)) {
                matches++;
            }
        });

        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = cat.name;
        }
    });

    return bestMatch;
};

module.exports = {
    PROGRAMMING_LOGIC_CATEGORIES,
    identifyCategoryFromTitle
};
