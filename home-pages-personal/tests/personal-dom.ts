// Browser-only Obsidian DOM helpers used by the isolated preview and interaction tests.
type ElementOptions = string | { cls?: string | string[]; text?: string | number; attr?: Record<string, unknown>; type?: string; value?: string; href?: string; title?: string; parent?: HTMLElement };
function element<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag), info = typeof options === "string" ? { cls: options } : options;
  if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
  if (info.text !== undefined) el.textContent = String(info.text);
  for (const [key, value] of Object.entries(info.attr || {})) if (value !== null && value !== undefined) el.setAttribute(key, String(value));
  for (const key of ["type", "value", "href", "title"] as const) if (info[key] !== undefined) el.setAttribute(key, info[key]!);
  info.parent?.appendChild(el);
  return el;
}
Object.assign(HTMLElement.prototype, {
  createEl(this: HTMLElement, tag: keyof HTMLElementTagNameMap, options?: ElementOptions, callback?: (el: HTMLElement) => void) { const el = element(tag, options); this.appendChild(el); callback?.(el); return el; },
  createDiv(this: HTMLElement, options?: ElementOptions, callback?: (el: HTMLDivElement) => void) { const el = element("div", options); this.appendChild(el); callback?.(el); return el; },
  createSpan(this: HTMLElement, options?: ElementOptions, callback?: (el: HTMLSpanElement) => void) { const el = element("span", options); this.appendChild(el); callback?.(el); return el; },
  empty(this: HTMLElement) { this.replaceChildren(); },
  addClass(this: HTMLElement, ...names: string[]) { this.classList.add(...names.flatMap(name => name.split(/\s+/)).filter(Boolean)); },
  removeClass(this: HTMLElement, ...names: string[]) { this.classList.remove(...names.flatMap(name => name.split(/\s+/)).filter(Boolean)); },
  toggleClass(this: HTMLElement, name: string, enabled: boolean) { this.classList.toggle(name, enabled); },
  hasClass(this: HTMLElement, name: string) { return this.classList.contains(name); },
  setText(this: HTMLElement, text: unknown) { this.textContent = String(text ?? ""); },
  appendText(this: HTMLElement, text: string) { this.appendChild(document.createTextNode(text)); },
  setAttr(this: HTMLElement, name: string, value: unknown) { if (value === null) this.removeAttribute(name); else this.setAttribute(name, String(value)); },
  getAttr(this: HTMLElement, name: string) { return this.getAttribute(name); },
  setCssProps(this: HTMLElement, props: Record<string, string>) { for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value); },
  detach(this: HTMLElement) { this.remove(); },
  show(this: HTMLElement) { this.style.removeProperty("display"); },
  hide(this: HTMLElement) { this.style.display = "none"; },
});
Object.assign(globalThis, { createEl: element, createDiv: (options?: ElementOptions) => element("div", options), createSpan: (options?: ElementOptions) => element("span", options) });
Object.assign(Element.prototype, {createSvg(this:Element,tag:string,options:{cls?:string;attr?:Record<string,string>}={}) {const svg=document.createElementNS("http://www.w3.org/2000/svg",tag);if(options.cls)svg.setAttribute("class",options.cls);for(const [key,value] of Object.entries(options.attr||{}))svg.setAttribute(key,value);this.appendChild(svg);return svg;}});
export {};
