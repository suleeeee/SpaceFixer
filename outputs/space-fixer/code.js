const LEGACY_BUILT_IN_TERMS = [
  "iPhone",
  "iPad",
  "macOS",
  "iOS",
  "Android",
  "GitHub",
  "ChatGPT",
  "OpenAI",
  "Figma",
  "WeChat",
  "QQ",
  "WiFi",
  "API",
  "SDK",
  "URL",
  "UI",
  "UX",
  "B2B",
  "B2C",
  "2FA"
];

const LEGACY_STORAGE_KEY = "text-spacing-linter-whitelist";
const PERSONAL_STORAGE_KEY = "text-spacing-linter-personal-whitelist-v2";
const FILE_STORAGE_KEY = "text-spacing-linter-file-whitelist-v2";
const STORAGE_NAMESPACE = "textSpacingLinter";
const UI_WIDTH = 420;
const UI_COMPACT_HEIGHT = 520;
const UI_WORKSPACE_HEIGHT = 760;

figma.showUI(__html__, { width: UI_WIDTH, height: UI_COMPACT_HEIGHT, themeColors: true });

let personalWhitelist = [];
let fileWhitelist = [];
let lastIssues = [];
let lastScanStats = {
  textNodeCount: 0
};
let hasActiveTextRange = false;
let scanOptions = {
  addMissingSpaces: true,
  addCjkLatinSpaces: true,
  addCjkNumberSpaces: true,
  excludeScriptSpaces: true,
  addScriptSpaces: false,
  keepScriptSpacesTight: true,
  ignoreScripts: true,
  ignoreHidden: true,
  removeExtraSpaces: false,
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
const whitelistSaveQueues = {
  personal: Promise.resolve(),
  file: Promise.resolve()
};

init();

async function init() {
  try {
    const saved = await loadSavedWhitelists();
    personalWhitelist = saved.personal;
    fileWhitelist = saved.file;
  } catch (error) {
    personalWhitelist = [];
    fileWhitelist = [];
    figma.notify("术语规则读取失败，已使用空规则启动");
  }

  postState();
}

figma.ui.onmessage = async (message) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "scan") {
    try {
      await clearActiveHighlight();
      scanOptions = getScanOptions(message);
      lastIssues = await scanTextNodes(message.scope, scanOptions);
      resizePlugin(lastIssues.length ? UI_WORKSPACE_HEIGHT : UI_COMPACT_HEIGHT);
      postIssues(lastIssues, {
        status: "success",
        scope: message.scope,
        scannedNodeCount: lastScanStats.textNodeCount,
        emptyReason: message.scope === "selection" && figma.currentPage.selection.length === 0
          ? "no-selection"
          : ""
      });
      figma.notify(lastIssues.length ? `找到 ${lastIssues.length} 处排版问题` : "没有发现排版问题");
    } catch (error) {
      postIssues(lastIssues, {
        status: "failure",
        message: "检查失败，请重试。"
      });
      figma.notify("检查失败，请重试");
    }
    return;
  }

  if (message.type === "select-issue") {
    const issue = lastIssues.find((item) => item.id === message.id);
    if (issue) {
      const node = await figma.getNodeByIdAsync(issue.nodeId);
      if (node && node.type === "TEXT") {
        const page = await figma.getNodeByIdAsync(issue.pageId);
        if (page && page.type === "PAGE" && page.id !== figma.currentPage.id) {
          await figma.setCurrentPageAsync(page);
        }
        await highlightIssue(node, issue);
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    }
    return;
  }

  if (message.type === "fix-one") {
    const issue = lastIssues.find((item) => item.id === message.id);
    if (!issue) {
      postIssues(lastIssues, {
        status: "failure",
        message: "这条问题已失效，请重新检查。"
      });
      figma.notify("这条问题已失效，请重新检查");
      return;
    }
    await clearActiveHighlight();
    scanOptions = getScanOptions(message);
    const result = await fixIssue(issue, scanOptions);
    if (result.fixed) {
      lastIssues = await refreshIssuesForNode(lastIssues, issue.nodeId, scanOptions);
      postIssues(lastIssues, {
        status: "success",
        message: "已修复当前问题。"
      });
    } else {
      postIssues(lastIssues, {
        status: "failure",
        message: "未能修复当前问题，请重新检查。"
      });
    }
    return;
  }

  if (message.type === "preview-all") {
    try {
      await clearActiveHighlight();
      resizePlugin(UI_WORKSPACE_HEIGHT);
      scanOptions = getScanOptions(message);
      lastIssues = await scanTextNodes(message.scope, scanOptions);
      const preview = buildFixAllPreview(lastIssues);
      postIssues(lastIssues, {
        status: "success",
        scope: message.scope,
        scannedNodeCount: lastScanStats.textNodeCount
      });
      postFixAllPreview(preview);
    } catch (error) {
      figma.ui.postMessage({
        type: "fix-all-preview-failed",
        message: "无法生成修复预览，请重试。"
      });
      figma.notify("无法生成修复预览，请重试");
    }
    return;
  }

  if (message.type === "confirm-fix-all") {
    try {
      await clearActiveHighlight();
      scanOptions = getScanOptions(message);
      lastIssues = await scanTextNodes(message.scope, scanOptions);
      const nodeIds = Array.from(new Set(lastIssues.map((issue) => issue.nodeId)));
      const result = await fixNodes(nodeIds, scanOptions);
      lastIssues = await scanTextNodes(message.scope, scanOptions);
      postIssues(lastIssues, {
        status: "success",
        scope: message.scope,
        scannedNodeCount: lastScanStats.textNodeCount,
        message: result.fixed ? `已修复 ${result.fixed} 个文本图层。` : "没有可修复的文本图层。"
      });
      figma.notify(result.fixed ? `已修复 ${result.fixed} 个文本图层` : "没有可修复的文本图层");
    } catch (error) {
      postIssues(lastIssues, {
        status: "failure",
        message: "全部修复失败，请重新检查后再试。"
      });
      figma.notify("全部修复失败，请重新检查后再试");
    }
    return;
  }

  if (message.type === "resize-ui") {
    resizePlugin(message.expanded ? UI_WORKSPACE_HEIGHT : UI_COMPACT_HEIGHT);
    return;
  }

  if (message.type === "save-whitelist") {
    await clearActiveHighlight();
    try {
      const target = message.target === "personal" ? "personal" : "file";
      const items = normalizeWhitelist(message.items);
      await queueWhitelistSave(target, items);
      if (target === "personal") {
        personalWhitelist = items;
      } else {
        fileWhitelist = items;
      }
      postWhitelistSaved(message.requestId, target);
    } catch (error) {
      postWhitelistSaveFailed(message.requestId, message.target);
      figma.notify("术语规则保存失败，请重试");
    }
    return;
  }

  if (message.type === "clear-whitelist") {
    await clearActiveHighlight();
    try {
      const target = message.target === "personal" ? "personal" : "file";
      await queueWhitelistSave(target, []);
      if (target === "personal") {
        personalWhitelist = [];
      } else {
        fileWhitelist = [];
      }
      postWhitelistSaved(message.requestId, target);
      figma.notify(target === "file" ? "当前文件共享术语规则已清空" : "个人术语规则已清空");
    } catch (error) {
      postWhitelistSaveFailed(message.requestId, message.target);
      figma.notify("术语规则清空失败，请重试");
    }
    return;
  }

};

function resizePlugin(height) {
  try {
    figma.ui.resize(UI_WIDTH, height);
  } catch (error) {
    // Older Figma shells may not expose dynamic UI resizing.
  }
}

function getScanOptions(message) {
  const excludeScriptSpaces = Object.prototype.hasOwnProperty.call(message, "excludeScriptSpaces")
    ? message.excludeScriptSpaces !== false
    : message.addScriptSpaces === true
      ? false
      : message.ignoreScripts !== false;
  const addScriptSpaces = message.addMissingSpaces !== false && !excludeScriptSpaces;
  const keepScriptSpacesTight = excludeScriptSpaces;
  const removeScriptSpaces = excludeScriptSpaces && message.removeScriptSpaces !== false;
  const ignoreScripts = excludeScriptSpaces;
  return {
    addMissingSpaces: message.addMissingSpaces !== false,
    addCjkLatinSpaces: message.addCjkLatinSpaces !== false,
    addCjkNumberSpaces: message.addCjkNumberSpaces !== false,
    excludeScriptSpaces,
    addScriptSpaces,
    keepScriptSpacesTight,
    ignoreScripts,
    ignoreHidden: message.ignoreHidden !== false,
    removeExtraSpaces: message.removeExtraSpaces === true,
    trimLineSpaces: message.trimLineSpaces !== false,
    removeCjkSpaces: message.removeCjkSpaces !== false,
    removeCjkPunctuationSpaces: message.removeCjkPunctuationSpaces !== false,
    removeScriptSpaces,
    normalizeLatinSpaces: message.normalizeLatinSpaces !== false,
    normalizeCjkAsciiSpaces: message.normalizeCjkAsciiSpaces !== false,
    normalizeLatinNumberSpaces: message.normalizeLatinNumberSpaces !== false,
    normalizeNumberSpaces: message.normalizeNumberSpaces !== false,
    removeNumberSpaces: message.removeNumberSpaces === true
  };
}

async function loadSavedWhitelists() {
  let personal = null;
  let file = null;
  let legacyPersonal = null;

  try {
    const storedPersonal = await figma.clientStorage.getAsync(PERSONAL_STORAGE_KEY);
    if (Array.isArray(storedPersonal)) personal = normalizeWhitelist(storedPersonal);
    const storedLegacy = await figma.clientStorage.getAsync(LEGACY_STORAGE_KEY);
    if (Array.isArray(storedLegacy)) {
      legacyPersonal = normalizeWhitelist(storedLegacy.filter((item) => !LEGACY_BUILT_IN_TERMS.includes(item)));
    }
  } catch (error) {
    personal = null;
  }

  try {
    const storedFile = figma.root.getSharedPluginData(STORAGE_NAMESPACE, FILE_STORAGE_KEY);
    if (storedFile) {
      const parsed = JSON.parse(storedFile);
      if (Array.isArray(parsed)) file = normalizeWhitelist(parsed);
    }
  } catch (error) {
    file = null;
  }

  if (file === null) {
    try {
      const legacyFile = figma.root.getSharedPluginData(STORAGE_NAMESPACE, LEGACY_STORAGE_KEY);
      if (legacyFile) {
        const parsed = JSON.parse(legacyFile);
        if (Array.isArray(parsed)) {
          file = normalizeWhitelist(parsed.filter((item) => !LEGACY_BUILT_IN_TERMS.includes(item)));
          await saveWhitelist("file", file);
        }
      }
    } catch (error) {
      file = null;
    }
  }

  if (personal === null && file === null && legacyPersonal) {
    personal = legacyPersonal;
    await saveWhitelist("personal", personal);
  }

  return {
    personal: personal || [],
    file: file || []
  };
}

async function saveWhitelist(target, items) {
  if (target === "personal") {
    await figma.clientStorage.setAsync(PERSONAL_STORAGE_KEY, items);
    return;
  }

  figma.root.setSharedPluginData(STORAGE_NAMESPACE, FILE_STORAGE_KEY, JSON.stringify(items));
}

function queueWhitelistSave(target, items) {
  const previous = whitelistSaveQueues[target];
  const pending = previous.then(
    () => saveWhitelist(target, items),
    () => saveWhitelist(target, items)
  );
  whitelistSaveQueues[target] = pending.catch(() => {});
  return pending;
}

function getEffectiveWhitelist() {
  return normalizeWhitelist(fileWhitelist.concat(personalWhitelist));
}

function postState() {
  figma.ui.postMessage({
    type: "state",
    fileWhitelist,
    personalWhitelist,
    selectionCount: figma.currentPage.selection.length
  });
}

function postIssues(issues, state) {
  figma.ui.postMessage({
    type: "issues",
    issues,
    selectionCount: figma.currentPage.selection.length,
    status: state && state.status ? state.status : "",
    message: state && state.message ? state.message : "",
    scope: state && state.scope ? state.scope : "",
    scannedNodeCount: state && typeof state.scannedNodeCount === "number"
      ? state.scannedNodeCount
      : 0,
    emptyReason: state && state.emptyReason ? state.emptyReason : ""
  });
}

function postWhitelistSaved(requestId, target) {
  figma.ui.postMessage({
    type: "whitelist-saved",
    requestId,
    target,
    fileWhitelist,
    personalWhitelist,
    selectionCount: figma.currentPage.selection.length
  });
}

function postWhitelistSaveFailed(requestId, target) {
  figma.ui.postMessage({
    type: "whitelist-save-failed",
    requestId,
    target,
    fileWhitelist,
    personalWhitelist,
    selectionCount: figma.currentPage.selection.length
  });
}

function postFixAllPreview(preview) {
  figma.ui.postMessage({
    type: "fix-all-preview",
    preview
  });
}

function buildFixAllPreview(issues) {
  const nodeCount = new Set(issues.map((issue) => issue.nodeId)).size;
  const breakdown = {
    missingCjkLatin: 0,
    missingCjkNumber: 0,
    missingScript: 0,
    extraLineEdges: 0,
    extraCjk: 0,
    extraCjkPunctuation: 0,
    extraScript: 0,
    extraCjkLatin: 0,
    extraCjkNumber: 0,
    extraLatin: 0,
    extraLatinNumber: 0,
    extraNumber: 0
  };

  for (const issue of issues) {
    if (issue.type === "missing-space") {
      const left = issue.pair && issue.pair[0];
      const right = issue.pair && issue.pair[1];
      const ascii = isCjk(left) ? right : left;
      if (isScriptNumberChar(ascii)) {
        breakdown.missingScript += 1;
      } else if (isAsciiDigit(ascii)) {
        breakdown.missingCjkNumber += 1;
      } else {
        breakdown.missingCjkLatin += 1;
      }
      continue;
    }

    if (issue.type === "line-edge-extra-space") {
      breakdown.extraLineEdges += 1;
    } else if (issue.type === "cjk-extra-space") {
      breakdown.extraCjk += 1;
    } else if (issue.type === "cjk-punctuation-extra-space") {
      breakdown.extraCjkPunctuation += 1;
    } else if (issue.type === "script-extra-space") {
      breakdown.extraScript += 1;
    } else if (issue.type === "number-extra-space") {
      breakdown.extraNumber += 1;
    } else if (issue.type === "repeated-extra-space") {
      const boundary = issue.beforeDifference || issue.pair || "";
      const left = boundary[0];
      const right = boundary[boundary.length - 1];
      const hasCjk = isCjk(left) || isCjk(right);
      const hasNumber = isAsciiDigit(left) || isAsciiDigit(right);
      if (hasCjk && hasNumber) {
        breakdown.extraCjkNumber += 1;
      } else if (hasCjk) {
        breakdown.extraCjkLatin += 1;
      } else if (isAsciiLetter(left) && isAsciiLetter(right)) {
        breakdown.extraLatin += 1;
      } else if (isAsciiDigit(left) && isAsciiDigit(right)) {
        breakdown.extraNumber += 1;
      } else {
        breakdown.extraLatinNumber += 1;
      }
    }
  }

  const missingSpaces = breakdown.missingCjkLatin +
    breakdown.missingCjkNumber +
    breakdown.missingScript;
  const extraSpaces = breakdown.extraLineEdges +
    breakdown.extraCjk +
    breakdown.extraCjkPunctuation +
    breakdown.extraScript +
    breakdown.extraCjkLatin +
    breakdown.extraCjkNumber +
    breakdown.extraLatin +
    breakdown.extraLatinNumber +
    breakdown.extraNumber;
  const termFormatIssues = issues.filter((issue) => issue.type === "term-format").length;

  return {
    valid: issues.length > 0,
    nodeCount,
    issueCount: missingSpaces + extraSpaces + termFormatIssues,
    missingSpaces,
    extraSpaces,
    termFormatIssues,
    breakdown
  };
}

async function highlightIssue(node, issue) {
  await clearActiveHighlight();

  const start = issue.start;
  const end = Math.min(issue.end, node.characters.length);
  if (start < 0 || end <= start) return;

  try {
    figma.currentPage.selection = [node];
    figma.currentPage.selectedTextRange = { node, start, end };
    hasActiveTextRange = true;
  } catch (error) {
    figma.notify(`无法选中「${node.name}」中的问题字符`);
  }
}

async function clearActiveHighlight() {
  if (!hasActiveTextRange) return;
  hasActiveTextRange = false;

  try {
    figma.currentPage.selectedTextRange = null;
  } catch (error) {
    // The user may have changed pages or edited the text selection.
  }
}

async function scanTextNodes(scope, options = scanOptions) {
  const nodes = await getTextNodes(scope, options);
  const issues = [];
  const termRules = getEffectiveWhitelist();

  for (const node of nodes) {
    issues.push.apply(issues, getIssuesForTextNode(node, options, termRules));
  }

  lastScanStats = {
    textNodeCount: nodes.length
  };
  return issues;
}

function getIssuesForTextNode(node, options = scanOptions, termRules = getEffectiveWhitelist()) {
  if (!node || node.type !== "TEXT") return [];
  if (options.ignoreHidden && !isEffectivelyVisible(node)) return [];

  const text = node.characters;
  const page = getPageForNode(node);
  const scriptRanges = getIgnoredScriptRanges(node, true);
  const matches = findSpacingIssues(text, termRules, scriptRanges, options);

  return matches.map((match) => {
    const start = Math.max(0, match.index - 18);
    const end = Math.min(text.length, match.index + 22);
    const excerpt = `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
    const difference = getIssueDifference(text, match);

    return {
      id: `${node.id}:${match.type}:${match.index}`,
      nodeId: node.id,
      nodeName: node.name,
      pageId: page ? page.id : figma.currentPage.id,
      pageName: page ? page.name : figma.currentPage.name,
      type: match.type,
      index: match.index,
      start: match.start,
      end: match.end,
      pair: match.pair,
      term: match.term,
      actual: match.actual,
      expected: match.expected,
      beforeDifference: difference.before,
      afterDifference: difference.after,
      excerpt
    };
  });
}

function getIssueDifference(text, issue) {
  if (issue.type === "term-format") {
    return {
      before: text.slice(issue.start, issue.end),
      after: issue.expected
    };
  }

  if (isExtraSpaceIssue(issue.type)) {
    return {
      before: issue.beforeDifference || text.slice(issue.start - 1, issue.end),
      after: issue.afterDifference || `${text.slice(issue.start - 1, issue.start)}${text.slice(issue.end)}`
    };
  }

  return {
    before: issue.pair,
    after: `${issue.pair[0]} ${issue.pair[1]}`
  };
}

async function refreshIssuesForNode(issues, nodeId, options = scanOptions) {
  const node = await figma.getNodeByIdAsync(nodeId);
  const refreshed = getIssuesForTextNode(node, options);
  const output = [];
  let inserted = false;

  for (const issue of issues) {
    if (issue.nodeId !== nodeId) {
      output.push(issue);
      continue;
    }
    if (!inserted) {
      output.push.apply(output, refreshed);
      inserted = true;
    }
  }

  if (!inserted) output.push.apply(output, refreshed);
  return output;
}

async function getTextNodes(scope, options = scanOptions) {
  let roots;

  if (scope === "document") {
    await figma.loadAllPagesAsync();
    roots = figma.root.children;
  } else if (scope === "selection") {
    roots = figma.currentPage.selection;
  } else {
    roots = [figma.currentPage];
  }

  const nodes = [];

  for (const root of roots) {
    if (root.type === "TEXT" && shouldIncludeTextNode(root, options)) {
      nodes.push(root);
    }

    if ("findAll" in root) {
      nodes.push.apply(nodes, root.findAll((node) => node.type === "TEXT" && shouldIncludeTextNode(node, options)));
    }
  }

  return Array.from(new Map(nodes.map((node) => [node.id, node])).values());
}

function shouldIncludeTextNode(node, options) {
  return !options.ignoreHidden || isEffectivelyVisible(node);
}

function isEffectivelyVisible(node) {
  let current = node;

  while (current && current.type !== "DOCUMENT") {
    if ("visible" in current && current.visible === false) {
      return false;
    }
    current = current.parent;
  }

  return true;
}

function getPageForNode(node) {
  let current = node;

  while (current) {
    if (current.type === "PAGE") return current;
    current = current.parent;
  }

  return null;
}

async function fixNodes(nodeIds, options = scanOptions) {
  let fixed = 0;
  const whitelist = getEffectiveWhitelist();

  for (const nodeId of nodeIds) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== "TEXT") continue;
    if (options.ignoreHidden && !isEffectivelyVisible(node)) continue;

    const scriptRanges = getIgnoredScriptRanges(node, true);
    const issues = findSpacingIssues(node.characters, whitelist, scriptRanges, options);
    if (!issues.length) continue;

    try {
      await loadTextNodeFonts(node);
      if (applyIssuesToTextNode(node, issues)) fixed += 1;
    } catch (error) {
      figma.notify(`无法修复「${node.name}」：字体未能加载或文本不可编辑`);
    }
  }

  return { fixed };
}

function applyIssuesToText(text, issues) {
  let output = text;
  const sortedIssues = issues.slice().sort((a, b) => b.start - a.start || b.end - a.end);

  for (const issue of sortedIssues) {
    if (issue.type === "term-format") {
      const value = output.slice(issue.start, issue.end);
      if (value === issue.actual) {
        output = `${output.slice(0, issue.start)}${issue.expected}${output.slice(issue.end)}`;
      }
      continue;
    }

    if (isExtraSpaceIssue(issue.type)) {
      const value = output.slice(issue.start, issue.end);
      if (value === issue.actual) {
        output = `${output.slice(0, issue.start)}${issue.expected || ""}${output.slice(issue.end)}`;
      }
      continue;
    }

    const left = output[issue.index];
    const right = output[issue.index + 1];
    if (left && right && `${left}${right}` === issue.pair && needsSpace(left, right)) {
      output = `${output.slice(0, issue.index + 1)} ${output.slice(issue.index + 1)}`;
    }
  }

  return output;
}

async function fixIssue(issue, options = scanOptions) {
  const node = await figma.getNodeByIdAsync(issue.nodeId);
  if (!node || node.type !== "TEXT") return { fixed: 0 };
  if (options.ignoreHidden && !isEffectivelyVisible(node)) {
    figma.notify("当前已开启跳过隐藏图层，这一处无需修复");
    return { fixed: 0 };
  }

  if (issue.type === "term-format") {
    return fixTermFormatIssue(node, issue);
  }

  if (isExtraSpaceIssue(issue.type)) {
    return fixExtraSpaceIssue(node, issue);
  }

  return fixMissingSpaceIssue(node, issue, options);
}

async function fixMissingSpaceIssue(node, issue, options = scanOptions) {
  const index = issue.index;
  const left = node.characters[index];
  const right = node.characters[index + 1];

  if (isIgnoredScriptPair(node, index, index + 1, options.ignoreScripts)) {
    figma.notify("当前已开启忽略角标，这一处无需新增空格");
    return { fixed: 0 };
  }

  if (!left || !right || `${left}${right}` !== issue.pair || !needsSpace(left, right)) {
    figma.notify("这条问题可能已经被修改，请重新检查");
    return { fixed: 0 };
  }

  try {
    await loadTextNodeFonts(node);
    node.insertCharacters(index + 1, " ", "BEFORE");
    figma.notify("已修复当前这一处");
    return { fixed: 1 };
  } catch (error) {
    figma.notify(`无法修复「${node.name}」：字体未能加载或文本不可编辑`);
    return { fixed: 0 };
  }
}

async function fixTermFormatIssue(node, issue) {
  const value = node.characters.slice(issue.start, issue.end);

  if (!value || value !== issue.actual) {
    figma.notify("这条术语格式问题可能已经被修改，请重新检查");
    return { fixed: 0 };
  }

  try {
    await loadTextNodeFonts(node);
    const changed = applyTermFormatIssueToTextNode(node, issue);
    if (!changed) {
      figma.notify("这条术语格式问题可能已经被修改，请重新检查");
      return { fixed: 0 };
    }
    figma.notify("已按术语规则修复格式");
    return { fixed: 1 };
  } catch (error) {
    figma.notify(`无法修复「${node.name}」：字体未能加载或文本不可编辑`);
    return { fixed: 0 };
  }
}

async function fixExtraSpaceIssue(node, issue) {
  if (issue.start < 0 || issue.end <= issue.start) {
    figma.notify("这条问题可能已经被修改，请重新检查");
    return { fixed: 0 };
  }

  const contextStart = Math.max(0, issue.start - 1);
  const contextEnd = Math.min(node.characters.length, issue.end + 1);
  const currentBoundary = node.characters.slice(contextStart, contextEnd);
  if (
    node.characters.slice(issue.start, issue.end) !== issue.actual ||
    currentBoundary !== issue.beforeDifference
  ) {
    figma.notify("这条问题可能已经被修改，请重新检查");
    return { fixed: 0 };
  }

  try {
    await loadTextNodeFonts(node);
    node.deleteCharacters(issue.start, issue.end);
    if (issue.expected) {
      node.insertCharacters(issue.start, issue.expected, "BEFORE");
    }
    figma.notify(getExtraSpaceFixMessage(issue.type));
    return { fixed: 1 };
  } catch (error) {
    figma.notify(`无法修复「${node.name}」：字体未能加载或文本不可编辑`);
    return { fixed: 0 };
  }
}

function applyIssuesToTextNode(node, issues) {
  let changed = false;
  const sortedIssues = issues.slice().sort((a, b) => b.start - a.start || b.end - a.end);

  for (const issue of sortedIssues) {
    if (issue.type === "term-format") {
      if (applyTermFormatIssueToTextNode(node, issue)) changed = true;
      continue;
    }

    if (isExtraSpaceIssue(issue.type)) {
      if (node.characters.slice(issue.start, issue.end) === issue.actual) {
        node.deleteCharacters(issue.start, issue.end);
        if (issue.expected) {
          node.insertCharacters(issue.start, issue.expected, "BEFORE");
        }
        changed = true;
      }
      continue;
    }

    const left = node.characters[issue.index];
    const right = node.characters[issue.index + 1];
    if (left && right && `${left}${right}` === issue.pair && needsSpace(left, right)) {
      node.insertCharacters(issue.index + 1, " ", "BEFORE");
      changed = true;
    }
  }

  return changed;
}

function applyTermFormatIssueToTextNode(node, issue) {
  if (node.characters.slice(issue.start, issue.end) !== issue.actual) return false;

  const edits = getTermWhitespaceEdits(issue.actual, issue.expected, issue.start);
  if (!edits.length) return false;

  for (const edit of edits) {
    if (edit.end > edit.start) node.deleteCharacters(edit.start, edit.end);
    if (edit.replacement) node.insertCharacters(edit.start, edit.replacement, "BEFORE");
  }

  return true;
}

function getTermWhitespaceEdits(actual, expected, offset = 0) {
  const actualParts = getTermCharacterParts(actual);
  const expectedParts = getTermCharacterParts(expected);
  if (actualParts.characters.join("") !== expectedParts.characters.join("")) return [];

  const edits = [];
  const gapCount = Math.min(actualParts.gaps.length, expectedParts.gaps.length);

  for (let index = gapCount - 1; index >= 0; index -= 1) {
    const actualGap = actualParts.gaps[index];
    const expectedGap = expectedParts.gaps[index];
    if (actualGap.value === expectedGap.value) continue;
    edits.push({
      start: offset + actualGap.start,
      end: offset + actualGap.end,
      replacement: expectedGap.value
    });
  }

  return edits;
}

function getTermCharacterParts(value) {
  const characters = [];
  const positions = [];
  let index = 0;

  while (index < value.length) {
    const codePoint = value.codePointAt(index);
    const character = String.fromCodePoint(codePoint);
    if (!isHorizontalWhitespace(character)) {
      characters.push(character);
      positions.push({ start: index, end: index + character.length });
    }
    index += character.length;
  }

  const gaps = [];
  for (let gapIndex = 0; gapIndex < positions.length - 1; gapIndex += 1) {
    const start = positions[gapIndex].end;
    const end = positions[gapIndex + 1].start;
    gaps.push({
      start,
      end,
      value: value.slice(start, end)
    });
  }

  return { characters, gaps };
}

async function loadTextNodeFonts(node) {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
    return;
  }

  const fonts = node.getRangeAllFontNames(0, node.characters.length);
  const seen = new Set();

  for (const font of fonts) {
    const key = `${font.family}/${font.style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await figma.loadFontAsync(font);
  }
}

function findSpacingIssues(text, terms, scriptRanges = [], options = scanOptions) {
  const shouldAddMissingSpaces = options.addMissingSpaces !== false;
  if (!shouldAddMissingSpaces && !options.removeExtraSpaces) return [];

  const termRanges = getLooseTermRanges(text, terms);
  const ignoredRanges = options.ignoreScripts ? scriptRanges : [];
  return dedupeAndSortIssues(
    findTermFormatIssues(text, terms).concat(
      (shouldAddMissingSpaces
        ? findMissingSpacingIssues(text, termRanges, ignoredRanges, options)
        : []
      ).concat(
        options.removeExtraSpaces
          ? findLineEdgeSpaceIssues(text, options).concat(
            findScriptExtraSpaceIssues(text, scriptRanges, termRanges, options),
            findOptionalExtraSpaceIssues(
              text,
              termRanges,
              scriptRanges,
              options
            )
          )
          : []
      )
    )
  );
}

function findMissingSpacingIssues(text, termRanges, ignoredRanges = [], options = scanOptions) {
  const issues = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    const left = text[index];
    const right = text[index + 1];

    if (isProtectedPair(index, index + 1, termRanges)) {
      continue;
    }

    if (isIgnoredPair(index, index + 1, ignoredRanges)) {
      continue;
    }

    if (needsSpace(left, right) && shouldAddBoundarySpace(left, right, options)) {
      issues.push({
        type: "missing-space",
        index,
        start: index,
        end: index + 2,
        pair: `${left}${right}`
      });
    }
  }

  return issues;
}

function findLineEdgeSpaceIssues(text, options = scanOptions) {
  if (options.trimLineSpaces === false) return [];

  const issues = [];
  let lineStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && !isLineBreak(text[index])) continue;

    const lineEnd = index;
    let contentStart = lineStart;
    while (contentStart < lineEnd && isHorizontalWhitespace(text[contentStart])) {
      contentStart += 1;
    }

    let contentEnd = lineEnd;
    while (contentEnd > contentStart && isHorizontalWhitespace(text[contentEnd - 1])) {
      contentEnd -= 1;
    }

    if (contentStart > lineStart) {
      issues.push(createExtraSpaceIssue(
        text,
        "line-edge-extra-space",
        lineStart,
        contentStart,
        ""
      ));
    }

    if (contentEnd < lineEnd) {
      issues.push(createExtraSpaceIssue(
        text,
        "line-edge-extra-space",
        contentEnd,
        lineEnd,
        ""
      ));
    }

    if (index < text.length && text[index] === "\r" && text[index + 1] === "\n") {
      index += 1;
    }
    lineStart = index + 1;
  }

  return issues;
}

function findScriptExtraSpaceIssues(
  text,
  scriptRanges = [],
  termRanges = [],
  options = scanOptions
) {
  if (options.removeScriptSpaces === false) return [];

  const issues = [];

  for (let index = 0; index < scriptRanges.length - 1; index += 1) {
    const leftRange = scriptRanges[index];
    const rightRange = scriptRanges[index + 1];
    if (
      leftRange.end < rightRange.start &&
      text.slice(leftRange.end, rightRange.start).split("").every(isHorizontalWhitespace) &&
      !isProtectedRange(leftRange.end, rightRange.start, termRanges)
    ) {
      issues.push(createExtraSpaceIssue(
        text,
        "script-extra-space",
        leftRange.end,
        rightRange.start,
        ""
      ));
    }
  }

  for (const range of scriptRanges) {
    let beforeStart = range.start;
    while (beforeStart > 0 && isHorizontalWhitespace(text[beforeStart - 1])) {
      beforeStart -= 1;
    }
    if (
      beforeStart < range.start &&
      beforeStart > 0 &&
      !isLineBreak(text[beforeStart - 1]) &&
      !isProtectedRange(beforeStart, range.start, termRanges)
    ) {
      issues.push(createExtraSpaceIssue(
        text,
        "script-extra-space",
        beforeStart,
        range.start,
        ""
      ));
    }

    let afterEnd = range.end;
    while (afterEnd < text.length && isHorizontalWhitespace(text[afterEnd])) {
      afterEnd += 1;
    }
    if (
      afterEnd > range.end &&
      afterEnd < text.length &&
      !isLineBreak(text[afterEnd]) &&
      !isProtectedRange(range.end, afterEnd, termRanges)
    ) {
      issues.push(createExtraSpaceIssue(
        text,
        "script-extra-space",
        range.end,
        afterEnd,
        ""
      ));
    }
  }

  return issues;
}

function findOptionalExtraSpaceIssues(text, termRanges = [], ignoredRanges = [], options = scanOptions) {
  const issues = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    const left = text[index];
    if (!isCjk(left) && !isAsciiWord(left) && !isCjkPunctuation(left)) continue;

    const gapStart = index + 1;
    let gapEnd = gapStart;
    while (gapEnd < text.length && isHorizontalWhitespace(text[gapEnd])) {
      gapEnd += 1;
    }

    if (gapEnd === gapStart || gapEnd >= text.length) continue;

    const right = text[gapEnd];
    if (!isCjk(right) && !isAsciiWord(right) && !isCjkPunctuation(right)) continue;
    if (isProtectedPair(index, gapEnd, termRanges)) continue;
    if (isIgnoredPair(index, gapEnd, ignoredRanges)) continue;

    const spaces = text.slice(gapStart, gapEnd);
    const removeCjkSpace =
      options.removeCjkSpaces !== false &&
      isCjk(left) &&
      isCjk(right);
    const removeCjkPunctuationSpace =
      options.removeCjkPunctuationSpaces !== false &&
      (
        (isCjk(left) && isCjkPunctuation(right)) ||
        (isCjkPunctuation(left) && isCjk(right))
      );
    const removeNumberSpace =
      options.removeNumberSpaces === true &&
      isAsciiDigit(left) &&
      isAsciiDigit(right);
    const removeAll =
      removeCjkSpace ||
      removeCjkPunctuationSpace ||
      removeNumberSpace;
    const normalizeToOne =
      shouldNormalizeRepeatedSpace(left, right, options) &&
      spaces.length > 1;
    if (!removeAll && !normalizeToOne) continue;

    const expected = removeAll ? "" : " ";
    issues.push({
      type: removeCjkSpace
        ? "cjk-extra-space"
        : removeCjkPunctuationSpace
          ? "cjk-punctuation-extra-space"
        : removeNumberSpace
          ? "number-extra-space"
          : "repeated-extra-space",
      index: gapStart,
      start: gapStart,
      end: gapEnd,
      pair: `${left}${spaces}${right}`,
      actual: spaces,
      expected,
      beforeDifference: `${left}${spaces}${right}`,
      afterDifference: `${left}${expected}${right}`
    });

    index = gapEnd - 1;
  }

  return issues;
}

function createExtraSpaceIssue(text, type, start, end, expected) {
  const contextStart = Math.max(0, start - 1);
  const contextEnd = Math.min(text.length, end + 1);
  const actual = text.slice(start, end);
  const beforeDifference = text.slice(contextStart, contextEnd);
  const afterDifference =
    text.slice(contextStart, start) +
    expected +
    text.slice(end, contextEnd);

  return {
    type,
    index: start,
    start,
    end,
    pair: beforeDifference,
    actual,
    expected,
    beforeDifference,
    afterDifference
  };
}

function fixText(text, terms, scriptRanges = [], options = scanOptions) {
  return applyIssuesToText(text, findSpacingIssues(text, terms, scriptRanges, options));
}

function findTermFormatIssues(text, terms) {
  const issues = [];

  for (const match of getTermMatches(text, terms)) {
    if (match.actual === match.expected) continue;
    issues.push({
      type: "term-format",
      index: match.start,
      start: match.start,
      end: match.end,
      pair: match.actual,
      term: match.expected,
      actual: match.actual,
      expected: match.expected
    });
  }

  return issues;
}

function dedupeAndSortIssues(issues) {
  const seen = new Set();
  const result = [];

  for (const issue of issues) {
    const key = `${issue.type}:${issue.start}:${issue.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }

  return result.sort((a, b) => a.start - b.start || a.end - b.end);
}

function needsSpace(left, right) {
  return (isCjk(left) && isSpacingWord(right)) || (isSpacingWord(left) && isCjk(right));
}

function shouldAddBoundarySpace(left, right, options) {
  const other = isCjk(left) ? right : left;
  if (isAsciiLetter(other)) return options.addCjkLatinSpaces !== false;
  return options.addCjkNumberSpaces !== false;
}

function isSpacingWord(char) {
  return isAsciiWord(char) || isScriptNumberChar(char);
}

function isCjk(char) {
  return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(char);
}

function isAsciiWord(char) {
  return /[A-Za-z0-9]/.test(char);
}

function isHorizontalWhitespace(char) {
  return /[\t \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/.test(char);
}

function isLineBreak(char) {
  return char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029";
}

function isCjkPunctuation(char) {
  return /[\u00B7\u2014\u2026\u3001-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(char);
}

function isExtraSpaceIssue(type) {
  return type === "line-edge-extra-space" ||
    type === "cjk-extra-space" ||
    type === "cjk-punctuation-extra-space" ||
    type === "script-extra-space" ||
    type === "number-extra-space" ||
    type === "repeated-extra-space";
}

function getExtraSpaceFixMessage(type) {
  if (type === "line-edge-extra-space") return "已清除行首或行尾空格";
  if (type === "cjk-extra-space") return "已清除中文间多余空格";
  if (type === "cjk-punctuation-extra-space") return "已清除中文标点旁空格";
  if (type === "script-extra-space") return "已清除角标左右空格";
  if (type === "number-extra-space") return "已清除数字间空格";
  if (type === "repeated-extra-space") return "已将连续空格压缩为 1 个";
  return "已清除多余空格";
}

function shouldNormalizeRepeatedSpace(left, right, options) {
  const isCjkAsciiBoundary =
    (isCjk(left) && isAsciiWord(right)) ||
    (isAsciiWord(left) && isCjk(right));
  const isLetterDigitBoundary =
    (isAsciiLetter(left) && isAsciiDigit(right)) ||
    (isAsciiDigit(left) && isAsciiLetter(right));
  const isLetterBoundary = isAsciiLetter(left) && isAsciiLetter(right);
  const isDigitBoundary = isAsciiDigit(left) && isAsciiDigit(right);
  if (isCjkAsciiBoundary) return options.normalizeCjkAsciiSpaces !== false;
  if (isLetterDigitBoundary) return options.normalizeLatinNumberSpaces !== false;
  if (isLetterBoundary) return options.normalizeLatinSpaces !== false;
  if (isDigitBoundary) return options.normalizeNumberSpaces !== false;
  return false;
}

function isAsciiLetter(char) {
  return /[A-Za-z]/.test(char);
}

function isAsciiDigit(char) {
  return /[0-9]/.test(char);
}

function getLooseTermRanges(text, terms) {
  return getTermMatches(text, terms).map((match) => ({
    start: match.start,
    end: match.end
  }));
}

function getTermRuleDefinitions(terms) {
  const definitions = [];
  const seenCompacts = new Set();

  for (const expected of normalizeWhitelist(terms)) {
    const compact = expected.replace(/[\t \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g, "");
    if (compact.length < 2 || seenCompacts.has(compact)) continue;
    seenCompacts.add(compact);
    definitions.push({ compact, expected });
  }

  return definitions.sort((a, b) => b.compact.length - a.compact.length);
}

function getTermMatches(text, terms) {
  const candidates = [];

  for (const rule of getTermRuleDefinitions(terms)) {
    const pattern = createLooseTermPattern(rule.compact);
    let match;

    while ((match = pattern.exec(text)) !== null) {
      candidates.push({
        start: match.index,
        end: match.index + match[0].length,
        actual: match[0],
        expected: rule.expected
      });
      if (pattern.lastIndex === match.index) pattern.lastIndex += 1;
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const matches = [];

  for (const candidate of candidates) {
    const overlaps = matches.some((match) =>
      candidate.start < match.end && candidate.end > match.start
    );
    if (!overlaps) matches.push(candidate);
  }

  return matches;
}

function createLooseTermPattern(compact) {
  const chars = Array.from(compact);
  return new RegExp(
    chars.map(escapeRegExp).join("[\\t \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]*"),
    "g"
  );
}

function isProtectedPair(leftIndex, rightIndex, ranges) {
  return ranges.some((range) => leftIndex >= range.start && rightIndex < range.end);
}

function isProtectedRange(start, end, ranges) {
  return ranges.some((range) => start >= range.start && end <= range.end);
}

function isIgnoredPair(leftIndex, rightIndex, ranges) {
  return ranges.some((range) => {
    const leftInRange = leftIndex >= range.start && leftIndex < range.end;
    const rightInRange = rightIndex >= range.start && rightIndex < range.end;
    return leftInRange || rightInRange;
  });
}

function isIgnoredScriptPair(node, leftIndex, rightIndex, shouldIgnore) {
  if (!shouldIgnore || !node || node.type !== "TEXT") return false;

  const left = node.characters[leftIndex];
  const right = node.characters[rightIndex];
  if (!left || !right) return false;

  return (isCjk(left) && isScriptNumberAt(node, rightIndex)) ||
    (isScriptNumberAt(node, leftIndex) && isCjk(right));
}

function getIgnoredScriptRanges(node, shouldIgnore) {
  if (!shouldIgnore || !node || node.type !== "TEXT") return [];

  const ranges = [];
  let start = null;

  for (let index = 0; index < node.characters.length; index += 1) {
    const isScript = isScriptNumberAt(node, index);

    if (isScript) {
      if (start === null) start = index;
      continue;
    }

    if (start !== null) {
      ranges.push({ start, end: index });
      start = null;
    }
  }

  if (start !== null) {
    ranges.push({ start, end: node.characters.length });
  }

  return ranges;
}

function isScriptNumberAt(node, index) {
  const char = node.characters[index];
  return Boolean(
    char &&
    (isScriptNumberChar(char) || (isAsciiDigit(char) && hasScriptOpenType(node, index)))
  );
}

function hasScriptOpenType(node, index) {
  if (typeof node.getRangeOpenTypeFeatures !== "function") return false;

  try {
    const features = node.getRangeOpenTypeFeatures(index, index + 1);
    if (!features || features === figma.mixed) return false;
    return Boolean(features.SUPS || features.SUBS || features.sups || features.subs);
  } catch (error) {
    return false;
  }
}

function isScriptNumberChar(char) {
  return /[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(char);
}

function normalizeWhitelist(items) {
  if (!Array.isArray(items)) return [];

  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
