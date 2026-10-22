# 🔍 qbSearch - 专为 Obsidian 打造的本地全文搜索插件

**qbSearch** 是一个轻量、快速且高度可定制的 Obsidian 本地全文搜索插件。它不仅能帮你秒级定位笔记，还能完美渲染搜索结果的 Markdown 摘要，让你的搜索体验更加原生、优雅。

## ✨ 核心特性

*   🪟 **双形态无缝切换**：支持**侧边栏（常驻）**与**全屏弹窗**两种打开方式，无论是沉浸式搜索还是边写边查，都能轻松应对。
*   📝 **Markdown 结果渲染**：告别纯文本！搜索结果摘要支持 Markdown 渲染，并完美跟随你的 Obsidian 主题，高亮显示匹配内容。
*   ⚡ **性能实时反馈**：每次搜索直观显示**耗时时间**
*   🕒 **智能搜索历史**：自动记录你的历史搜索词，下次打开或点击即可快速重试，告别重复输入。
*   🗂️ **多维分类与过滤**：支持按 `全部`、`文件名`、`标签`、`路径` 分类查看结果，并支持在输入框使用 `file:`、`tag:`、`path:` 等高级语法缩小范围。
*   🚫 **文件夹排除过滤**：支持在设置中添加需要过滤的文件夹，忽略无关笔记（如模板文件夹、归档文件夹），让搜索结果更纯净。

## ⚙️ 设置项

*   **结果条数上限**：单次最多显示多少条，超出可通过细化关键词筛选。
*   **区分大小写**：开启后 `A` 与 `a` 视为不同字符。
*   **记住上次搜索词**：打开即恢复上次查询。
*   **渲染 Markdown**：自由开关结果摘要的渲染效果。

## 📸 界面预览

<img width="798" height="803" alt="设置界面" src="https://github.com/user-attachments/assets/276ce70a-ab3f-42e2-9337-56343b672558" />
<img width="964" height="282" alt="全屏" src="https://github.com/user-attachments/assets/38f37471-76df-4377-9efc-b22d64d1b759" />
<img width="390" height="588" alt="侧边栏" src="https://github.com/user-attachments/assets/2c8d8c8f-a7ce-4687-8062-ff58bc60090e" />


## 📦 安装方法

1. 打开 Obsidian 设置 -> 第三方插件 -> 关闭安全模式。
2. 
3. 或者，从 Releases 页面下载最新版本的 `main.js`, `manifest.json`, `styles.css`，放入你的 `.obsidian/plugins/qbsearch` 文件夹中，重启 Obsidian 并启用。

## 🤝 反馈与贡献

如果你在使用过程中遇到任何问题，或者有新的功能建议，欢迎提交 [Issue](你的issue链接)！如果觉得好用，别忘了点个 Star ⭐ 支持一下！
