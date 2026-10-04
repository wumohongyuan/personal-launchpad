"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const esbuild=require("esbuild");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,".."),out=path.join(root,"test-results");fs.mkdirSync(out,{recursive:true});
(async()=>{
  const bundle=await esbuild.build({stdin:{contents:'export {personalLibraryWidget} from "./src/personal/library-widget"; export {PersonalServices} from "./src/personal/services";',resolveDir:root,loader:"ts"},bundle:true,format:"cjs",platform:"browser",external:["obsidian"],write:false});
  const browser=await chromium.launch({headless:true,channel:"msedge"});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:980},timezoneId:"Asia/Shanghai"});const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.setContent('<!doctype html><html><head></head><body><div class="hp-dashboard hp-root"><article class="hp-card" id="library-a"><div class="hp-card-header">我的图书馆<span class="subtitle"></span></div><div class="hp-card-body"></div></article><article class="hp-card" id="library-b"><div class="hp-card-header">在读的书<span class="subtitle"></span></div><div class="hp-card-body"></div></article></div></body></html>');
    await page.addStyleTag({content:fs.readFileSync(path.join(root,"styles.css"),"utf8")+"\n"+fs.readFileSync(path.join(root,"src/personal/library.css"),"utf8")+"\n"+fs.readFileSync(path.join(root,"src/personal/personal.css"),"utf8")+"\n"+fs.readFileSync(path.join(root,"src/personal/simplified-controls.css"),"utf8")});
    await page.addStyleTag({content:':root{--background-primary:#fff;--background-primary-alt:#f7f8f5;--background-secondary:#eef1eb;--background-modifier-border:#dce2d9;--text-normal:#273b2e;--text-muted:#647366;--text-error:#a02c36;--interactive-normal:#f4f6f1;--interactive-hover:#e8eee2;font:14px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}body{margin:0;background:#f6f7f3;color:var(--text-normal)}button,input,textarea,select{font:inherit}button,select{border:1px solid var(--background-modifier-border);background:var(--interactive-normal);color:var(--text-normal);cursor:pointer}input,textarea{color:var(--text-normal);background:var(--background-primary);border:1px solid var(--background-modifier-border)}.hp-dashboard{max-width:1300px;margin:20px auto;padding:0 16px}.hp-card{height:690px;margin-bottom:24px;--hp-accent:#427257}.hp-card-header{justify-content:space-between}.modal{border:1px solid var(--background-modifier-border);border-radius:14px;padding:24px;width:min(550px,calc(100vw - 24px));max-height:90vh;overflow:auto;background:var(--background-primary);color:var(--text-normal)}.modal::backdrop{background:#20302466}.modal h2{margin:0 0 20px;font-size:21px}.hp-personal-form textarea{min-height:150px}.hp-personal-form button{min-height:42px;padding:8px 15px;border-radius:8px}.mod-cta{background:#427257;color:#fff}.theme-dark{--background-primary:#242c25;--background-primary-alt:#1b231d;--background-secondary:#202a22;--background-modifier-border:#3b4a3d;--text-normal:#e5ece2;--text-muted:#b1c0b2;--interactive-normal:#303d32;--interactive-hover:#3c4b3e;background:#19211b}'});
    await page.evaluate(()=>{
      const proto=HTMLElement.prototype;
      proto.createEl=function(tag,options={}){const node=document.createElement(tag);if(options.cls)node.className=options.cls;if(options.text)node.textContent=options.text;if(options.value!==undefined)node.value=options.value;if(options.type)node.type=options.type;for(const[k,v]of Object.entries(options.attr||{}))node.setAttribute(k,v);this.appendChild(node);return node;};
      proto.createDiv=function(options){return this.createEl("div",typeof options==="string"?{cls:options}:options);};proto.createSpan=function(options){return this.createEl("span",options);};proto.addClass=function(...names){this.classList.add(...names);};proto.setText=function(value){this.textContent=value;};proto.empty=function(){this.replaceChildren();};
      class TFile{constructor(path,content){Object.assign(this,{path,content,basename:path.split("/").pop().replace(/\.md$/,""),extension:path.split(".").pop(),stat:{mtime:1}});}}
      class Modal{constructor(app){this.app=app;this.modalEl=document.createElement("dialog");this.modalEl.className="modal";this.titleEl=this.modalEl.createEl("h2");this.contentEl=this.modalEl.createDiv();document.body.appendChild(this.modalEl);}open(){this.onOpen();this.modalEl.showModal();}close(){this.onClose();this.modalEl.close();this.modalEl.remove();}}
      class Vault{constructor(){this.files=new Map();this.refs=[];this.failWrites=false;}on(name,fn){const ref={name,fn};this.refs.push(ref);return ref;}offref(ref){this.refs=this.refs.filter(item=>item!==ref);}emit(name){this.refs.filter(ref=>ref.name===name).forEach(ref=>ref.fn());}getAbstractFileByPath(path){return this.files.get(path)||null;}getMarkdownFiles(){return [...this.files.values()].filter(file=>file instanceof TFile&&file.extension==="md");}async createFolder(path){if(this.files.has(path))throw Error("exists");this.files.set(path,{path,children:[]});}async create(path,content){if(this.failWrites)throw Error("测试写入失败");if(this.files.has(path))throw Error("exists");const file=new TFile(path,content);this.files.set(path,file);this.emit("create");return file;}async read(file){return file.content;}async cachedRead(file){return file.content;}async process(file,fn){if(this.failWrites)throw Error("测试写入失败");file.content=fn(file.content);this.emit("modify");return file.content;}}
      const vault=new Vault();window.fixture={vault,app:{vault,workspace:{getLeaf(){return {openFile:async(file,options)=>{window.fixture.opened={path:file.path,options};}};}},loadLocalStorage:()=>null,saveLocalStorage:()=>{}},notices:[]};
      window.mockObsidian={TFile,Modal,Notice:class{constructor(value){window.fixture.notices.push(value);}},Setting:class{},setIcon:(node,name)=>{node.textContent=name==="plus"?"＋":name==="search"?"⌕":"↗";}};
    });
    await page.evaluate(code=>{const module={exports:{}};new Function("require","module",code)(name=>{if(name!=="obsidian")throw Error(name);return window.mockObsidian;},module);window.nativeLibrary=module.exports;},bundle.outputFiles[0].text);
    await page.evaluate(async()=>{
      const f=window.fixture;f.plugin={app:f.app,refreshViews:()=>{}};
      f.plugin.personal=new window.nativeLibrary.PersonalServices(f.plugin,{autoOpen:false,dailyFolder:"个人成长系统/日记",knowledgeFolder:"个人成长系统/知识库",reviewFolder:"个人成长系统/复盘",legacyFolder:"个人成长系统"});
      await f.plugin.personal.library.saveBook({id:"sample-first",title:"如何阅读一本书",author:"莫提默·艾德勒",status:"在读",current:50,total:200,category:"学习方法"});
      await f.plugin.personal.library.saveBook({id:"sample-second",title:"原子习惯",author:"詹姆斯·克利尔",status:"已读",current:200,total:200,category:"个人成长"});
      f.contexts=[];
      for(const [id,status]of[["library-a","全部"],["library-b","在读"]]){const host=document.getElementById(id),ctx={app:f.app,plugin:f.plugin,widget:{id},config:{status,category:"",displayCount:24},component:{},active:true,cleanups:[],actions:[],isAlive(){return this.active;},isEditing(){return false;},setSubtitle(text){host.querySelector(".subtitle").textContent=text;},addHeaderAction(icon,label,callback){this.actions.push({label,callback});return document.createElement("button");},registerCleanup(callback){this.cleanups.push(callback);}};f.contexts.push(ctx);await window.nativeLibrary.personalLibraryWidget.render(host.querySelector(".hp-card-body"),ctx);}
    });
    const first=page.locator("#library-a"),second=page.locator("#library-b");
    assert.equal(await first.locator(".hp-pl-book").count(),2);assert.equal(await second.locator(".hp-pl-book").count(),1);
    await first.getByRole("button",{name:"添加书籍",exact:true}).click();let modal=page.getByRole("dialog");
    await modal.getByLabel("书名",{exact:true}).fill("读完，留一点自己的理解");await modal.getByText("补充书籍资料（可选）",{exact:true}).click();await modal.getByLabel("作者",{exact:true}).fill("阅读测试");await modal.getByLabel("阅读状态",{exact:true}).selectOption("在读");await modal.getByLabel("分类",{exact:true}).fill("文学");await modal.getByLabel("总页数",{exact:true}).fill("180");await modal.getByRole("button",{name:"保存",exact:true}).click();
    await first.getByRole("heading",{name:"读完，留一点自己的理解",exact:true}).waitFor();await second.getByRole("button",{name:"打开《读完，留一点自己的理解》",exact:true}).waitFor();
    await first.getByRole("button",{name:"读完，写心得",exact:true}).click();modal=page.getByRole("dialog");const text="一本书读完之后，我想先写出自己的理解。\n\n明天可以试试：读两页，再讲给自己听。";await modal.getByRole("textbox").fill(text);
    await page.evaluate(()=>window.fixture.vault.failWrites=true);await modal.getByRole("button",{name:"保存",exact:true}).click();await modal.getByRole("alert").filter({hasText:"测试写入失败"}).waitFor();
    await page.evaluate(()=>window.fixture.vault.emit("modify"));await page.waitForTimeout(350);assert.equal(await modal.getByRole("textbox").inputValue(),text);
    await page.evaluate(()=>window.fixture.vault.failWrites=false);await modal.getByRole("button",{name:"保存",exact:true}).click();await first.locator(".hp-pl-note .hp-pl-prose").filter({hasText:"一本书读完之后"}).waitFor();
    await page.waitForTimeout(400);assert.equal(await second.locator(".hp-pl-book").count(),1);
    await first.locator(".hp-pl-note").getByRole("button",{name:"编辑",exact:true}).click();await page.getByRole("dialog").getByLabel("内容",{exact:true}).fill(text+"\n\n补充：记录让我读得更认真。");await page.getByRole("dialog").getByRole("button",{name:"保存",exact:true}).click();
    await first.locator(".hp-pl-note").getByRole("button",{name:"提炼成知识",exact:true}).click();await page.getByRole("dialog").getByLabel("以后找得到的标题",{exact:true}).fill("读完一本书之后的小行动");await page.getByRole("dialog").getByRole("button",{name:"保存",exact:true}).click();
    const knowledge=await page.evaluate(()=>[...window.fixture.vault.files.values()].find(file=>file.path.endsWith("读完一本书之后的小行动.md"))?.content);assert.match(knowledge,/来源：\[\[个人成长系统\/书库\/读完，留一点自己的理解.md\]\]/);
    await first.getByRole("button",{name:"打开书笔记",exact:true}).click();assert.equal(await page.evaluate(()=>window.fixture.opened.options.state.mode),"preview");
    await page.evaluate(()=>document.getElementById("library-b").style.display="none");
    for(const width of [375,768,1440]){
      await page.setViewportSize({width,height:980});await page.waitForTimeout(300);
      assert.ok(await first.evaluate(node=>node.scrollWidth-node.clientWidth<=1),`${width}px card overflow`);
      assert.ok(await first.locator(".hp-personal-library").evaluate(node=>node.scrollWidth-node.clientWidth<=1),`${width}px widget overflow`);
      await first.locator(".hp-personal-library").evaluate(node=>node.scrollTop=0);
      await page.screenshot({path:path.join(out,`native-library-detail-${width}.png`),fullPage:true});
      await first.getByRole("button",{name:"回到书架",exact:true}).click();await page.waitForTimeout(300);
      await page.screenshot({path:path.join(out,`native-library-shelf-${width}.png`),fullPage:true});
      await first.getByRole("button",{name:"打开《读完，留一点自己的理解》",exact:true}).click();await page.waitForTimeout(250);
      await first.getByRole("button",{name:"写阅读记录",exact:true}).click();await page.getByRole("dialog").getByLabel("阅读记录",{exact:true}).fill("一句书中的话，和一点自己的感受。");await page.waitForTimeout(250);await page.screenshot({path:path.join(out,`native-library-modal-${width}.png`),fullPage:false});await page.getByRole("dialog").getByRole("button",{name:"取消",exact:true}).click();
    }
    await first.getByRole("button",{name:"回到书架",exact:true}).click();await page.evaluate(()=>document.body.classList.add("theme-dark"));await page.waitForTimeout(350);await page.screenshot({path:path.join(out,"native-library-dark.png"),fullPage:true});
    await page.emulateMedia({reducedMotion:"reduce"});assert.equal(await first.locator(".hp-pl-book").first().evaluate(node=>getComputedStyle(node).animationName),"none");
    const refs=await page.evaluate(()=>{window.fixture.contexts.forEach(ctx=>{ctx.active=false;ctx.cleanups.forEach(fn=>fn());});return window.fixture.vault.refs.length;});assert.equal(refs,0);assert.deepEqual(errors,[]);
    console.log("PASS native Home Pages library protocol, actual PersonalServices Modal, multiple instances, failure retention, archived reflection, note editing, source backlinks, reading mode, lifecycle cleanup, 375/768/1440 screenshots, dark and reduced motion");
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
