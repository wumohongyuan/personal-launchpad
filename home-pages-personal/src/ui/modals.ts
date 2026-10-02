import { App, Modal, Setting, setIcon } from "obsidian";
import type HomePagesPlugin from "../main";
import type { WidgetInstance, WidgetKind } from "../types";
import { getWidgetDefinition, isBuiltinKind, listWidgetDefinitions, normalizeWidgetConfig } from "../widgets/registry";
import type { WidgetSettingsContext } from "../widgets/types";
import { createId } from "../utils/id";
import { clearWidgetColorPreview, previewWidgetColors } from "../personal/appearance-editor";

export const MAX_COLUMNS = 12;
export const MAX_ROWS = 30;

/** 单个组件的配置弹窗：通用项（标题 / 尺寸）+ 组件自定义项，点“保存”才写回。 */
export class WidgetSettingsModal extends Modal {
  private draft: WidgetInstance;
  private draftConfig: Record<string, unknown>;
  private bodyEl!: HTMLElement;
  private saving = false;
  private readonly colorId = createId("widget-colors");

  constructor(
    app: App,
    private readonly plugin: HomePagesPlugin,
    widget: WidgetInstance,
    private readonly onSave: (updated: WidgetInstance) => void | Promise<void>
  ) {
    super(app);
    this.draft = { ...widget, config: { ...widget.config }, colors: widget.colors ? { ...widget.colors } : undefined };
    this.draftConfig = normalizeWidgetConfig(widget);
    plugin.register(() => this.close());
  }

  onOpen(): void {
    const definition = getWidgetDefinition(this.draft.kind);
    this.modalEl.addClass("hp-modal");
    this.titleEl.setText(`配置组件 · ${definition?.name ?? this.draft.kind}`);
    this.bodyEl = this.contentEl.createDiv({ cls: "hp-modal-body" });
    this.renderBody();

    const footer = this.contentEl.createDiv({ cls: "hp-modal-footer" });
    const error = this.contentEl.createDiv({ cls: "hp-personal-error", attr: { role: "status" } });
    new Setting(footer)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("保存").setCta().onClick(async () => {
        if (this.saving) return;
        this.saving = true;
        button.setDisabled(true);
        this.bodyEl.inert = true;
        error.setText("");
        try {
          const definition = getWidgetDefinition(this.draft.kind);
          const normalized = definition?.normalizeConfig ? definition.normalizeConfig(this.draftConfig) : this.draftConfig;
          await this.onSave({ ...this.draft, config: { ...normalized }, colors: this.draft.colors ? { ...this.draft.colors } : undefined });
          this.saving = false;
          this.close();
        } catch (reason) {
          error.setText(reason instanceof Error ? reason.message : "设置没有保存成功，请重试。");
        } finally {
          this.saving = false;
          this.bodyEl.inert = false;
          button.setDisabled(false);
        }
      }));
  }

  private renderBody(): void {
    const container = this.bodyEl;
    container.empty();
    const definition = getWidgetDefinition(this.draft.kind);

    new Setting(container).setName("标题").setDesc("留空使用默认标题。")
      .addText((text) => text.setPlaceholder(definition?.name ?? "").setValue(this.draft.title ?? "").onChange((value) => {
        this.draft.title = value.trim() || undefined;
      }));
    new Setting(container).setName("宽度（列）").setDesc(`网格共 ${MAX_COLUMNS} 列。`)
      .addSlider((slider) => slider.setLimits(1, MAX_COLUMNS, 1).setValue(this.draft.w).setDynamicTooltip().onChange((value) => {
        this.draft.w = value;
      }));
    new Setting(container).setName("高度（行）").setDesc("行高可在插件设置中调整。")
      .addSlider((slider) => slider.setLimits(1, MAX_ROWS, 1).setValue(this.draft.h).setDynamicTooltip().onChange((value) => {
        this.draft.h = value;
      }));

    this.renderColors(container);
    if (!definition) return;
    container.createEl("h3", { cls: "hp-modal-section", text: "组件设置" });
    const ctx: WidgetSettingsContext<Record<string, unknown>> = {
      app: this.app,
      plugin: this.plugin,
      config: this.draftConfig,
      update: (patch) => {
        Object.assign(this.draftConfig, patch);
      },
      refresh: () => this.renderBody()
    };
    definition.renderSettings(container, ctx);
  }

  private renderColors(container: HTMLElement): void {
    container.createEl("h3", { cls: "hp-modal-section", text: "组件配色" });
    container.createEl("p", { cls: "hp-color-intro", text: "只调整这个组件，边选边预览。继承默认时使用全局配色；全局未设时使用主题或组件默认色。取消不会保存。" });
    const grid = container.createDiv({ cls: "hp-color-grid" });
    const appearance = this.plugin.settings.appearance;
    const dark = appearance !== "light" && (appearance !== "system" || document.body.classList.contains("theme-dark"));
    const fallback = {
      accent: getWidgetDefinition(this.draft.kind)?.accent ?? "#a998e5",
      card: dark ? "#25262e" : "#ffffff",
      text: dark ? "#ececf2" : "#282a39"
    };
    for (const [key, title] of [["accent", "强调色"], ["card", "卡片底色"], ["text", "文字颜色"]] as const) {
      const row = grid.createDiv({ cls: "hp-color-row", attr: { "data-widget-color": key } });
      const id = `${this.colorId}-${key}`;
      row.createEl("label", { text: title, attr: { for: id } });
      const controls = row.createDiv({ cls: "hp-color-controls" });
      const picker = controls.createEl("input", { cls: "hp-color-picker", attr: { id, type: "color", "aria-label": `组件${title}` } });
      const reset = controls.createEl("button", { cls: "hp-color-reset", text: "恢复继承", attr: { type: "button", "aria-label": `${title}恢复继承` } });
      const inheritLabel = row.createEl("label", { cls: "hp-color-inherit" });
      const inherit = inheritLabel.createEl("input", { attr: { type: "checkbox", "aria-label": `${title}继承默认` } });
      inheritLabel.createSpan({ text: "继承默认" });
      const state = row.createEl("small", { cls: "hp-color-state", attr: { role: "status" } });
      const inheritedColor = (): string => {
        const color = this.plugin.settings.colors?.[key] ?? fallback[key];
        return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#a998e5";
      };
      const sync = (): void => {
        const color = this.draft.colors?.[key];
        picker.value = color ?? inheritedColor();
        inherit.checked = !color;
        reset.disabled = !color;
        state.setText(color ? "仅此组件 · 自定义" : "跟随全局 / 默认");
      };
      const preview = (): void => {
        if (this.draft.colors && !Object.keys(this.draft.colors).length) this.draft.colors = undefined;
        sync();
        previewWidgetColors(this.plugin, this.draft.id, this.draft.colors);
      };
      const restore = (): void => { delete this.draft.colors?.[key]; preview(); };
      picker.addEventListener("input", () => {
        if (!/^#[0-9a-f]{6}$/i.test(picker.value)) return;
        this.draft.colors = { ...this.draft.colors, [key]: picker.value.toLowerCase() };
        preview();
      });
      inherit.addEventListener("change", () => {
        if (inherit.checked) restore();
        else { this.draft.colors = { ...this.draft.colors, [key]: picker.value }; preview(); }
      });
      reset.addEventListener("click", restore);
      sync();
    }
  }

  close(): void {
    if (this.saving && this.plugin.active) return;
    super.close();
  }

  onClose(): void {
    clearWidgetColorPreview(this.plugin, this.draft.id);
    this.contentEl.empty();
  }
}

/** 选择要添加的组件类型。 */
export class AddWidgetModal extends Modal {
  constructor(
    app: App,
    private readonly onPick: (kind: WidgetKind) => void,
    private readonly onPaste?: () => void,
    private readonly plugin?: HomePagesPlugin
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("hp-modal");
    this.titleEl.setText("添加组件");

    if (this.onPaste) {
      const topBar = this.contentEl.createDiv({ cls: "hp-add-topbar" });
      topBar.createDiv({ cls: "hp-add-topbar-text", text: "想使用自定义代码或脚本卡片？" });

      const pasteBtn = topBar.createEl("button", {
        cls: "mod-cta",
        text: "📋 粘贴代码新建组件"
      });
      pasteBtn.addEventListener("click", () => {
        this.close();
        this.onPaste?.();
      });
    }

    const grid = this.contentEl.createDiv({ cls: "hp-add-grid" });

    if (this.onPaste) {
      const pasteCard = grid.createDiv({ cls: "hp-add-card hp-add-card-paste" });
      setIcon(pasteCard.createDiv({ cls: "hp-add-icon" }), "code-xml");
      const ptext = pasteCard.createDiv({ cls: "hp-add-text" });
      ptext.createDiv({ cls: "hp-add-name", text: "＋ 粘贴代码新建组件" });
      ptext.createDiv({ cls: "hp-add-desc", text: "直接粘贴一段 JavaScript 脚本创建并加入当前首页" });
      pasteCard.addEventListener("click", () => {
        this.close();
        this.onPaste?.();
      });
    }

    for (const definition of listWidgetDefinitions()) {
      const isCustom = !isBuiltinKind(definition.kind) && (this.plugin?.customWidgetManager.hasKind(definition.kind) ?? false);
      const card = grid.createDiv({ cls: `hp-add-card${isCustom ? " hp-add-card-user" : ""}` });
      card.style.setProperty("--hp-accent", definition.accent);
      setIcon(card.createDiv({ cls: "hp-add-icon" }), definition.icon);
      const text = card.createDiv({ cls: "hp-add-text" });
      const nameRow = text.createDiv({ cls: "hp-add-name-row" });
      nameRow.createDiv({ cls: "hp-add-name", text: definition.name });
      if (isCustom) {
        nameRow.createSpan({ cls: "hp-add-card-custom-tag", text: "自定义" });
      }
      text.createDiv({ cls: "hp-add-desc", text: definition.description });

      if (isCustom && this.plugin) {
        const delBtn = card.createEl("button", {
          cls: "hp-add-card-del",
          attr: { type: "button", "aria-label": "删除自定义组件", title: "删除自定义组件" }
        });
        setIcon(delBtn, "trash-2");
        delBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.plugin?.customWidgetManager.promptDeleteWidget(definition.kind, () => {
            card.remove();
          });
        });
      }

      card.addEventListener("click", () => {
        this.close();
        this.onPick(definition.kind);
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly options: { title: string; message: string; confirmText?: string; danger?: boolean },
    private readonly onConfirm: () => void | Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    this.contentEl.createEl("p", { text: this.options.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => {
        button.setButtonText(this.options.confirmText ?? "确定").onClick(async () => {
          await this.onConfirm();
          this.close();
        });
        if (this.options.danger) button.setWarning();
        else button.setCta();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class PromptModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly options: { title: string; placeholder?: string; value?: string; confirmText?: string },
    private readonly onSubmit: (value: string) => void | Promise<void>
  ) {
    super(app);
    this.value = options.value ?? "";
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    let inputEl: HTMLInputElement | null = null;
    new Setting(this.contentEl).addText((text) => {
      inputEl = text.inputEl;
      text.setPlaceholder(this.options.placeholder ?? "").setValue(this.value).onChange((value) => {
        this.value = value;
      });
      text.inputEl.addClass("hp-setting-input-wide");
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.submit();
        }
      });
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
      .addButton((button) => button.setButtonText(this.options.confirmText ?? "确定").setCta().onClick(() => void this.submit()));
    window.setTimeout(() => inputEl?.focus(), 0);
  }

  private async submit(): Promise<void> {
    const value = this.value.trim();
    if (!value) return;
    await this.onSubmit(value);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
