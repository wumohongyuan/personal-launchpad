"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{createServer}=require("../scripts/preview-server.cjs");
const root=path.resolve(__dirname,".."),out=path.join(root,"test-results");fs.mkdirSync(out,{recursive:true});
(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({headless:true,channel:process.env.HOME_PAGES_TEST_BROWSER||"msedge"});
  const result=[];
  try {
    for(const width of [375,768,1024,1440]) {
      const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<1100,timezoneId:"Asia/Shanghai",reducedMotion:"reduce"});
      const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")console.error(message.text());});
      await page.goto(`http://127.0.0.1:${server.address().port}/design/`);await page.waitForFunction(()=>!!window.__hpPreview);
      const clock=page.locator(".hp-hero-clock");assert.match((await clock.textContent()).trim(),/^\d{2}:\d{2}:\d{2}$/);
      const before=await clock.textContent();await page.waitForFunction(value=>document.querySelector('.hp-hero-clock').textContent!==value,before,{timeout:2500});
      for(const name of ["工作台","日记","图书馆","账本","成长","知识库"]) {
        await page.locator(".hp-tabs").getByRole("button",{name,exact:true}).click();await page.waitForTimeout(260);
        assert.equal(await page.getByText("组件渲染失败，请检查配置",{exact:true}).count(),0,`${width}/${name} render failure`);
        const geometry=await page.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth,grid:document.querySelector('.hp-grid').getBoundingClientRect().width,cards:[...document.querySelectorAll('.hp-grid>.hp-card')].map(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}))}));
        assert.ok(geometry.body<=geometry.viewport+1,`${width}/${name} body overflow`);
        if(width<=720)for(const card of geometry.cards)assert.ok(Math.abs(card.width-geometry.grid)<2,`${width}/${name} narrow card`);
        for(const card of geometry.cards)assert.ok(card.scroll<=card.client+1,`${width}/${name} card overflow`);
        if(["工作台","图书馆","账本"].includes(name))await page.screenshot({path:path.join(out,`v3-${{工作台:"home",图书馆:"library",账本:"finance"}[name]}-${width}.png`)});
      }
      const darkBackground=await page.locator('.hp-view').evaluate(el=>getComputedStyle(el).backgroundColor);
      await page.getByRole("button",{name:"切换明暗",exact:true}).click();await page.locator(".hp-tabs").getByRole("button",{name:"账本",exact:true}).click();
      assert.notEqual(await page.locator('.hp-view').evaluate(el=>getComputedStyle(el).backgroundColor),darkBackground,'Theme changes actual workbench surfaces');
      await page.screenshot({path:path.join(out,`v3-finance-light-${width}.png`)});
      await page.locator(".hp-tabs").getByRole("button",{name:"随手记",exact:true}).click();
      await page.getByRole('dialog').getByLabel('想记下的内容',{exact:true}).waitFor();
      await page.waitForFunction(()=>document.activeElement?.tagName==='TEXTAREA'&&!!document.activeElement.closest('.hp-personal-form'));
      assert.deepEqual(errors,[],`${width} runtime errors`);result.push({width,pages:6,clockSeconds:true,overflow:false,errors});await context.close();
    }
    fs.writeFileSync(path.join(out,"v3-release-browser.json"),JSON.stringify(result,null,2));console.log("PASS actual published bundle: all 6 pages at 375/768/1024/1440, touch, dark mode, seconds clock and zero runtime errors.");
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
