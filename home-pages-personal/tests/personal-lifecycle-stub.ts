export * from "./obsidian-stub";

// The app, storage and Obsidian lifecycle are mocked; plugin/view/services remain real.
export class Plugin {
  commands: unknown[] = [];
  cleanups: Array<() => void> = [];
  constructor(public app: any, public manifest = { id: "personal-launchpad" }) {}
  loadData(): Promise<unknown> { return this.app.testLoad(); }
  saveData(value: unknown): Promise<void> { return this.app.testSave(value); }
  registerView(type: string, factory: unknown): void { this.app.workspace.factories.set(type, factory); }
  addRibbonIcon(): void {}
  addCommand(command: unknown): void { this.commands.push(command); }
  addSettingTab(): void {}
  register(callback: () => void): void { this.cleanups.push(callback); }
  registerEvent(): void {}
  registerInterval(id: number): void { this.cleanups.push(() => clearInterval(id)); }
  registerDomEvent(target: EventTarget, type: string, callback: EventListener): void {
    target.addEventListener(type, callback); this.cleanups.push(() => target.removeEventListener(type, callback));
  }
}
export class Notice {
  static messages: string[] = [];
  constructor(message: string) { Notice.messages.push(message); }
}
export class ItemView {
  app: any;
  contentEl: HTMLElement;
  cleanups: Array<() => void> = [];
  constructor(public leaf: any) { this.app = leaf.app; this.contentEl = leaf.contentEl; }
  addAction(): void {}
  registerEvent(): void {}
  register(callback: () => void): void { this.cleanups.push(callback); }
  addChild<T>(child: T): T { return child; }
  removeChild<T>(child: T): T { return child; }
}
export class Modal {
  modalEl = document.createElement("section");
  titleEl = this.modalEl.appendChild(document.createElement("h2"));
  contentEl = this.modalEl.appendChild(document.createElement("div"));
  opened = false;
  constructor(public app: unknown) {}
  onOpen(): void {}
  onClose(): void {}
  open(): void { this.opened = true; document.body.append(this.modalEl); this.onOpen(); }
  close(): void { if (!this.opened) return; this.opened = false; this.onClose(); this.modalEl.remove(); }
}
