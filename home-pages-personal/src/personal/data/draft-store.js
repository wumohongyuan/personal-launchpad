"use strict";
const {safeFolder,uid}=require("./model");
const queues=new WeakMap();
function hash(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function parse(raw){const v=JSON.parse(raw);if(!v||v.version!==1||typeof v.key!=="string"||typeof v.text!=="string"||typeof v.device!=="string"||typeof v.updatedAt!=="string")throw Error("草稿文件格式无效，原文件未改动。");return v;}
class DraftStore {
 constructor(store,device,name){this.store=store;this.device=device;this.name=name;}
 get folder(){return `${safeFolder(this.store.settings.legacyFolder)}/草稿`;}
 async save(key,payload){
  const vault=this.store.vault,path=`${this.folder}/${this.device}/${hash(key)}.json`;
  if(!queues.has(vault))queues.set(vault,new Map());const queue=queues.get(vault);
  const job=(queue.get(path)||Promise.resolve()).catch(()=>{}).then(async()=>{
   const record={version:1,key,device:this.device,deviceName:this.name,...payload,updatedAt:new Date().toISOString()};
   const update=raw=>{const previous=raw?parse(raw):null;if(previous&&previous.key!==key)throw Error("草稿路径冲突，内容仍保留在本机。");return JSON.stringify(record,null,2)+"\n";};
   let file=vault.getAbstractFileByPath(path);
   if(!file){await this.store.ensureFolder(path.slice(0,path.lastIndexOf("/")));try{await vault.create(path,update(null));return;}catch(error){file=vault.getAbstractFileByPath(path);if(!file)throw error;}}
   await vault.process(file,update);
  });queue.set(path,job);job.finally(()=>{if(queue.get(path)===job)queue.delete(path);}).catch(()=>{});return job;
 }
 async list(){const result=[];let unreadable=0;for(const file of this.store.vault.getFiles()){if(!file.path.startsWith(this.folder+"/")||!file.path.endsWith(".json"))continue;try{const value=parse(await this.store.vault.read(file));if(value.text.trim())result.push({...value,path:file.path});}catch{unreadable++;}}return {items:result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),unreadable};}
}
module.exports={DraftStore};
