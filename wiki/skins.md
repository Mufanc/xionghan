# 皮肤包规范

[返回项目首页](../README.md)

ZIP 根目录必须包含 UTF-8 的 `skin.properties`，`id` 与 `name` 必填，`author`、`version`、`description` 可选。同 ID 再次导入会更新皮肤。

- `background.png`：页面背景，居中 cover。
- `board.png`：棋盘与网格，按棋盘尺寸 fitXY。
- `r-*.png` / `b-*.png`：双方棋子，按棋子区域 contain。
- `panel.9.png`：所有 UI 容器共用的面板，优先于 `panel.png`。点九边缘每边只支持一段纯黑标记，其余透明；上、左标记拉伸区，下、右标记内容区。容器保留必要的内边距，且不会小于内容区标记。普通 `panel.png` 则随容器拉伸。

可在 `skin.properties` 中选配以下共用颜色，值仅接受 `#RGB`、`#RGBA`、`#RRGGBB` 或 `#RRGGBBAA`；未填写时沿用默认色，不支持任意 CSS：

```properties
color.text=#584a39
color.muted=#8b8070
color.border=#c9bdab
color.surface=#f6f2e9
color.accent=#a1332d
color.accent-text=#fff8ec
color.hover=#e8decd
color.selection=#e2d7c5
```

这些颜色用于 UI 文字、边线、按钮及交互状态，不会修改棋子图片、双方棋色和禁着标记。面板图片应与文字颜色配套；图片本身的颜色不会被这些变量重绘。

旧包中的 `record.9.png` / `record.png` 仅在没有通用面板时作为后备，不再独立渲染棋谱。
