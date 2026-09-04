# Personal Launchpad

一个可直接安装到 Obsidian Vault 的个人成长启动台插件。它把每日推送、闪念捕捉、阶段化行动、外部反馈、书库和三端自适应界面放在同一个首页里。

## 安装

### 推荐：BRAT 自动更新

在每一台设备安装社区插件 **BRAT**，选择「Add beta plugin」，填入：

`wumohongyuan/personal-launchpad`

之后在 BRAT 中启用自动更新即可。每次发布新版本后，不需要手动复制插件文件。

### 手动安装

下载 GitHub Release 中的 `main.js`、`manifest.json`、`styles.css`，放入 Vault 的 `.obsidian/plugins/personal-launchpad/` 文件夹，再在 Obsidian 的「设置 → 第三方插件」中启用 **Personal Launchpad**。

## 数据与同步

插件把同步数据保存在 `个人成长系统/` 下：每日闪念、日记、复盘、外部反馈和配置都属于普通 Vault 文件，因此可由 Fast Note Sync 同步。

## 功能

- 每日推送 / 自定义 Banner；
- 闪念快速捕捉，按日期保存为 Markdown；
- 全局命令「Quick capture a flash」可随时打开速记输入框；待办型闪念可一键加入今日行动；
- 三阶段成长系统：自动周数、阶段任务与交付物；
- 顶部明确显示 180 天计划的天数与总体进度；
- 外部反馈记录和黄灯 / 红灯预警；
- 每周完成率、闪念数、外部反馈统计与一键周复盘；
- 交付物一键创建 Markdown 模板；
- 在读书库与阅读进度；
- 日记、复盘、搜索等快捷入口；
- 桌面三列、平板两列、手机单列的响应式布局。

## 发布与更新

源码采用 Obsidian 标准发布结构。每次版本更新都会递增 `manifest.json` 中的版本号，并创建相同版本号的 GitHub Release；Release 附带可安装的三个文件。稳定后会提交 Obsidian 社区插件目录，届时可直接使用 Obsidian 内置更新。

## 隐私与同步

插件把同步数据保存在 `个人成长系统/` 下：每日闪念、日记、复盘、外部反馈和配置都属于普通 Vault 文件，因此可由 Fast Note Sync 同步。本仓库的 `.gitignore` 默认不会提交这些个人数据。
