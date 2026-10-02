import type { HomePage } from "../types";
import { createWidgetInstance as widget } from "../widgets/registry";

/** Starting pages only: saved layouts are never replaced by this template. */
export function createPersonalPages(): HomePage[] {
  const pages: HomePage[] = [
    {id:"personal-workbench",name:"工作台",widgets:[
      widget("hero",{w:12,h:3,config:{name:"",showGreeting:true,showMeta:true,showClock:true,showSeconds:true,showWeather:false,showVaultAge:false,showCountdown:false}}),
      // Preserve the upstream home composition before adding personal extensions.
      widget("recent",{w:4,h:6,config:{limit:6,sortBy:"mtime",showFolder:false}}),
      widget("pomodoro",{w:4,h:6}),
      // With native row auto-placement, these stack beside the two taller cards.
      widget("quicklinks",{w:4,h:3,config:{columns:3,pins:[{label:"日记",path:"个人成长系统/日记",icon:"notebook-pen"},{label:"知识",path:"个人成长系统/知识库",icon:"library"},{label:"资料",path:"个人成长系统",icon:"archive"}]}}),
      widget("countdown",{w:4,h:3,title:"值得期待的日子"}),
      widget("habit",{w:5,h:5,title:"习惯打卡",config:{habits:["记录","阅读","活动"],range:"year",storage:"plugin"}}),
      widget("kanban",{w:7,h:5,config:{source:"个人成长系统/行动看板.md",limit:60,hideDone:false}}),
      widget("personal-capture",{w:8,h:6,title:"随手记"}),
      widget("personal-finance",{w:4,h:6,title:"续费提醒",config:{mode:"subscriptions",displayCount:3}}),
      widget("personal-library",{w:6,h:5,title:"正在读",config:{status:"在读",displayCount:3}}),
      widget("personal-tasks",{w:6,h:5,title:"行动清单"})
    ]},
    {id:"personal-journal",name:"日记",widgets:[widget("personal-capture",{w:12,h:7,config:{defaultKind:"diary"}}),widget("personal-journal",{w:12,h:12,config:{mode:"history"}}),widget("personal-journal",{w:12,h:9,title:"想法收件箱",config:{mode:"inbox"}})]},
    {id:"personal-library",name:"图书馆",widgets:[widget("personal-library",{w:12,h:14,title:"我的图书馆",config:{status:"全部",displayCount:60}})]},
    {id:"personal-finance",name:"账本",widgets:[widget("personal-finance",{w:12,h:14,title:"账本与订阅",config:{mode:"overview"}})]},
    {id:"personal-growth",name:"成长",widgets:[widget("personal-growth",{w:6,h:9}),widget("personal-health",{w:6,h:9}),widget("personal-review",{w:12,h:12})]},
    {id:"personal-knowledge",name:"知识库",widgets:[widget("personal-knowledge",{w:12,h:13}),widget("onthisday",{w:6,h:7}),widget("note",{w:6,h:7,title:"固定一篇笔记"})]}
  ];
  for(const page of pages)page.widgets.forEach((widget,index)=>{widget.id=`${page.id}-${index}-${widget.kind}`;});
  // Moving capture below the upstream cards must not orphan device-local drafts.
  const capture=pages[0].widgets.find(widget=>widget.kind==="personal-capture");
  if(capture)capture.id="personal-workbench-1-personal-capture";
  return pages;
}
