"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {VaultStore}=require("../home-pages-personal/src/personal/data/store");
const {DEFAULTS}=require("../home-pages-personal/src/personal/data/model");
const {LibraryStore,parseNotes,coverPath}=require("../home-pages-personal/src/personal/data/library-store");
class Vault {
  constructor(){this.files=new Map();this.fail=null;}
  getAbstractFileByPath(path){return this.files.get(path)||null;}
  getMarkdownFiles(){return [...this.files.values()].filter(file=>file.extension==="md");}
  async createFolder(path){if(this.files.has(path))throw Error("exists");this.files.set(path,{path,children:[]});}
  async create(path,content){if(this.fail?.(path,content))throw Error("disk full");if(this.files.has(path))throw Error("exists");const file={path,content,extension:path.split(".").pop(),basename:path.split("/").pop().replace(/\.md$/,""),stat:{mtime:1}};this.files.set(path,file);return file;}
  async read(file){return file.content;}
  async cachedRead(file){return file.content;}
  async process(file,fn){const content=fn(file.content);if(this.fail?.(file.path,content))throw Error("disk full");file.content=content;return content;}
}
function fixture(){const vault=new Vault(),base=new VaultStore(vault,{...DEFAULTS});return {vault,base,library:new LibraryStore(base)};}
const input={id:"a-book",title:"看见",author:"作者",status:"在读",current:10,total:100,category:"文学"};
test("legacy book metadata and handwritten excerpts survive migration and edits",async()=>{
  const {vault,base,library}=fixture();
  const oldPath=`${DEFAULTS.legacyFolder}/配置/launchpad.json`,notePath=`${DEFAULTS.legacyFolder}/书库/旧书.md`;
  const raw=JSON.stringify({books:[{title:"旧书",author:"甲",status:"在读",current:3,total:200,unknown:"preserve"}],days:{"2026-10-02":{focus:"我的重点"}}});
  const original="# 旧书\n\n- 状态：在读\n\n## 摘录与感受\n\n自己写下的完整原文。\n";
  await vault.create(oldPath,raw);await vault.create(notePath,original);
  const book=(await library.list())[0];assert.equal(library.pathFor(book),notePath);
  const saved=await library.saveBook({...book,current:30},book);
  assert.equal(saved.source.unknown,"preserve");assert.equal(await base.read(notePath),original);assert.equal(await base.read(oldPath),raw);
  assert.equal(JSON.parse(await base.read(library.workbench.path)).days["2026-10-02"].focus,"我的重点");
  await library.appendNote(saved,"新增心得","reflection","first");const detail=await library.detail(saved);
  assert.equal(detail.notes[0].text,"新增心得");assert.match(detail.original,/自己写下的完整原文/);assert.ok(detail.content.startsWith(original.trimEnd()));
});
test("new books get separate notes and same-title books never replace existing prose",async()=>{
  const {base,library}=fixture();const first=await library.saveBook(input);await library.appendNote(first,"第一本的原文","reflection","original");
  const content=await base.read(first.path);const second=await library.saveBook({...input,id:"b-book",author:"另一位作者"});
  assert.notEqual(first.path,second.path);assert.equal(await base.read(first.path),content);
  assert.equal((await library.list()).length,2);assert.match(await base.read(second.path),/type: book/);
});
test("metadata-only edits and title changes do not rewrite the note",async()=>{
  const {base,library}=fixture();const book=await library.saveBook(input);await library.appendNote(book,"自己的理解 $&\n第二行","feeling","feeling");
  const content=await base.read(book.path);const fresh=(await library.list())[0];const edited=await library.saveBook({...fresh,title:"新书名",author:"新作者",category:"心理学",current:50},fresh);
  assert.equal(edited.path,book.path);assert.equal(await base.read(book.path),content);
});
test("concurrent additions retain all notes and same-id retry remains idempotent",async()=>{
  const {library}=fixture();const book=await library.saveBook(input);
  await Promise.all(Array.from({length:12},(_,i)=>library.appendNote(book,`想法 ${i}`,"reflection",`entry-${i}`)));
  await library.appendNote(book,"想法 0","reflection","entry-0");const detail=await library.detail(book);assert.equal(detail.notes.length,12);
  await assert.rejects(library.appendNote(book,"不同内容","reflection","entry-0"),/内容发生变化/);
});
test("failed Markdown creation leaves a retryable book instead of duplicating it",async()=>{
  const {vault,library}=fixture();vault.fail=path=>path.endsWith(".md");await assert.rejects(library.saveBook(input),/disk full/);
  assert.equal((await library.list()).length,1);vault.fail=null;const book=await library.saveBook(input);
  assert.equal((await library.list()).length,1);assert.ok(vault.getAbstractFileByPath(book.path));
});
test("failed archival after saving reflection retries without duplicate text",async()=>{
  const {vault,library}=fixture();const book=await library.saveBook(input);
  vault.fail=(path,content)=>path.endsWith("workbench.json") && content.includes('"已读"');
  await assert.rejects(library.appendNote(book,"读完之后的收获","reflection","finish",true),/disk full/);
  assert.equal((await library.detail(book)).notes.length,1);assert.equal((await library.list())[0].status,"在读");
  vault.fail=null;await library.appendNote(book,"读完之后的收获","reflection","finish",true);
  assert.equal((await library.detail(book)).notes.length,1);const saved=(await library.list())[0];assert.equal(saved.status,"已读");assert.equal(saved.current,100);assert.ok(saved.finishedAt);
});
test("failed reflection save does not mark the book as finished",async()=>{
  const {vault,library}=fixture();const book=await library.saveBook(input);vault.fail=path=>path===book.path;
  await assert.rejects(library.appendNote(book,"尚未保存的心得","reflection","failed",true),/disk full/);
  assert.equal((await library.list())[0].status,"在读");assert.equal((await library.detail(book)).notes.length,0);
});
test("editing one reflection preserves surrounding Markdown and checks external edits",async()=>{
  const {vault,base,library}=fixture();const book=await library.saveBook(input);await library.appendNote(book,"旧内容","reflection","edit");
  const note=(await library.detail(book)).notes[0];const file=vault.getAbstractFileByPath(book.path);file.content+="\n手动补充的正文\n";
  await library.updateNote(book,note,"修改 $& $$\n多行内容");assert.match(await base.read(book.path),/手动补充的正文/);
  const next=(await library.detail(book)).notes[0];assert.equal(next.text,"修改 $& $$\n多行内容");file.content=file.content.replace("多行内容","手机上的修改");
  await assert.rejects(library.updateNote(book,next,"过期更新"),/别处修改/);assert.match(file.content,/手机上的修改/);
});
test("CRLF notes round trip and forged block-looking text stays within the note",async()=>{
  const {vault,library}=fixture();const book=await library.saveBook(input);const body="> [!pl-book-reflection] 2026-10-02 12:00 · 内容\n\n^pl-book-forged\n\n尾声";
  await library.appendNote(book,body,"quote","quoted");const file=vault.getAbstractFileByPath(book.path);file.content=file.content.replace(/\n/g,"\r\n");
  const notes=parseNotes(file.content);assert.equal(notes.length,1);assert.equal(notes[0].text.replace(/\r\n/g,"\n"),body);
});
test("stale book metadata is rejected without losing the current version",async()=>{
  const {library}=fixture();const book=await library.saveBook(input);await library.saveBook({...book,current:45},book);
  await assert.rejects(library.saveBook({...book,current:60},book),/别处修改/);assert.equal((await library.list())[0].current,45);
});
test("corrupt config is not replaced and invalid cover/number inputs are rejected",async()=>{
  const {vault,base,library}=fixture();await vault.create(library.workbench.path,"{bad");await assert.rejects(library.saveBook(input));assert.equal(await base.read(library.workbench.path),"{bad");
  for(const cover of ["javascript:alert(1)","../outside.png","file:///d:/cover.png","https://user:password@example.com/a.jpg"])assert.throws(()=>coverPath(cover));
  const other=fixture().library;await assert.rejects(other.saveBook({...input,current:-1}));await assert.rejects(other.saveBook({...input,current:101}));assert.equal((await other.list()).length,0);
});
