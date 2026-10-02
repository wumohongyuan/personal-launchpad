# 个人空间 3.0：设计与预览

3.0 使用 [Home Pages](https://github.com/jepicaju862-lab/home-pages) 的实际 HomeView、卡片组件、配置弹窗、拖动和缩放实现。设计基线为上游 0.3.1、提交 `2f98a7c44432a5e077977535f94093487417c735`。此前独立绘制的个人空间页面已不作为插件界面。

## 交互重点

- 保留上游卡片框架和多页面导航。工作台布局由用户决定：增删组件、复制组件、调整顺序与尺寸，再用齿轮配置内容。
- 随手记录是直接输入的起点。日记、待办和想法收件箱围绕这份记录继续整理，刷新其他组件时保留输入。
- 图书馆以书架与单本书详情组织内容，读完后的心得与摘录保存在书笔记中。
- 成长、运动、回顾、知识、账本和会员续费均是工作台组件，可以和上游组件重新组合。
- 内容样式使用 Obsidian 主题变量；窄面板将卡片重新排成整行，减少文字被压窄的问题。草稿自动保留、错误后保留输入、IME 防误提交属于记录流程的一部分。

## 运行预览

从仓库根目录执行：

```sh
npm ci --prefix home-pages-personal
npm run build
npm run preview
```

然后打开 `http://127.0.0.1:4176/design/`。构建脚本生成 `design/index.html` 和 `design/preview.js`，样式来自本版插件构建产物。不要手工修改生成文件作为生产功能的实现。

预览入口是 `home-pages-personal/tests/personal-preview.ts`，使用真实 HomeView 与 PersonalServices。`personal-dom.ts` 和 `personal-obsidian-stub.ts` 提供浏览器中的 Obsidian API 模拟；演示库保存在浏览器自己的存储中，示例不来自用户笔记。

预览的「切换明暗」按钮只改变演示主题；原文入口在演示对话框里展示和编辑 Markdown。实际插件通过 Obsidian 打开原生笔记，Markdown 渲染也由 Obsidian 完成。简单的浏览器 Markdown 模拟不代表原生渲染完全一致。

## 源文件与验证

生产实现位于 `home-pages-personal/src/`；个人组件在 `src/personal/`，数据服务在 `src/personal/data/`。根目录旧 `src/` 和 `design/prototype.css` 是历史材料，不参与 3.0 构建。

浏览器测试涵盖记录、草稿、失败重试、行动、图书馆及不同宽度下的布局，截图和运行报告输出到 `test-results/`。这些产物留在本机，不进入公开发行包。浏览器/API 模拟验证不能替代电脑、平板与手机上的原生 Obsidian 验证。

许可和上游来源见仓库根目录 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)；保留的早期图标许可位于 [icons-LICENSE](icons-LICENSE)。
