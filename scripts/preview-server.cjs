"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const allowed = new Map([["/","design/index.html"],["/design/","design/index.html"],["/design/index.html","design/index.html"],["/design/preview.js","design/preview.js"],["/design/icons.js","design/icons.js"],["/styles.css","styles.css"]]);
function createServer() {
  return http.createServer((req,res) => {
    const key = new URL(req.url,"http://localhost").pathname;
    // The server cannot expose vault files, configuration, or repository data.
    const relative = allowed.get(key);
    if (!relative) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(relative);
    res.writeHead(200,{"Content-Type":ext === ".js" ? "text/javascript; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : "text/html; charset=utf-8","Cache-Control":"no-store"});
    fs.createReadStream(path.join(root,relative)).pipe(res);
  });
}
if(require.main === module) createServer().listen(4176,"127.0.0.1",() => console.log("Preview: http://127.0.0.1:4176/design/"));
module.exports = { createServer };
