# 测试

- `npm run build`：类型检查、构建与 bundle 检查。
- `npm run lint`：代码规范检查。
- `npm test`：组件集成测试，默认使用内嵌合成夹具，不读取外部笔记库。微信和批注的外部快照检查默认跳过；仅在显式设置 `HOME_PAGES_TEST_VAULT` 后运行。
- `npm run test:sorting`：在真实浏览器中加载 `HomeView`，检查卡片及页面排序、保存、DOM/配置保留、单列及混合宽度布局、触屏/手写笔、取消和自动滚动。

排序测试使用已安装的 Playwright。若它不在本项目的模块路径中，将 `HOME_PAGES_PLAYWRIGHT_MODULE` 设为 Playwright 包的绝对路径。默认使用 Playwright Chromium，也可通过 `HOME_PAGES_TEST_BROWSER=msedge` 或 `chrome` 使用已安装的浏览器。Obsidian 模块使用本目录的桩；测试不会启动 Obsidian 或改动实际页面数据。
