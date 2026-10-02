"use strict";
// Explicit vault target only. Personal data and plugin data.json are never replaced.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),input=process.argv[2];
if(!input||!path.isAbsolute(input)||process.argv.length!==3)throw Error("Usage: node scripts/install-local.cjs <absolute-vault-path>");
const vault=fs.realpathSync(input),config=path.join(vault,".obsidian"),plugin=path.join(config,"plugins","personal-launchpad");
if(!fs.statSync(config).isDirectory())throw Error("The target must be an existing Obsidian vault.");
for(const dir of [config,path.join(config,"plugins"),plugin])if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error("Symlinked plugin directories are not supported by this installer.");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
const expectedVersion=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")).version;
if(manifest.id!=="personal-launchpad"||manifest.version!==expectedVersion)throw Error("Build version does not match the source package.");
const enabledPath=path.join(config,"community-plugins.json"),oldEnabled=fs.existsSync(enabledPath)?fs.readFileSync(enabledPath,"utf8"):"[]";
const enabled=JSON.parse(oldEnabled);if(!Array.isArray(enabled)||enabled.some(value=>typeof value!=="string"))throw Error("community-plugins.json is invalid; nothing was changed.");
const stamp=new Date().toISOString().replace(/[:.]/g,"-"),backup=path.join(root,"backups",`plugin-before-v3-${stamp}-${crypto.randomBytes(3).toString("hex")}`);
fs.mkdirSync(backup,{recursive:true});
if(fs.existsSync(plugin))fs.cpSync(plugin,path.join(backup,"personal-launchpad"),{recursive:true,errorOnExist:true,force:false});
fs.writeFileSync(path.join(backup,"community-plugins.json"),oldEnabled,{flag:"wx"});
fs.mkdirSync(plugin,{recursive:true});
const names=["main.js","styles.css","manifest.json","LICENSE","LICENSE-MIT-legacy","THIRD_PARTY_NOTICES.md"];
for(const name of names){const source=fs.readFileSync(path.join(root,name)),destination=path.join(plugin,name),temp=destination+`.v3-${crypto.randomBytes(4).toString("hex")}.tmp`;fs.writeFileSync(temp,source,{flag:"wx"});fs.renameSync(temp,destination);if(!fs.readFileSync(destination).equals(source))throw Error(`Copy verification failed: ${name}`);}
if(!enabled.includes(manifest.id)){
  if(fs.existsSync(enabledPath)&&fs.readFileSync(enabledPath,"utf8")!==oldEnabled)throw Error("Enabled plugins changed during install; leave the existing list untouched.");
  enabled.push(manifest.id);const temp=enabledPath+`.v3-${crypto.randomBytes(4).toString("hex")}.tmp`;fs.writeFileSync(temp,JSON.stringify(enabled,null,2)+"\n",{flag:"wx"});fs.renameSync(temp,enabledPath);
}
console.log(JSON.stringify({version:manifest.version,installed:plugin,enabled:true,backup,reloadRequired:true},null,2));
