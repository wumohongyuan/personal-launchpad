# Third-party notices

## Home Pages

Personal Launchpad 3.0 is a derivative of **Home Pages**, authored by **and** and contributors.

- Upstream repository: https://github.com/jepicaju862-lab/home-pages
- Baseline version: 0.3.1
- Baseline commit: `2f98a7c44432a5e077977535f94093487417c735`
- Source retained and modified in: `home-pages-personal/`
- License: **GPL-3.0-only**, preserved in `LICENSE` and `home-pages-personal/LICENSE`.

The derivative retains upstream's HomeView, multi-page dashboard, widget registry, configuration modals, sorting and resizing interactions, styles and built-in widgets. Personal Launchpad adds personal capture, journals, a library and reading reflections, growth and health records, knowledge workflows, a ledger and subscription reminders. It also changes plugin identity, default pages, lifecycle handling and responsive behavior. This is a modified project, not an official Home Pages release.

Upstream README files, release notes and development material inside `home-pages-personal/` are retained for provenance. The repository-root README and release notes describe this derivative. Source correspondence for the distributed Personal Launchpad binaries is provided by this repository's release tag.

## Earlier Personal Launchpad modules

Copyright (c) 2026 wumohongyuan.

Earlier Personal Launchpad data modules were originally provided under the MIT License. Their notice is preserved in `LICENSE-MIT-legacy`. The reused and modified modules are under `home-pages-personal/src/personal/data/`, including the Markdown model/store, workbench data, growth plans and library data. The derivative plugin is distributed under GPL-3.0-only; the original MIT permission notice remains with these portions.

## Lucide / Feather icons

The native plugin obtains icons through Obsidian's `setIcon` API. The earlier design materials include Lucide icon attribution under the ISC License and Feather-derived icon attribution under the MIT License. Those notices remain in `design/icons-LICENSE`. Browser preview icons are development assets and do not replace Obsidian's native icon implementation.

## Development dependencies

The Obsidian API package, TypeScript, esbuild and linting packages are development dependencies listed in `home-pages-personal/package.json` and its lockfile. Their individual package licenses remain applicable. Obsidian itself is not bundled with this plugin. Playwright is used for local browser verification and is not required to run the plugin.
