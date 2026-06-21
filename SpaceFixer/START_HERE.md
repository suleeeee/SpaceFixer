# SpaceFixer Continue Status

Date: 2026-06-16

## Current package

- Importable plugin directory: `space-fixer/`
- Figma design file: https://www.figma.com/design/pPEd025XGPCSLRRUAMPolJ
- Formal Plugin ID: `1648025602357999016`
- No dependency install or build step is required.

## Latest UI state

- Main panel:
  - `补充缺失空格` is on by default.
  - `清理多余空格*` is off by default.
  - Gear icon opens `规则设置`.
- Rule settings:
  - `扫描设置`: `跳过隐藏图层` checked.
  - `补充缺失空格`: `补充中文与英文/普通数字之间 1 个空格` checked; `排除角标` checked.
  - `清理多余空格`: detailed rules checked by default, but inactive until the main cleanup toggle is enabled.
  - Cleanup rule order is:
    1. `删除行首、行尾空格`
    2. `删除中文与中文之间的空格`
    3. `删除中文与标点符号之间的空格`
    4. `删除角标左右空格`
    5. `中文与英文/数字之间多个空格压缩为 1 个`
    6. `英文与英文/数字之间多个空格压缩为 1 个`
    7. `数字与数字之间多个空格压缩为 1 个`
    8. `删除数字与数字之间空格（谨慎使用）`

## Angle-mark logic

- `排除角标` default: checked.
- `删除角标左右空格` default: checked.
- If `排除角标` is unchecked, angle marks participate in missing-space checks, so `删除角标左右空格` is automatically unchecked and disabled to avoid duplicate/conflicting validation.
- Backend also enforces this: when `excludeScriptSpaces === false`, `removeScriptSpaces` is treated as false.
- `删除角标左右空格` no longer requires the adjacent character to be Chinese; for example `Pro ¹` can be cleaned to `Pro¹`.
- Only horizontal whitespace is removed; manual line breaks are preserved.

## Verified

- `code.js` passes JavaScript syntax check.
- `ui.html` embedded script passes JavaScript syntax check.
- Rule matrix checks pass for:
  - Chinese/Latin missing spaces.
  - Chinese/ordinary-number missing spaces.
  - Angle mark exclusion and cleanup conflict prevention.
  - Line-edge horizontal space trimming.
  - Chinese/Chinese space removal.
  - Chinese punctuation space removal.
  - Angle mark left/right horizontal space removal.
  - CJK/ASCII repeated-space normalization.
  - Latin/Latin and Latin/number repeated-space normalization.
  - Number/number single spaces kept by default, repeated spaces compressed to one, and all spaces removed only when the cautious delete rule is enabled.
  - Line breaks preserved.

## Figma design update

- Updated file: https://www.figma.com/design/pPEd025XGPCSLRRUAMPolJ
- Existing frames updated:
  - `SpaceFixer / Default`
  - `SpaceFixer / Terms Expanded`
  - `SpaceFixer / Fix Preview`
- Added frame:
  - `SpaceFixer / Rule Settings`

## Continue on another computer

1. Unzip this package.
2. In Figma, choose `Plugins > Development > Import plugin from manifest...`.
3. Select `space-fixer/manifest.json`.
4. Run `SpaceFixer`.
5. Test with text layers containing Chinese, English, ordinary numbers, punctuation, superscript/subscript digits, and multiline text.
