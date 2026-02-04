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
        examples: ["Prime number check", "Armstrong number", "Fibonacci series", "Factorial", "GCD or LCM", "Sum of digits", "Count digits", "Power of a number", "Binary to Decimal", "Decimal to Binary", "Perfect number", "Strong number"],
        keywords: ["prime", "armstrong", "fibonacci", "factorial", "gcd", "lcm", "sum of digits", "count digits", "power", "binary", "decimal", "perfect number"]
    },
    {
        name: "Basic FOR-Loop Control",
        description: "Loop understanding (Print 1 to N, Print N to 1, Print even/odd, Sum of N numbers, Count divisible by X, Multiplication table)",
        examples: ["Print 1 to N", "Print even numbers", "Sum of N numbers", "Multiplication table", "Count divisible"],
        keywords: ["for loop", "print", "sum", "count", "multiplication table", "even", "odd"]
    },
    {
        name: "Array Logic",
        description: "Indexing, loops (Find missing number, Remove duplicates, Merge arrays, Intersection/Union, Frequency, Subarray sum, Mode, Second largest). Prefer missing number, merge, frequency over generic find max/min.",
        examples: ["Find missing number in sequence", "Remove duplicates", "Merge two sorted arrays", "Intersection of two arrays", "Frequency count", "Subarray sum", "Find mode (most frequent)", "Second largest", "Find largest element"],
        keywords: ["array", "missing", "duplicate", "merge", "intersection", "union", "frequency", "subarray", "mode", "largest"]
    },
    {
        name: "Conditional Logic Inside FOR Loop",
        description: "Branching in iteration - one distinct problem per question (Count even/odd, Count positive/negative, Sum until condition, Skip multiples of K, Conditional accumulation)",
        examples: ["Count even and odd in array", "Count positive and negative numbers", "Sum elements until first negative", "Print numbers skipping multiples of 5", "Sum only elements satisfying condition"],
        keywords: ["conditional", "for loop", "count", "sum", "skip", "if inside loop", "until condition"]
    },
    {
        name: "String Logic",
        description: "Manipulation, ASCII, memory. PREFER: Anagram, First non-repeating, Remove duplicates, String rotation, Longest word, Count vowels/consonants. Use Reverse string or Palindrome only if no other option (avoid duplicates).",
        examples: ["Anagram check", "First non-repeating character", "Remove duplicate characters", "String rotation", "Longest word in sentence", "Count vowels and consonants", "Check if two strings are rotations of each other", "Word count or tokenize"],
        keywords: ["string", "anagram", "vowel", "consonant", "duplicate", "non-repeating", "rotation", "longest word", "tokenize"]
    },
    {
        name: "Greedy Decision Logic",
        description: "Step-by-step optimal choice logic without backtracking (local optimum → global solution)",
        examples: ["Minimum coins for amount", "Activity selection problem", "Minimum platforms required", "Job sequencing problem"],
        keywords: ["greedy", "optimal choice", "minimum", "maximum", "local optimum"]
    },
    {
        name: "Sorting & Searching",
        description: "Algorithmic thinking (Bubble/Selection/Insertion/Merge/Quick Sort, Linear/Binary Search, Search in rotated array)",
        examples: ["Bubble Sort", "Merge Sort", "Quick Sort", "Binary Search", "Search in rotated sorted array", "Selection Sort", "Insertion Sort"],
        keywords: ["sort", "bubble", "merge", "quick", "selection", "insertion", "search", "binary search", "linear search"]
    },
    {
        name: "Nested FOR-Loop Logic",
        description: "Nested iteration - two loops (All pairs that sum to target, Compare every pair, Duplicate detection O(n²), Generate all subarrays). Use 'all pairs' or 'every pair' to distinguish from Two-Pointer pair sum in sorted array.",
        examples: ["Find all pairs in array that sum to target", "Compare every element with every other", "Duplicate detection with two loops", "Generate all subarrays", "Two-sum brute force with nested loops"],
        keywords: ["nested loop", "nested for", "all pairs", "compare all", "every pair", "subarray", "brute force"]
    },
    {
        name: "Pattern Printing",
        description: "Loop control & visualization - each pattern type only once (Star pyramid OR number pyramid OR diamond OR spiral - pick one type per question)",
        examples: ["Star pyramid (asterisks)", "Number pyramid (1 12 123)", "Diamond pattern", "Spiral number pattern", "Hollow square pattern", "Alternating character pattern"],
        keywords: ["pattern", "star", "pyramid", "triangle", "diamond", "spiral", "hollow", "alternating"]
    },
    {
        name: "Prefix Computation Logic",
        description: "Precompute values to answer queries efficiently (no advanced DS)",
        examples: ["Prefix sum array", "Prefix max / min array", "Running sum", "Cumulative frequency"],
        keywords: ["prefix", "cumulative", "running sum", "precompute"]
    },
    {
        name: "2D/Matrix Logic",
        description: "Indexing, nested loops (Matrix addition/subtraction, Transpose, Diagonal sum, Rotate matrix, Search in matrix, Spiral matrix)",
        examples: ["Matrix transpose", "Diagonal sum", "Rotate matrix 90°", "Spiral matrix", "Search in matrix", "Matrix addition", "Row/Column sum"],
        keywords: ["matrix", "2d", "transpose", "diagonal", "spiral", "rotate matrix", "row", "column"]
    },
    {
        name: "Mathematical FOR-Loop Logic",
        description: "Math + iteration with loop (Print primes in range, Optimized prime check, Sum of divisors, Loop till √n). Avoid repeating Number-Based: use prime-in-range / optimized-prime, not single-number Fibonacci/Armstrong/Factorial.",
        examples: ["Print all primes in range", "Optimized prime check using √n", "Sum of divisors of N", "Check perfect number using loop", "Prime factorization"],
        keywords: ["for loop", "prime in range", "optimized prime", "divisors", "factorization", "math"]
    },
    {
        name: "Recursion-Based",
        description: "Stack & base conditions (Factorial, Fibonacci, Power, Tower of Hanoi, Tree traversal, Generate permutations). Prefer Tower of Hanoi, Power, tree/grid recursion over Reverse string.",
        examples: ["Tower of Hanoi", "Factorial using recursion", "Fibonacci using recursion", "Power using recursion", "Generate all permutations", "Binary tree height or sum", "Flood fill or grid recursion"],
        keywords: ["recursion", "recursive", "tower", "hanoi", "factorial", "fibonacci", "permutation", "tree"]
    },
    {
        name: "Suffix Computation Logic",
        description: "Right-to-left computation for optimization problems",
        examples: ["Suffix max array", "Suffix sum", "Right-side greater elements", "Product of array except self (suffix part)"],
        keywords: ["suffix", "right to left", "reverse traversal"]
    },
    {
        name: "Logical/Brain Teaser",
        description: "Reasoning more than coding (Swap without temp, Find odd one out, Minimum jumps, Water trapping, Find duplicate without extra space)",
        examples: ["Swap two numbers without temp", "Minimum jumps problem", "Water trapping problem", "Find duplicate without extra space", "Find odd one out"],
        keywords: ["swap", "jump", "water", "trap", "duplicate without space", "odd one out", "brain teaser"]
    },
    {
        name: "Array Traversal Using FOR",
        description: "Single-pass array iteration (Move zeros to end, Rotate array by K, Sliding window max, Frequency count in one pass, Partition array by condition, Trailing sum)",
        examples: ["Move zeros to end", "Rotate array by K steps", "Sliding window maximum", "Frequency count single pass", "Partition array by condition", "Trailing sum or product"],
        keywords: ["for loop", "array", "traverse", "move zeros", "rotate", "sliding window", "partition", "single pass"]
    },
    {
        name: "Time & Space Complexity",
        description: "Optimization skills (Optimize prime check, Best way to find duplicates, Reduce O(n²) to O(n), Memory-efficient solutions)",
        examples: ["Optimize prime check", "Find duplicates efficiently", "Reduce time complexity", "Memory-efficient solution", "Big-O analysis"],
        keywords: ["optimize", "complexity", "efficient", "big-o", "time complexity", "space complexity", "o(n)", "o(n²)"]
    },
    {
        name: "In-Place Transformation Logic",
        description: "Modify data without extra space. Prefer rotate, replace, partition over reverse to avoid duplicate problems.",
        examples: ["Rotate array in-place by K", "Replace elements based on condition", "Move zeros in-place", "Partition array in-place", "Mark visited using same array"],
        keywords: ["in-place", "no extra space", "modify array", "rotate", "partition", "replace"]
    },
    {
        name: "Core Logic Construction",
        description: "Build logic from scratch without built-ins (Reverse number without string conversion, Find max without Math.max, Count digits without length, Convert problem to algorithm, Handle constraints manually)",
        examples: ["Reverse number without string", "Find max without Math.max", "Count digits without length", "Manual constraint handling"],
        keywords: ["without built-in", "from scratch", "manual", "constraint", "no math.max", "no string conversion"]
    },
    {
        name: "String Traversal Using FOR",
        description: "Character-level single-pass in one loop. PREFER: Toggle case, Remove consecutive duplicates, Character frequency. Avoid reusing String Logic examples (no first non-repeating, no count vowels - use those in String Logic only).",
        examples: ["Toggle case of letters", "Remove consecutive duplicate characters", "Character frequency in string", "Replace character at positions", "Count uppercase vs lowercase"],
        keywords: ["for loop", "string", "traverse", "toggle", "consecutive", "character frequency", "uppercase", "lowercase"]
    },
    {
        name: "Constraint-Driven Logic",
        description: "Think within strict rules (Single loop only, O(n) time, No sorting, No recursion). Prefer missing number, majority element, single-loop. Avoid 'duplicate without extra space' - use Logical/Brain Teaser for that.",
        examples: ["Missing number in 1..N using single loop", "Majority element in O(n) time", "Single loop solution with O(1) space", "Find two repeated numbers with constraints"],
        keywords: ["single loop", "o(n)", "no sorting", "no recursion", "constraint", "missing number", "majority"]
    },
    {
        name: "Counting & Bucketing Logic",
        description: "Count occurrences using fixed-size arrays (no maps)",
        examples: ["Character frequency using array", "Counting sort logic", "Frequency of digits", "Bucket-based counting"],
        keywords: ["counting", "bucket", "frequency array"]
    },
    {
        name: "Edge-Case Dominant",
        description: "Production-ready thinking (Empty input, Large input, Negative values, Overflow, Single-element arrays, All zeros)",
        examples: ["Sum of empty array", "String with only spaces", "Array with all zeros", "Overflow handling", "Single element arrays"],
        keywords: ["empty", "large input", "negative", "overflow", "single element", "edge case", "boundary"]
    },
    {
        name: "Two-Pointer FOR-Loop Logic",
        description: "Optimization with two indices (Pair sum in sorted array, Remove duplicates from sorted, Merge two sorted arrays, Partition around pivot). Avoid reusing Palindrome/Reverse - prefer pair sum, merge, partition.",
        examples: ["Pair sum in sorted array", "Remove duplicates from sorted array", "Merge two sorted arrays", "Partition array around pivot", "Container with most water", "Triplet sum in sorted array"],
        keywords: ["two pointer", "for loop", "sorted", "pair sum", "merge sorted", "partition", "optimize"]
    },
    {
        name: "Input Parsing & Data Handling",
        description: "Common in online tests using standard I/O (Parse multi-line input, Handle unknown input size, Read until EOF, Mixed input types, Basic string parsing)",
        examples: ["Multi-line input parsing", "Basic string parsing", "Matrix input parsing", "Commands from input", "EOF handling"],
        keywords: ["parse", "multi-line", "input", "eof", "unknown size", "mixed input", "command"]
    },
    {
        name: "Window Expansion & Shrinking Logic",
        description: "Dynamic window size adjustment based on conditions",
        examples: ["Smallest subarray with sum ≥ K", "Longest substring with constraints", "Window expansion & contraction"],
        keywords: ["window", "expand", "shrink", "dynamic window"]
    },
    {
        name: "Multiple-Solution Problems",
        description: "Same problem, different logic approaches (Loop-based, Math-based, Two-pointer, Hashing, Recursion). Prefer duplicate detection, factorial, or search - avoid palindrome.",
        examples: ["Duplicate detection multiple ways", "Factorial via loop vs recursion", "Search multiple approaches", "Same problem different logic"],
        keywords: ["multiple ways", "different approach", "loop-based", "math-based", "two-pointer", "hashing"]
    },
    {
        name: "Loop + Counter Logic",
        description: "Counter tracking in single pass (Longest consecutive sequence, Majority element, Count frequency without map). Do not use run-length encoding here - that is Run-Length & Compression Logic.",
        examples: ["Longest consecutive sequence in array", "Majority element in array", "Count frequency without map", "Leader in array (elements greater than all on right)"],
        keywords: ["loop", "counter", "consecutive", "majority", "frequency", "leader"]
    },
    {
        name: "Optimization & Refactoring Logic",
        description: "Improve existing code (Reduce time complexity, Reduce memory, Remove redundancy, Improve readability, Convert O(n²) to O(n))",
        examples: ["Convert O(n²) to O(n)", "Remove nested loops", "Optimize existing solution", "Refactor code"],
        keywords: ["refactor", "optimize", "reduce complexity", "remove nested", "improve", "better solution"]
    },
    {
        name: "Index Mapping Logic",
        description: "Map values to indices to encode extra information",
        examples: ["Index-based marking", "Find duplicates using index mapping", "Negative marking technique"],
        keywords: ["index mapping", "negative marking", "encode index"]
    },
    {
        name: "Algorithm Identification",
        description: "Recognize which algorithm pattern fits a problem (meta: identify sliding window vs two pointer vs prefix sum). Do not duplicate 'solve Kadane' or 'solve pair sum' - use for pattern recognition only.",
        examples: ["Identify if problem needs sliding window", "Recognize two-pointer pattern", "Choose prefix sum vs brute force", "Algorithm pattern matching"],
        keywords: ["algorithm pattern", "identify", "recognize", "sliding window", "two pointer", "prefix sum", "pattern fit"]
    },
    {
        name: "Sorting Logic Using FOR",
        description: "Core algorithms (Bubble sort, Selection sort, Insertion sort, Counting sort, Custom sort, Swap conditions)",
        examples: ["Bubble sort", "Selection sort", "Insertion sort", "Counting sort", "Custom sort"],
        keywords: ["for loop", "sort", "bubble", "selection", "insertion", "counting", "swap"]
    },
    {
        name: "Logical Simulation Problems",
        description: "Simulate a system (Traffic signal logic, Elevator logic, Game moves, Robot movement, Position after N moves)",
        examples: ["Traffic signal logic", "Elevator logic", "Robot movement", "Game simulation", "Position tracking"],
        keywords: ["simulate", "traffic", "elevator", "robot", "game", "movement", "position"]
    },
    {
        name: "Sequence Validation Logic",
        description: "Validate order or sequence correctness",
        examples: ["Valid parentheses sequence", "Increasing / decreasing sequence check", "Validate sorted array", "Validate bracket order"],
        keywords: ["validate sequence", "order", "parentheses", "sorted check"]
    },
    {
        name: "State-Based Logic",
        description: "State transitions and history (State transitions, Previous vs current state, History tracking, Login attempts, Toggle switch)",
        examples: ["Login attempts lock logic", "Toggle switch logic", "State machine", "History tracking"],
        keywords: ["state", "transition", "toggle", "login", "history", "previous", "current"]
    },
    {
        name: "Loop Breaking & Skipping Logic",
        description: "Control flow (Stop when condition met, Find first occurrence, Skip certain values, Early exit, Break/continue)",
        examples: ["Find first occurrence", "Early exit", "Skip values", "Break logic", "Continue logic"],
        keywords: ["break", "continue", "early exit", "skip", "first occurrence", "control flow"]
    },
    {
        name: "Mathematical Modeling",
        description: "Logic + formulas (Profit/loss, Time & distance, Combinations, Probability simulation, Minimum time calculation)",
        examples: ["Calculate minimum time", "Split costs fairly", "Profit/loss calculation", "Time & distance problems"],
        keywords: ["profit", "loss", "time", "distance", "combination", "probability", "mathematical", "formula"]
    },
    {
        name: "Run-Length & Compression Logic",
        description: "Compress consecutive elements logically",
        examples: ["Run-length encoding", "Compress string", "Count consecutive characters", "Frequency compression"],
        keywords: ["run-length", "compression", "consecutive"]
    },
    {
        name: "Data Transformation Logic",
        description: "Basic data transformation using standard library (Convert structure to another, Normalize data, Group data, Transform flat to tree, No external dependencies)",
        examples: ["Group data by key", "Transform flat data to tree", "Data normalization", "Structure conversion"],
        keywords: ["transform", "group", "normalize", "flat to tree", "structure", "convert"]
    },
    {
        name: "Frequency & Hash-Like Logic Using FOR",
        description: "Without maps: use array index as key (Find unique element in 2N+1 array, Frequency using index, Count using fixed array). Do not repeat 'missing number' or 'remove duplicates' from Array Logic - use unique/frequency only.",
        examples: ["Find unique element in array where others appear twice", "Frequency count using array index", "Count occurrences using fixed-size array", "Space-optimized duplicate check"],
        keywords: ["for loop", "frequency", "array index", "unique", "fixed array", "space optimized"]
    },
    {
        name: "Validation & Rule-Engine Logic",
        description: "Basic validation using standard library (Format validation, Pattern matching, Basic conditional rules, No external libraries)",
        examples: ["Format validation", "Pattern matching", "Basic conditional rules", "Input format checks"],
        keywords: ["validate", "format", "pattern", "rule", "conditional", "check"]
    },
    {
        name: "Segment Processing Logic",
        description: "Process array or string in fixed or variable segments (chunks of K, batch processing). Avoid 'reverse' - use process in chunks, group by K.",
        examples: ["Process array in chunks of K", "Process string in groups of K", "Batch processing logic", "Apply operation to each segment"],
        keywords: ["segment", "chunk", "group processing", "batch", "groups of K"]
    },
    {
        name: "Error-Handling Logic",
        description: "Defensive programming (Fail gracefully, Default values, Error states, Divide by zero, Invalid input detection)",
        examples: ["Divide by zero handling", "Invalid input detection", "Error state management", "Default value logic"],
        keywords: ["error", "handle", "divide by zero", "invalid input", "default", "defensive"]
    },
    {
        name: "Index Manipulation Logic",
        description: "Bug-prone area (Swap adjacent elements, Rotate by K steps, Zig-zag array, Off-by-one errors, Index bounds)",
        examples: ["Swap adjacent elements", "Rotate array by K steps", "Zig-zag array", "Index bounds check", "Off-by-one in loop"],
        keywords: ["index", "manipulation", "swap", "rotate", "zig-zag", "off-by-one", "bounds"]
    },
    {
        name: "Code Output Prediction",
        description: "Predict code behavior using standard execution (Loop behavior, Scope, Variable shadowing, Basic closures, No async)",
        examples: ["Loop behavior", "Scope questions", "Variable shadowing", "Basic closures"],
        keywords: ["output", "predict", "scope", "closure", "variable", "shadowing", "behavior"]
    },
    {
        name: "Boundary Traversal Logic",
        description: "Traverse only boundary elements",
        examples: ["Boundary traversal of matrix", "Outer elements of array", "Perimeter sum"],
        keywords: ["boundary", "perimeter", "outer traversal"]
    },
    {
        name: "Time & Space Complexity Reasoning",
        description: "Explicit complexity analysis (Best/worst case, Big-O analysis, Trade-offs, Compare solutions, Complexity reasoning)",
        examples: ["Compare two solutions", "Big-O analysis", "Time vs space trade-off", "Complexity reasoning"],
        keywords: ["complexity", "big-o", "trade-off", "compare", "best case", "worst case", "analysis"]
    },
    {
        name: "Range-Based FOR Logic",
        description: "Range operations (Sum in range, Count primes in range, Maximum in range, Prefix/suffix logic)",
        examples: ["Sum in range", "Count primes range", "Maximum range", "Prefix suffix"],
        keywords: ["for loop", "range", "sum", "count", "maximum", "prefix", "suffix"]
    },
    {
        name: "Monotonic Comparison Logic",
        description: "Track monotonic increase or decrease",
        examples: ["Check monotonic array", "Longest increasing prefix", "Trend detection"],
        keywords: ["monotonic", "increasing", "decreasing"]
    },
    {
        name: "Bug-Finding & Debugging Logic",
        description: "Find and fix bugs (Find bug in given code, Fix incorrect logic, Explain wrong output, Debug code)",
        examples: ["Find bug in code", "Fix incorrect logic", "Debug output", "Explain wrong result"],
        keywords: ["bug", "debug", "fix", "incorrect", "wrong", "error", "find issue"]
    },
    {
        name: "Difference Array Logic",
        description: "Use difference technique to optimize range updates",
        examples: ["Range update queries", "Efficient increment in range", "Difference array technique"],
        keywords: ["difference array", "range update", "delta"]
    },
    {
        name: "Code Design Thinking (Mini-LLD)",
        description: "Design extensible code (Write extensible code, Follow SRP, Clean function separation, Design calculator, Design cart)",
        examples: ["Design calculator", "Design cart logic", "Extensible code design", "Clean architecture"],
        keywords: ["design", "extensible", "clean", "architecture", "calculator", "cart", "lld"]
    },
    {
        name: "Competitive Programming Style FOR Logic",
        description: "Product companies (Kadane's algorithm, Rainwater trapping, Maximum subarray, Minimum jumps, Stock buy/sell)",
        examples: ["Kadane's algorithm", "Rainwater trapping", "Maximum subarray", "Minimum jumps", "Stock buy/sell"],
        keywords: ["competitive", "kadane", "rainwater", "subarray", "jumps", "stock", "for loop"]
    },
    {
        name: "Memory-Efficient Logic",
        description: "Embedded & high-scale roles (Bit manipulation, In-place algorithms, Swap without temp, Count set bits)",
        examples: ["Swap without temp", "Count set bits", "Bit manipulation", "In-place algorithms"],
        keywords: ["memory", "efficient", "bit manipulation", "in-place", "swap", "set bits"]
    },
    {
        name: "Simulation with Counters Logic",
        description: "Simulate systems using counters only",
        examples: ["Queue simulation using counters", "Turn-based game simulation", "Round-robin logic"],
        keywords: ["simulate", "counter-based", "round robin"]
    },
    {
        name: "Test-Case Design Questions",
        description: "Testing mindset (Edge cases, Negative cases, Stress cases, Test case design, Coverage)",
        examples: ["Design test cases", "Edge case identification", "Stress testing", "Test coverage"],
        keywords: ["test case", "edge case", "stress", "coverage", "testing", "design test"]
    },
    {
        name: "Logical Edge-Case FOR Questions",
        description: "Interview traps (Empty input, Single element, All same values, Negative numbers, Overflow conditions)",
        examples: ["Empty input", "Single element", "All same values", "Negative numbers", "Overflow"],
        keywords: ["for loop", "edge case", "empty", "single element", "negative", "overflow"]
    },
    {
        name: "Mathematical Sequence Logic",
        description: "Identify and generate numeric sequences",
        examples: ["Arithmetic progression", "Geometric progression", "Custom sequence generation"],
        keywords: ["sequence", "ap", "gp", "series"]
    },
    {
        name: "Real-World/Scenario-Based",
        description: "Practical applications using standard library only (Validate user input, Basic cache logic, Simple data processing, No external dependencies)",
        examples: ["Validate user input", "Basic cache logic", "Simple data processing", "Input validation"],
        keywords: ["real-world", "scenario", "cache", "validate", "practical", "application"]
    },
    {
        name: "FOR vs WHILE vs RECURSION",
        description: "Same problem different approaches (Factorial, Fibonacci, Sum - compare FOR, WHILE, Recursion). Prefer factorial/fibonacci over reverse.",
        examples: ["Factorial comparison", "Fibonacci comparison", "Sum of array comparison", "Approach comparison"],
        keywords: ["for vs while", "for vs recursion", "compare", "approach", "factorial", "fibonacci"]
    },
    {
        name: "Security-Aware Logic",
        description: "Basic security checks using standard library (Input sanitization, Basic validation, No external dependencies)",
        examples: ["Input sanitization", "Basic validation", "Input format checks"],
        keywords: ["security", "sanitize", "validate", "input", "safe", "check"]
    },
    {
        name: "Threshold-Based Decision Logic",
        description: "Trigger actions based on thresholds",
        examples: ["Alert when limit exceeded", "Threshold-based classification", "Score grading logic"],
        keywords: ["threshold", "limit", "classification"]
    },
    {
        name: "Real-World FOR-Loop Logic",
        description: "Backend & MERN (Pagination calculation, Chunk file upload, Retry logic, Batch processing, API rate limiting)",
        examples: ["Pagination calc", "Chunk upload", "Retry logic", "Batch processing", "Rate limiting"],
        keywords: ["for loop", "pagination", "chunk", "retry", "batch", "rate limit"]
    },
    {
        name: "Input Normalization Logic",
        description: "Normalize input before processing",
        examples: ["Trim spaces", "Normalize case", "Convert input format"],
        keywords: ["normalize", "trim", "lowercase", "uppercase"]
    },
    {
        name: "FOR-Loop Optimization Questions",
        description: "Advanced (Reduce iterations, Convert nested to single loop, Time complexity reduction, Memory optimization)",
        examples: ["Reduce iterations", "Nested to single", "Complexity reduction", "Memory optimization"],
        keywords: ["for loop", "optimize", "reduce iteration", "nested to single", "complexity"]
    },
    {
        name: "Comparative Evaluation Logic",
        description: "Compare multiple entities and decide outcome",
        examples: ["Winner determination", "Ranking logic", "Compare scores"],
        keywords: ["compare", "ranking", "winner"]
    },
    {
        name: "Constraint Validation Logic",
        description: "Validate constraints before execution",
        examples: ["Input size validation", "Value range validation", "Pre-condition checks"],
        keywords: ["constraint check", "pre-condition", "validate limits"]
    },
    {
        name: "Tricky FOR-Loop Output Questions",
        description: "Interview favorites (Loop behavior with var/let, setTimeout in loop, Closure in loop, Scope issues, Output prediction)",
        examples: ["setTimeout in loop", "Closure in loop", "Var vs let", "Scope issues", "Output prediction"],
        keywords: ["for loop", "tricky", "setTimeout", "closure", "scope", "var", "let", "output"]
    },
    {
        name: "Deterministic Rule Evaluation Logic",
        description: "Strict rule-based evaluation without randomness",
        examples: ["Rule-based scoring", "Decision table evaluation", "If-else chain optimization"],
        keywords: ["rule-based", "decision table", "deterministic"]
    },
    {
        name: "Decision Tree Logic",
        description: "Multi-level decision making using nested conditions",
        examples: ["Loan eligibility check", "Tax slab calculation", "Grade calculation system", "Discount eligibility logic"],
        keywords: ["decision tree", "nested if", "eligibility", "classification"]
    },
    {
        name: "Range Classification Logic",
        description: "Classify values based on numeric or lexical ranges",
        examples: ["Age group classification", "Score to grade mapping", "Salary slab assignment", "Temperature category"],
        keywords: ["range", "classification", "slab", "bucket"]
    },
    {
        name: "Sequential Dependency Logic",
        description: "Each step depends on previous computation",
        examples: ["Cumulative score tracking", "Progressive tax calculation", "Rolling balance update", "Chain calculation logic"],
        keywords: ["sequential", "dependency", "cumulative", "rolling"]
    },
    {
        name: "Toggle & Flip Logic",
        description: "Repeated state flipping based on conditions",
        examples: ["Flip bits logic", "Alternate ON/OFF states", "Switch toggling", "Odd-even flip logic"],
        keywords: ["toggle", "flip", "alternate", "switch"]
    },
    {
        name: "Interval Overlap Logic",
        description: "Detect overlap between numeric or time intervals",
        examples: ["Meeting overlap detection", "Range collision check", "Interval conflict logic", "Time-slot clash detection"],
        keywords: ["interval", "overlap", "conflict", "range collision"]
    },
    {
        name: "Normalization & Scaling Logic",
        description: "Scale values into defined ranges",
        examples: ["Normalize marks to 0–100", "Scale ratings", "Value compression logic"],
        keywords: ["normalize", "scale", "compress", "rescale"]
    },
    {
        name: "Index Jumping Logic",
        description: "Move indices dynamically based on values",
        examples: ["Jump game logic", "Skip-based traversal", "Variable-step iteration"],
        keywords: ["jump", "skip", "dynamic index", "variable step"]
    },
    {
        name: "Mirror & Symmetry Logic",
        description: "Symmetry and mirror comparison logic",
        examples: ["Mirror array check", "Symmetric matrix check", "Check if array is symmetric about center", "Left-right symmetry logic"],
        keywords: ["mirror", "symmetry", "reflect"]
    },
    {
        name: "Progress Tracking Logic",
        description: "Track progress toward a target",
        examples: ["Goal completion tracking", "Download progress logic", "Milestone detection"],
        keywords: ["progress", "milestone", "target", "completion"]
    },
    {
        name: "Fallback & Priority Logic",
        description: "Apply fallback rules when preferred condition fails",
        examples: ["Primary/secondary selection logic", "Default option resolution", "Priority-based choice"],
        keywords: ["fallback", "priority", "default", "preference"]
    },
    {
        name: "Cyclic Traversal Logic",
        description: "Wrap-around iteration logic",
        examples: ["Circular array traversal", "Clock rotation logic", "Round-robin selection"],
        keywords: ["cyclic", "circular", "wrap-around", "round robin"]
    },
    {
        name: "Gap & Difference Analysis Logic",
        description: "Analyze gaps between values",
        examples: ["Maximum difference in array", "Minimum gap between elements", "Difference pattern detection"],
        keywords: ["difference", "gap", "delta", "compare adjacent"]
    },
    {
        name: "Event Counting Logic",
        description: "Count occurrences of events based on conditions",
        examples: ["Click count logic", "Error occurrence counter", "Threshold-based event count"],
        keywords: ["event", "count", "occurrence", "threshold"]
    },
    {
        name: "Conditional Aggregation Logic",
        description: "Aggregate values conditionally",
        examples: ["Sum only even numbers", "Average of positive values", "Conditional total calculation"],
        keywords: ["conditional sum", "aggregate", "filter logic"]
    },
    {
        name: "Directional Traversal Logic",
        description: "Traverse data based on direction rules",
        examples: ["Left-to-right vs right-to-left", "Zig-zag traversal", "Directional matrix traversal"],
        keywords: ["direction", "zig-zag", "left right traversal"]
    },
    {
        name: "Threshold Crossing Detection",
        description: "Detect when values cross a threshold",
        examples: ["Temperature alert logic", "Balance below minimum", "Limit breach detection"],
        keywords: ["threshold crossing", "alert", "limit breach"]
    },
    {
        name: "Priority Resolution Logic",
        description: "Resolve conflicts using priority rules",
        examples: ["Task priority execution", "Winner selection by priority", "Conflict resolution logic"],
        keywords: ["priority", "resolve", "conflict"]
    },
    {
        name: "Finite State Validation Logic",
        description: "Validate allowed state transitions",
        examples: ["Order status validation", "Workflow step validation", "State transition check"],
        keywords: ["state validation", "workflow", "transition"]
    },
    {
        name: "Ranking Without Sorting Logic",
        description: "Determine rank without sorting entire dataset",
        examples: ["Find rank of element", "Top K elements without sorting", "Relative ranking logic"],
        keywords: ["rank", "top k", "without sorting"]
    },
    {
        name: "Cumulative Comparison Logic",
        description: "Compare running values against conditions",
        examples: ["Running total exceeds limit", "Cumulative comparison", "Progressive validation"],
        keywords: ["cumulative", "running compare", "progressive"]
    },
    {
        name: "Invariant Maintenance Logic",
        description: "Maintain a condition that must always remain true during execution",
        examples: ["Balance never goes negative", "Running minimum constraint", "Window invariant maintenance"],
        keywords: ["invariant", "always true", "maintain condition"]
    },
    {
        name: "Parity-Based Logic",
        description: "Logic driven by odd/even or parity rules",
        examples: ["Odd-even position behavior", "Parity-based swaps", "Alternate parity grouping"],
        keywords: ["parity", "odd", "even", "alternate"]
    },
    {
        name: "Greedy Validation Logic",
        description: "Validate if greedy choice leads to valid solution",
        examples: ["Can tasks be completed?", "Valid greedy assignment", "Resource allocation feasibility"],
        keywords: ["greedy validation", "feasible", "allocation"]
    },
    {
        name: "Backtracking-Free Enumeration Logic",
        description: "Enumerate combinations without recursion or backtracking",
        examples: ["Iterative subset generation", "Bit-mask based enumeration", "Combination counters"],
        keywords: ["enumeration", "subset", "bitmask"]
    },
    {
        name: "Token Consumption Logic",
        description: "Consume limited resources step by step",
        examples: ["Energy depletion logic", "Credit usage system", "Token-based operations"],
        keywords: ["consume", "resource", "token", "depletion"]
    },
    {
        name: "Checkpoint & Rollback Logic",
        description: "Save state and rollback under conditions (without stack)",
        examples: ["Undo last valid state", "Rollback on failure", "Checkpoint recovery"],
        keywords: ["checkpoint", "rollback", "restore state"]
    },
    {
        name: "Constraint Satisfaction Without Search",
        description: "Satisfy constraints using logic ordering, not brute force",
        examples: ["Arrange values under constraints", "Dependency resolution", "Constraint-based placement"],
        keywords: ["constraint satisfaction", "dependency", "placement"]
    },
    {
        name: "Implicit Ordering Logic",
        description: "Derive order without explicit sorting",
        examples: ["Lexical comparison logic", "Order inference from conditions", "Relative ordering detection"],
        keywords: ["implicit order", "relative ordering"]
    },
    {
        name: "Delayed Evaluation Logic",
        description: "Postpone computation until required",
        examples: ["Lazy accumulation", "Deferred condition checks", "Delayed aggregation"],
        keywords: ["delayed", "lazy", "deferred"]
    },
    {
        name: "One-Pass Multi-Result Logic",
        description: "Compute multiple outputs in a single traversal",
        examples: ["Min, max, sum in one pass", "Multiple counters in one loop", "Simultaneous metrics tracking"],
        keywords: ["one pass", "single traversal", "multi result"]
    },
    {
        name: "Implicit State Encoding Logic",
        description: "Encode state using existing variables",
        examples: ["Sign-based state encoding", "Value-offset encoding", "Index-based state storage"],
        keywords: ["encode state", "implicit state"]
    },
    {
        name: "Temporal Ordering Logic",
        description: "Logic based on time or step order",
        examples: ["First occurrence tracking", "Last valid update wins", "Temporal priority logic"],
        keywords: ["temporal", "order", "first last"]
    },
    {
        name: "Convergence Detection Logic",
        description: "Detect when a process stabilizes",
        examples: ["No-change detection", "Steady state reached", "Convergence condition"],
        keywords: ["convergence", "steady state", "stabilize"]
    },
    {
        name: "Reverse Reasoning Logic",
        description: "Solve by working backwards",
        examples: ["Reverse simulation", "Backward validation", "Target-to-source reasoning"],
        keywords: ["reverse logic", "backward reasoning"]
    },
    {
        name: "Minimal Representation Logic",
        description: "Represent data using smallest form",
        examples: ["Minimal encoding", "Compressed counters", "Symbolic representation"],
        keywords: ["minimal", "compressed", "compact"]
    },
    {
        name: "Monotonic Boundary Tracking Logic",
        description: "Track changing boundaries monotonically",
        examples: ["Expanding/shrinking limits", "Monotonic boundary update", "Dynamic bounds logic"],
        keywords: ["monotonic boundary", "dynamic limits"]
    },
    {
        name: "Eligibility Accumulation Logic",
        description: "Eligibility becomes true only after satisfying multiple conditions over time",
        examples: ["Reward eligibility", "Bonus unlocking logic", "Progress-based qualification"],
        keywords: ["eligibility", "qualification", "unlock"]
    },
    {
        name: "Non-Resettable Counter Logic",
        description: "Counters that only increase and never reset",
        examples: ["Lifetime counters", "Monotonic counters", "Cumulative event tracking"],
        keywords: ["monotonic counter", "lifetime count"]
    },
    {
        name: "Implicit Constraint Enforcement",
        description: "Enforce constraints indirectly without explicit checks",
        examples: ["Bound-safe traversal", "Implicit overflow prevention", "Safe iteration logic"],
        keywords: ["implicit constraint", "safe traversal"]
    },
    {
        name: "Logic Deduction from Partial Data",
        description: "Infer missing values using known constraints",
        examples: ["Find missing value from relations", "Infer unknowns", "Constraint-based deduction"],
        keywords: ["deduction", "infer", "missing logic"]
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
