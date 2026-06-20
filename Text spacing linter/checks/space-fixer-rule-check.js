const fs = require("fs");
const vm = require("vm");

const codePath = "outputs/space-fixer/code.js";
const code = fs.readFileSync(codePath, "utf8");

const sandbox = {
  __html__: "",
  console,
  Set,
  Array,
  Boolean,
  Error,
  JSON,
  Math,
  Promise,
  RegExp,
  String,
  figma: {
    mixed: Symbol("mixed"),
    showUI() {},
    notify() {},
    loadAllPagesAsync: async () => {},
    loadFontAsync: async () => {},
    getNodeByIdAsync: async () => null,
    setCurrentPageAsync: async () => {},
    clientStorage: {
      getAsync: async () => null,
      setAsync: async () => {}
    },
    root: {
      children: [],
      getSharedPluginData: () => "",
      setSharedPluginData() {}
    },
    currentPage: {
      id: "page",
      name: "Page",
      selection: [],
      selectedTextRange: null
    },
    viewport: {
      scrollAndZoomIntoView() {}
    },
    ui: {
      onmessage: null,
      postMessage() {},
      resize() {}
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: codePath });

const defaultOptions = {
  addMissingSpaces: true,
  addCjkLatinSpaces: true,
  addCjkNumberSpaces: true,
  excludeScriptSpaces: true,
  addScriptSpaces: false,
  keepScriptSpacesTight: true,
  ignoreScripts: true,
  ignoreHidden: true,
  removeExtraSpaces: true,
  trimLineSpaces: true,
  removeCjkSpaces: true,
  removeCjkPunctuationSpaces: true,
  removeScriptSpaces: true,
  normalizeLatinSpaces: true,
  normalizeCjkAsciiSpaces: true,
  normalizeLatinNumberSpaces: true,
  normalizeNumberSpaces: true,
  removeNumberSpaces: false
};

function fix(text, options = {}) {
  return sandbox.fixText(text, [], [], { ...defaultOptions, ...options });
}

const cases = [
  ["missing cjk latin right", "中文A", "中文 A"],
  ["missing cjk latin left", "A中文", "A 中文"],
  ["missing cjk number right", "中文1", "中文 1"],
  ["missing cjk number left", "1中文", "1 中文"],
  ["trim line edges", "  第一行  \n　第二行　", "第一行\n第二行"],
  ["remove cjk gap", "中文  中文", "中文中文"],
  ["keep number gap by default", "12 34", "12 34"],
  ["normalize repeated number gap by default", "12  34", "12 34"],
  ["remove number gap when enabled", "12 34", "1234", { removeNumberSpaces: true }],
  ["normalize cjk latin gap", "中文  English", "中文 English"],
  ["normalize cjk number gap", "中文  123", "中文 123"],
  ["remove cjk punctuation gap", "中文  ，说明", "中文，说明"],
  ["normalize latin gap", "Hello  World", "Hello World"],
  ["normalize latin number gap", "Version  2", "Version 2"],
  ["keep single latin gap", "Hello World", "Hello World"],
  ["keep line break", "中文\nEnglish", "中文\nEnglish"]
];

let failed = 0;
for (const [name, input, expected, options] of cases) {
  const actual = fix(input, options);
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failed += 1;
    console.log(`  input:    ${JSON.stringify(input)}`);
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

const scriptIncludeOptions = sandbox.getScanOptions({
  excludeScriptSpaces: false
});
if (
  scriptIncludeOptions.excludeScriptSpaces !== false ||
  scriptIncludeOptions.addScriptSpaces !== true ||
  scriptIncludeOptions.ignoreScripts !== false ||
  scriptIncludeOptions.removeScriptSpaces !== false
) {
  failed += 1;
  console.log("FAIL script include setting enables missing script spaces and disables cleanup");
} else {
  console.log("PASS script include setting enables missing script spaces and disables cleanup");
}

const scriptDefaultOptions = sandbox.getScanOptions({});
if (
  scriptDefaultOptions.excludeScriptSpaces !== true ||
  scriptDefaultOptions.addScriptSpaces !== false ||
  scriptDefaultOptions.ignoreScripts !== true ||
  scriptDefaultOptions.removeScriptSpaces !== true
) {
  failed += 1;
  console.log("FAIL script defaults ignore missing script spaces and enable cleanup");
} else {
  console.log("PASS script defaults ignore missing script spaces and enable cleanup");
}

const scriptCleanupOptions = sandbox.getScanOptions({
  excludeScriptSpaces: true,
  removeScriptSpaces: false
});
if (
  scriptCleanupOptions.excludeScriptSpaces !== true ||
  scriptCleanupOptions.addScriptSpaces !== false ||
  scriptCleanupOptions.ignoreScripts !== true ||
  scriptCleanupOptions.removeScriptSpaces !== false
) {
  failed += 1;
  console.log("FAIL script cleanup can be disabled independently from exclusion");
} else {
  console.log("PASS script cleanup can be disabled independently from exclusion");
}

const scriptAddDisabledOptions = sandbox.getScanOptions({
  addMissingSpaces: false,
  excludeScriptSpaces: false,
  removeScriptSpaces: false
});
if (
  scriptAddDisabledOptions.addScriptSpaces !== false ||
  scriptAddDisabledOptions.ignoreScripts !== false ||
  scriptAddDisabledOptions.removeScriptSpaces !== false
) {
  failed += 1;
  console.log("FAIL script exclusion is independent from missing-space master");
} else {
  console.log("PASS script exclusion is independent from missing-space master");
}

const scriptText = "佩戴¹";
const scriptRanges = [{ start: 2, end: 3 }];
const scriptDefault = sandbox.fixText(scriptText, [], scriptRanges, defaultOptions);
const scriptLoose = sandbox.fixText(scriptText, [], scriptRanges, {
  ...defaultOptions,
  excludeScriptSpaces: false,
  addScriptSpaces: true,
  keepScriptSpacesTight: false,
  ignoreScripts: false,
  removeScriptSpaces: false
});
const scriptCleanupOptionsForFix = {
  ...defaultOptions,
  keepScriptSpacesTight: true,
  ignoreScripts: true,
  removeScriptSpaces: true
};
const scriptCleanup = sandbox.fixText("佩戴 ¹", [], [{ start: 3, end: 4 }], scriptCleanupOptionsForFix);
const scriptLatinCleanup = sandbox.fixText("Pro ¹", [], [{ start: 4, end: 5 }], scriptCleanupOptionsForFix);
const scriptCleanupNoAdd = sandbox.fixText(scriptText, [], scriptRanges, scriptCleanupOptionsForFix);
const scriptInnerCleanup = sandbox.fixText("¹ ²", [], [
  { start: 0, end: 1 },
  { start: 2, end: 3 }
], scriptCleanupOptionsForFix);
if (
  scriptDefault !== "佩戴¹" ||
  scriptLoose !== "佩戴 ¹" ||
  scriptCleanup !== "佩戴¹" ||
  scriptLatinCleanup !== "Pro¹" ||
  scriptCleanupNoAdd !== "佩戴¹" ||
  scriptInnerCleanup !== "¹²"
) {
  failed += 1;
  console.log("FAIL script spacing policy");
  console.log(JSON.stringify({ scriptDefault, scriptLoose, scriptCleanup, scriptLatinCleanup, scriptCleanupNoAdd, scriptInnerCleanup }, null, 2));
} else {
  console.log("PASS script spacing policy");
}

const preview = sandbox.buildFixAllPreview([
  {
    nodeId: "a",
    type: "missing-space",
    pair: "文¹"
  },
  {
    nodeId: "a",
    type: "repeated-extra-space",
    beforeDifference: "12  34"
  }
]);
if (
  preview.breakdown.missingScript !== 1 ||
  preview.breakdown.missingCjkNumber !== 0 ||
  preview.breakdown.extraNumber !== 1 ||
  preview.breakdown.extraLatinNumber !== 0
) {
  failed += 1;
  console.log("FAIL preview breakdown distinguishes scripts and digit gaps");
  console.log(JSON.stringify(preview.breakdown, null, 2));
} else {
  console.log("PASS preview breakdown distinguishes scripts and digit gaps");
}

if (failed) process.exit(1);
