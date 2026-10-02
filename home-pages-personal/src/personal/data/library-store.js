"use strict";
const { dateKey, clockTime, uid, fileTitle, safeFolder, excerpt } = require("./model");
const { WorkbenchStore } = require("./workbench-store");
const STATUSES = ["想读", "在读", "已读"];
const NOTE_KINDS = { reflection: "读书心得", feeling: "感受与联想", quote: "摘录" };
function vaultPath(value) {
  const path = safeFolder(String(value || "").trim());
  if (!path.toLowerCase().endsWith(".md")) throw new Error("书笔记路径需要是库内 Markdown 文件。");
  return path;
}
function coverPath(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https:\/\//i.test(text)) { const url = new URL(text); if (url.username || url.password) throw new Error("封面网址不能包含登录信息。"); return url.href; }
  const path = safeFolder(text);
  if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(path)) throw new Error("封面请填写库内图片路径，或 HTTPS 图片网址。");
  return path;
}
function number(value, name) {
  const result = Number(value || 0);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${name}请填写不小于 0 的整数。`);
  return result;
}
function bookView(source) {
  return { ...source, title: String(source.title || "未命名书籍"), author: String(source.author || ""), status: STATUSES.includes(source.status) ? source.status : "在读", current: Number(source.current) || 0, total: Number(source.total) || 0, category: String(source.category || "未分类"), cover: String(source.cover || ""), source };
}
function noteBlock(note) {
  if (!/^[a-z0-9-]+$/i.test(note.id) || !NOTE_KINDS[note.kind]) throw new Error("阅读记录格式无效。");
  if (!String(note.text).trim()) throw new Error("先写下一点内容吧。");
  return `> [!pl-book-${note.kind}] ${note.date} ${note.time} · ${NOTE_KINDS[note.kind]}\n>\n${String(note.text).trim().replace(/\r\n/g,"\n").split("\n").map(line=>line ? "> "+line : ">").join("\n")}\n\n^pl-book-${note.id}`;
}
function parseNotes(content) {
  const result=[];
  const pattern=/^> \[!pl-book-(reflection|feeling|quote)\] (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · [^\r\n]+\r?\n((?:>[^\r\n]*(?:\r?\n|$))+)\r?\n\^pl-book-([a-z0-9-]+)(?=\r?\n|$)/gim;
  for (const match of content.matchAll(pattern)) result.push({kind:match[1],date:match[2],time:match[3],text:match[4].replace(/^> ?/gm,"").replace(/\r\n/g,"\n").trim(),id:match[5],block:match[0]});
  return result;
}
class LibraryStore {
  constructor(store) { this.store=store; this.workbench=new WorkbenchStore(store); }
  get folder() { return `${this.store.settings.legacyFolder}/书库`; }
  async list() { return (await this.workbench.load()).books.map(bookView); }
  pathFor(book) {
    if (book.path) return vaultPath(book.path);
    const legacyName=String(book.title).replace(/[\\/:*?"<>|]/g,"-");
    try { const old=vaultPath(`${this.folder}/${legacyName}.md`); if(this.store.vault.getAbstractFileByPath(old)) return old; } catch (_) {}
    return `${this.folder}/${fileTitle(book.title)}--${fileTitle(String(book.id)).slice(0,24)}.md`;
  }
  async saveBook(input, original) {
    const id=String(input.id || uid());
    const title=String(input.title || "").trim(); fileTitle(title);
    const total=number(input.total,"总页数"), current=number(input.current,"当前页数");
    if(total && current>total) throw new Error("当前页数不能超过总页数；未知总页数可填 0。");
    if(!STATUSES.includes(input.status || "想读")) throw new Error("请选择阅读状态。");
    const values={id,title,author:String(input.author || "").trim(),status:input.status || "想读",current:input.status==="已读" && total ? total : current,total,category:String(input.category || "未分类").trim() || "未分类",cover:coverPath(input.cover)};
    const expected=original?.source || original;
    let saved;
    await this.workbench.change(state=>{
      const index=state.books.findIndex(book=>String(book.id)===id), existing=index>=0 ? state.books[index] : null;
      const already=existing && Object.entries(values).every(([key,value])=>existing[key]===value);
      if(expected && (!existing || (JSON.stringify(existing)!==JSON.stringify(expected) && !already))) throw new Error("这本书已在别处修改。输入已保留，请刷新后再试。");
      let path=existing ? this.pathFor(existing) : `${this.folder}/${fileTitle(title)}.md`;
      if(!existing && (this.store.vault.getAbstractFileByPath(path) || state.books.some(book=>this.pathFor(book)===path))) path=`${this.folder}/${fileTitle(title)}--${fileTitle(id).slice(0,24)}.md`;
      saved={...existing,...values,path,addedAt:existing?.addedAt || dateKey()};
      if(saved.status==="已读") { saved.finishedAt=existing?.finishedAt || dateKey(); if(total) saved.current=total; }
      if(index<0) state.books.push(saved); else state.books[index]=saved;
    });
    await this.ensureNote(saved);
    return bookView(saved);
  }
  async ensureNote(book) {
    const path=this.pathFor(book);
    return this.store.enqueue(path,async()=>{
      const existing=this.store.vault.getAbstractFileByPath(path);
      if(existing) { if(Array.isArray(existing.children)) throw new Error("书笔记路径被同名文件夹占用。"); return path; }
      await this.store.ensureFolder(path.slice(0,path.lastIndexOf("/")));
      const content=`---\ntype: book\nbook_id: ${JSON.stringify(String(book.id))}\nbook_title: ${JSON.stringify(book.title)}\nauthor: ${JSON.stringify(book.author || "")}\ncssclasses: [pl-book-note]\n---\n\n`;
      try { await this.store.vault.create(path,content); }
      catch(error) { if(!this.store.vault.getAbstractFileByPath(path)) throw error; }
      return path;
    });
  }
  async detail(book) {
    const path=this.pathFor(book), content=await this.store.read(path), notes=parseNotes(content);
    let original=content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/,"");
    for(const note of notes) original=original.replace(note.block,"");
    // Legacy excerpts remain in their original file and are always available in detail.
    original=original.trim();
    return {book,path,content,notes:notes.reverse(),original,preview:excerpt(original,500)};
  }
  async appendNote(book, text, kind="reflection", id=uid(), finish=false) {
    const latest=(await this.list()).find(item=>String(item.id)===String(book.id));
    if(!latest) throw new Error("这本书已被移除，请刷新图书馆。");
    const normalized=String(text).replace(/\r\n/g,"\n").trim();
    const note={id,kind,text:normalized,date:dateKey(),time:clockTime()};
    const block=noteBlock(note), path=await this.ensureNote(latest);
    await this.store.enqueue(path,async()=>{
      const file=this.store.vault.getAbstractFileByPath(path);
      await this.store.vault.process(file,content=>{
        const found=parseNotes(content).filter(item=>item.id===id);
        if(found.length) {
          if(found.length!==1 || found[0].text!==normalized || found[0].kind!==kind) throw new Error("本次记录已保存但内容发生变化，请重新打开后补充。");
          return content;
        }
        return `${content.trimEnd()}\n\n${block}\n`;
      });
    });
    // Archive only after the reflection is safely in Markdown. A retry uses the same block id.
    if(finish) await this.workbench.change(state=>{
      const current=state.books.find(item=>String(item.id)===String(book.id));
      if(!current) throw new Error("心得已保存，书目已被移除，请刷新确认。");
      current.status="已读"; current.finishedAt=current.finishedAt || dateKey(); if(Number(current.total)>0) current.current=Number(current.total);
    });
    return path;
  }
  async updateNote(book, note, text) {
    const path=this.pathFor(book), block=noteBlock({...note,text});
    await this.store.enqueue(path,async()=>{
      const file=this.store.vault.getAbstractFileByPath(path); if(!file) throw new Error("书笔记已移动，请从原文确认路径。");
      await this.store.vault.process(file,content=>{
        const matches=parseNotes(content).filter(item=>item.id===note.id);
        if(matches.length!==1 || matches[0].block!==note.block) throw new Error("这条心得已在别处修改。输入已保留，请刷新后再试。");
        return content.replace(note.block,()=>block);
      });
    });
    return path;
  }
}
module.exports={LibraryStore,STATUSES,NOTE_KINDS,bookView,parseNotes,noteBlock,coverPath};
