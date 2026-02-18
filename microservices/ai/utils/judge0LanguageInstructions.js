const LANGUAGE_RULES = {
  c: {
    match: ["c (gcc"],
    instruction: [
      "Use scanf/printf for standard input/output.",
      "Do not use interactive prompts.",
      "Read strictly from stdin.",
      "Do not assume extra newlines.",
      "Program must contain main() function.",
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
      "Implementation block: markers HC_IMPLEMENTATION_BLOCK_START/END must wrap the solve function (marker line, then def solve(...):, then body). Use 4-space indent for body.",
      "Do not use interactive prompts. Output using print only.",
    ].join(" "),
  },

  go: {
    match: ["go"],
    instruction: [
      "Use fmt.Scan/fmt.Fscan/bufio.NewScanner(os.Stdin).",
      "Do not use interactive prompts.",
      "Read strictly from stdin.",
      "Output using fmt.Println.",
    ].join(" "),
  },

  rust: {
    match: ["rust"],
    instruction: [
      "Use std::io::stdin().read_line or read_to_string.",
      "Do not use interactive prompts.",
      "Parse input safely.",
      "Output using println! only.",
    ].join(" "),
  },

  kotlin: {
    match: ["kotlin"],
    instruction: [
      "Use readLine() or Scanner(System.`in`).",
      "Do not print prompts.",
      "Avoid interactive input.",
      "Output using println.",
    ].join(" "),
  },

  swift: {
    match: ["swift"],
    instruction: [
      "Use readLine() for stdin.",
      "Do not use interactive prompts.",
      "Parse input safely.",
      "Output using print().",
    ].join(" "),
  },

  dart: {
    match: ["dart"],
    instruction: [
      "Use stdin.readLineSync().",
      "Do not use interactive prompts.",
      "Handle null safety.",
      "Output using print().",
    ].join(" "),
  },

  php: {
    match: ["php"],
    instruction: [
      "Use fgets(STDIN) and trim().",
      "Do not use interactive prompts.",
      "Parse input manually.",
      "Output using echo.",
    ].join(" "),
  },

  ruby: {
    match: ["ruby"],
    instruction: [
      "Use gets.chomp for input.",
      "Do not print prompts.",
      "Avoid interactive input.",
      "Output using puts.",
    ].join(" "),
  },

  scala: {
    match: ["scala"],
    instruction: [
      "Use scala.io.StdIn.readLine/readInt.",
      "Do not use interactive prompts.",
      "Output using println.",
    ].join(" "),
  },

  haskell: {
    match: ["haskell"],
    instruction: [
      "Use getLine or getContents for input.",
      "Do not print prompts.",
      "Parse input safely.",
      "Output using print/putStrLn.",
    ].join(" "),
  },

  ocaml: {
    match: ["ocaml"],
    instruction: [
      "Use Scanf.scanf or read_line.",
      "Do not print prompts.",
      "Output using print_endline/print_int.",
    ].join(" "),
  },

  r: {
    match: ["r ("],
    instruction: [
      "Use readLines(file('stdin')).",
      "Do not print prompts.",
      "Output using cat() only.",
    ].join(" "),
  },

  octave: {
    match: ["octave"],
    instruction: [
      "Use input() or fscanf(stdin).",
      "Do not print prompts.",
      "Output using fprintf or disp.",
    ].join(" "),
  },

  pascal: {
    match: ["pascal"],
    instruction: [
      "Use readln() for input.",
      "Do not print prompts.",
      "Output using writeln().",
      "Program must end with end.",
    ].join(" "),
  },

  lua: {
    match: ["lua"],
    instruction: [
      "Use io.read().",
      "Do not print prompts.",
      "Output using print().",
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
