const LANGUAGE_RULES = {
  c: {
    match: ["c (gcc"],
    instruction: [
      "Use scanf/printf for standard input/output. Dynamic allocation: malloc/free for arrays.",
      "Return only the function body: no signature, no closing brace. Match boilerplate's solve signature exactly.",
      "Do not use interactive prompts. Read strictly from stdin.",
      "Output format must match test cases exactly (e.g. 'true'/'false' or numbers).",
    ].join(" "),
  },

  cpp: {
    match: ["c++", "gcc 13", "gcc 11"],
    instruction: [
      "Use cin/cout for standard input/output.",
      "Do not print prompts.",
      "Do not use interactive input.",
      "Avoid mixing getline with cin unless handled carefully.",
      "Program must contain main() function.",
    ].join(" "),
  },

  java: {
    match: ["java"],
    instruction: [
      "Class name must be public class Main.",
      "Implementation block must be a single solve method: use public static int solve(...) (or appropriate return type) inside Main; do not nest a separate class Solution with solve inside.",
      "Markers HC_IMPLEMENTATION_BLOCK_START/END must wrap the solve method body only (marker line, then method signature line, then body, then closing brace).",
      "Use Scanner(System.in) with nextInt()/next()/hasNext(). Avoid nextLine() after nextInt() unless handled.",
      "Do not print prompts. Output only via System.out.print/println.",
    ].join(" "),
  },

  javascript: {
    match: ["javascript", "node"],
    instruction: [
      "MANDATORY: Use exactly stdin file read style: const fs = require('fs'); const input = fs.readFileSync(0, 'utf8').trim();",
      "ABSOLUTE BAN: Do not use readline, prompts, process.stdin.on('data'), or any interactive input API.",
      "Parse input manually from string.",
      "Output using console.log only.",
      "Do not print prompts.",
    ].join(" "),
  },

  typescript: {
    match: ["typescript"],
    instruction: [
      "Use Node.js standard input (fs.readFileSync).",
      "Do not use interactive input.",
      "Parse input from string.",
      "Output using console.log only.",
      "No prompts.",
    ].join(" "),
  },

  python: {
    match: ["python"],
    instruction: [
      "MANDATORY for Judge0: use sys.stdin for input (e.g. n = int(sys.stdin.readline()), arr = list(map(int, sys.stdin.readline().split()))). Do not use input() so execution is non-interactive.",
      "Implementation block: markers HC_IMPLEMENTATION_BLOCK_START/END must wrap the solve function (marker line, then def solve(...):, then body). Body must use consistent 4-space indent for every line inside solve; mixed indentation causes IndentationError when injected.",
      "Do not use interactive prompts. Output using print only.",
    ].join(" "),
  },

  go: {
    match: ["go"],
    instruction: [
      "Use bufio.NewReader(os.Stdin) with ReadString('\\n') or fmt.Scan. Parse strings with strconv.",
      "Return only the function body: no 'func solve', no signature, no closing brace.",
      "Output using fmt.Println with exact format ('true'/'false' as strings to match test cases).",
      "Do not use interactive prompts. Read strictly from stdin.",
    ].join(" "),
  },

  rust: {
    match: ["rust"],
    instruction: [
      "Use BufRead::lines or read_to_string for stdin. Parse with split_whitespace, parse().",
      "Return only the function body: no 'fn solve', no signature, no closing brace.",
      "Output using println! with exact format. Do not use interactive prompts.",
    ].join(" "),
  },

  kotlin: {
    match: ["kotlin"],
    instruction: [
      "Use readLine()!! or Scanner(System.`in`). readLine() returns String? - use !! or ?: \"\" for stdin.",
      "Return only the function body: no 'fun solve', no signature, no closing brace.",
      "Output using println() with exact expected format (e.g. 'true'/'false' as strings).",
      "Do not print prompts. Parse input from stdin strictly.",
    ].join(" "),
  },

  swift: {
    match: ["swift"],
    instruction: [
      "Use readLine()! or readLine() ?? '' for stdin. Parse with split(separator:), Int()!.",
      "Return only the function body: no 'func solve', no signature, no closing brace.",
      "Output using print(). Do not use interactive prompts.",
    ].join(" "),
  },

  dart: {
    match: ["dart"],
    instruction: [
      "Use stdin.readLineSync()! or stdin.readLineSync() ?? '' for non-null. Handle null safety.",
      "Return only the function body: no 'List<bool> solve', no signature, no closing brace.",
      "Output using print() - exactly 'true' or 'false' per line to match test cases.",
      "Do not use interactive prompts. Parse input strictly from stdin.",
    ].join(" "),
  },

  php: {
    match: ["php"],
    instruction: [
      "Use trim(fgets(STDIN)) in a loop for multiple lines. Parse with explode, intval.",
      "Return only the function body: no 'function solve', no signature, no closing brace.",
      "Output using echo with exact format. Use ($x ? 'true' : 'false') for booleans.",
      "Do not use interactive prompts. PHP tags <?php ?> are in boilerplate.",
    ].join(" "),
  },

  ruby: {
    match: ["ruby"],
    instruction: [
      "Use gets.chomp or gets&.chomp for stdin. Parse with split, map(&:to_i).",
      "Return only the function body: no 'def solve', no signature, no closing 'end'.",
      "Output using puts. Do not print prompts.",
    ].join(" "),
  },

  scala: {
    match: ["scala"],
    instruction: [
      "Use StdIn.readInt(), StdIn.readLine().split(' ').map(_.toInt).",
      "Return only the function body: no 'def solve', no signature, no closing brace. Last expression is return value.",
      "Output using println. Do not use interactive prompts.",
    ].join(" "),
  },

  haskell: {
    match: ["haskell"],
    instruction: [
      "Use getContents or getLine. Parse with lines, words, read. Return pure values, no IO in solve.",
      "Return the RHS of the equation: for 'solve n arr = do' return do-block body; for 'solve n arr = ' return the expression/let-in body.",
      "No 'solve', no '= do', no type signature. Output via putStrLn in main. Return valid JSON.",
    ].join(" "),
  },

  ocaml: {
    match: ["ocaml"],
    instruction: [
      "Use Scanf.scanf '%d\\n' (fun x -> x) or read_line for stdin. Parse with int_of_string.",
      "Return only the expression body for let solve n = ... ;; No 'let solve', no ';;'.",
      "Output using print_int; print_newline() or print_endline(string_of_int x).",
      "Do not print prompts. Read strictly from stdin.",
    ].join(" "),
  },

  r: {
    match: ["r ("],
    instruction: [
      "MANDATORY: Use input_lines <- readLines(file('stdin')) then parse. Do NOT use readline() or scan(what=).",
      "Return only the function body: no 'solve <- function', no signature, no closing brace.",
      "Output: use cat(result, '\\n') or cat(result, fill=TRUE) - ALWAYS add newline for Judge0. print() adds [1] prefix.",
      "For numbers: cat(result, '\\n'). For booleans: cat(ifelse(x, 'true', 'false'), '\\n').",
    ].join(" "),
  },

  octave: {
    match: ["octave"],
    instruction: [
      "Use fscanf(stdin, '%d') for numbers - fscanf returns array so use N(1) if needed for scalar.",
      "Return only the function body: no 'function result = solve', no closing 'end'.",
      "Output using fprintf('%d\\n', output) or disp. Do not print prompts.",
      "Nested functions must be defined before use; Octave allows nested functions.",
    ].join(" "),
  },

  pascal: {
    match: ["pascal"],
    instruction: [
      "Use readln for input. Pascal uses 0-based dynamic arrays. Assign result to function name: solve := value;",
      "Return only the body between begin/end: no 'function solve', no 'begin'/'end;'.",
      "Output via writeln in main. Do not print prompts.",
    ].join(" "),
  },

  lua: {
    match: ["lua"],
    instruction: [
      "Use io.read('*n') for numbers, io.read('*l') for lines. Match boilerplate's input style.",
      "Return only the function body: no 'function solve', no closing 'end'.",
      "Output using print(). Do not print prompts. Read strictly from stdin.",
    ].join(" "),
  },

  prolog: {
    match: ["prolog"],
    instruction: [
      "Use read/1 for input.",
      "Use writeln/1 for output.",
      "No interactive prompts.",
      "Include :- initialization(main).",
    ].join(" "),
  },
};

const findRule = (languageName = "") => {
  const lowered = ` ${String(languageName).toLowerCase()} `;
  return (
    Object.values(LANGUAGE_RULES).find((rule) =>
      rule.match.some((token) => lowered.includes(token)),
    ) || null
  );
};

const getLanguageInstruction = (languageName = "") =>
  findRule(languageName)?.instruction ||
  "Use only stdin/stdout non-interactive I/O compatible with Judge0.";

const buildLanguageInstructionsBlock = (languages = []) =>
  (Array.isArray(languages) ? languages : [])
    .map((lang) => {
      const name = lang.languageName || lang.name || "Unknown";
      return `- ${name}: ${getLanguageInstruction(name)}`;
    })
    .join("\n");

module.exports = {
  getLanguageInstruction,
  buildLanguageInstructionsBlock,
};
