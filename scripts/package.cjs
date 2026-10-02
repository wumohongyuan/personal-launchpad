"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const destination = path.join(root,"release","personal-launchpad");
fs.mkdirSync(destination,{recursive:true});
for (const file of ["main.js","manifest.json","styles.css","LICENSE","LICENSE-MIT-legacy","THIRD_PARTY_NOTICES.md","README.md"]) fs.copyFileSync(path.join(root,file),path.join(destination,file));
console.log(destination);
