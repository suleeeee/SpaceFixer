<div align="center">
  <img src="./ICON.png" alt="SpaceFixer Icon" width="96" height="96" />
  <h1>SpaceFixer</h1>
  <p><strong>面向专业设计与文案团队的 Figma 文本排版与中英文空格校验插件</strong></p>
  <p>
    <a href="https://github.com/suleeeee/SpaceFixer"><img src="https://img.shields.io/badge/GitHub-SpaceFixer-black?logo=github" alt="GitHub" /></a>
    <a href="https://www.figma.com/community/plugin/1648025602357999016/spacefixer"><img src="https://img.shields.io/badge/Figma%20Community-SpaceFixer-blue?logo=figma" alt="Figma Plugin" /></a>
    <img src="https://img.shields.io/badge/Version-v3.2.0-brightgreen" alt="Version" />
    <img src="https://img.shields.io/badge/License-MIT-orange" alt="License" />
  </p>
</div>

---

## 📖 简介 (Introduction)

**SpaceFixer** 是一个用于在 Figma 中快速排查并修正文本空格、标点及中英文排版规范的本地插件。遵循现代中文排版标准，帮助设计师、产品经理与文案人员一键保持视觉一致性与阅读舒适度。

- **快速扫描**：支持选中图层、当前页面或整个文件扫描。
- **专有名词保护**：防止品牌词（如 `ChatGPT`、`iPhone`、`蓝心小V`）内部被拆分或误改，配置随 Figma 文件保存，全员免配置共享。
- **细粒度规则控制**：支持排除角标、删除行首尾空格、压缩重复空格、清理中文间多余空格等。
- **安全与预览**：支持单条快速定位（原生高亮选区，不污染画布图层）、单条即时修复、全部修复弹窗预览。

---

## ✨ 最新更新 (v3.2.0 Changelog)

### 1. 专有名词保护全面重构（全员共享）
- **理念升级**：彻底移除生硬晦涩的“术语规则（白名单）”称呼，升级为语义直观的 **「专有名词保护」**。
- **默认全员共用**：取消复杂的“个人/团队”两层模式与下拉切换选择器，所有规则默认且唯一随当前 Figma 文件存储（`setSharedPluginData`），所有协作者免配置自动共用。
- **更清晰的新人引导**：
  - 新增描述说明：“*保护专有名词（如 ChatGPT、iPhone）不被误改或拆分空格，随当前文件保存并全员共用。*”
  - 优化视觉亲密性（Proximity）：辅助文案紧贴标题（间距 `4px`），与下方多行输入框拉开呼吸感（间距 `14px`），视觉层级清晰舒适。
- **一键忽略收录**：在检查结果列表中点击「忽略」，可直接将词条追加至专有名词保护库并立即自动重新检查。

### 2. 交互与视觉体验细节
- **全新空状态**：采用居中星芒 ✨ 引导文案「*选择范围后点击「检查」排查问题*」，更符合现代设计工具的细腻质感。
- **弹窗快捷操作**：全插件弹窗（修复预览、规则设置、清空二次确认）支持 `Escape` 键盘退出及背景遮罩一键关闭。
- **更利落的折叠栏**：展开面板状态下动态展示当前「*已保护 X 个词条*」，支持二次确认防误触清空。

### 3. 底层性能与稳定性
- 采用 Figma 原生 `findAllWithCriteria({ types: ["TEXT"] })` 检索加速与分片调度，扫描更流畅不卡顿。
- 通过全部 22 项核心排版、角标边界、数字与中英混排自动化回归测试。

---

## 🛠️ 核心功能与排版规则

### 1. 补充缺失空格（默认开启）
根据中文排版惯例，中文与西文字符/数字之间应当保持一个半角空格的视觉缓冲：
- `中文A` ➔ `中文 A`
- `A中文` ➔ `A 中文`
- `中文1` ➔ `中文 1`
- `1中文` ➔ `1 中文`

### 2. 排除角标与特殊数字（默认开启）
- 自动识别 Unicode 上下标数字与 OpenType 角标特性，避免 `Pro¹`、`佩戴²` 被误加空格。
- 支持独立配置角标左右空格清理策略，兼顾商标 `®`、版权 `©` 等特殊字符。

### 3. 清理多余空格（可选开启）
- **行首尾清理**：删除每行开头和结尾的多余空格。
- **中文间空格**：`中文  中文` ➔ `中文中文`，删除汉字间非预期的空白。
- **中文标点**：`中文  ，说明` ➔ `中文，说明`，删除汉字与全角标点之间的无意义空格。
- **空格压缩**：连续多个空格压缩为 1 个空格（`中文    English` ➔ `中文 English`）。
- **数字间空格**：默认保持合法数字间隔，支持可选“删除数字间空格（谨慎使用）”。

### 4. 专有名词保护（Proper Nouns Protection）
将专有短语作为一个不可分割的整体保护其内部写法：
- 例如保护库中录有 `ChatGPT`：若文本中出现 `Chat GPT`，插件会将其校正为 `ChatGPT`，但不会在外部破坏外部间距（如 `使用ChatGPT服务` ➔ `使用 ChatGPT 服务`）。
- 例如录有 `蓝心小V`、`iQOO 智能双面夹5 Pro`：词条内部空格与大小写严格遵循规范，不被空格清理规则误杀。

---

## 🚀 导入与使用方式

1. 打开 **Figma Desktop**。
2. 进入顶部菜单：`Plugins` ➔ `Development` ➔ `Import plugin from manifest...`。
3. 选择本项目中的 `outputs/space-fixer/manifest.json`（或 `outputs/space-fixer-community-upload-2026-06-19/manifest.json`）。
4. 在画布中运行 **SpaceFixer**。
5. 选择检查范围（选中图层 / 当前页面 / 整个文件），点击 **「检查」** 即可。

> **提示**：插件在本地离线运行（`No network access`），绝不上传任何设计文件数据。专有名词保存在 Figma 文件的数据节点中，团队成员在相同文件中打开插件即可自动同步共享。

---

## 🧪 开发者与测试验证

本项目包含完整的字符边界与排版逻辑测试套件：

```bash
# 运行 22 项排版规则回归测试
node checks/space-fixer-rule-check.js
```

---

## 🔗 相关链接

- **GitHub 仓库**：[https://github.com/suleeeee/SpaceFixer](https://github.com/suleeeee/SpaceFixer)
- **Figma 插件主页**：[SpaceFixer on Figma Community](https://www.figma.com/community/plugin/1648025602357999016/spacefixer)
- **Plugin ID**：`1648025602357999016`

---

## 📄 开源许可

本项目遵循 [MIT License](./LICENSE) 开源。
