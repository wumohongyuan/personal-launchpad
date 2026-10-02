import { Notice } from "obsidian";
import type HomePagesPlugin from "../main";
const { dateKey } = require("./data/model.js");

/** Foreground reminders; no background service or remote notification provider. */
export class RenewalReminders {
  private checking=false;
  private errorShown=false;
  constructor(private plugin:HomePagesPlugin) {}
  private enabled():boolean {return this.plugin.active&&!!this.plugin.personal?.settings.renewalReminders&&document.visibilityState!=="hidden";}
  async check():Promise<void> {
    if(this.checking||!this.enabled())return;
    this.checking=true;
    try {
      const today=dateKey(),due=await this.plugin.personal.finance.due(today);
      if(!this.enabled())return;
      const key="personal-launchpad:renewal-alerts";
      const raw=this.plugin.app.loadLocalStorage(key);
      let seen:Record<string,string>={};
      try {const parsed=typeof raw==="string"?JSON.parse(raw):raw;if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))seen=parsed;}catch{/* Notification history can safely reset without touching the ledger. */}
      seen=Object.fromEntries(Object.entries(seen).filter(([,day])=>day===today));
      const fresh=due.filter((item:{id:string;nextDue:string})=>seen[`${item.id}:${item.nextDue}`]!==today);
      if(fresh.length) {
        const lines=fresh.slice(0,5).map((item:{name:string;amount:number;daysUntil:number;overdue:boolean})=>`${item.name} · ¥${(item.amount/100).toFixed(2)} · ${item.overdue?`已逾期 ${-item.daysUntil} 天`:item.daysUntil===0?"今天到期":`${item.daysUntil} 天后到期`}`);
        new Notice(`续费提醒\n${lines.join("\n")}${fresh.length>5?`\n另有 ${fresh.length-5} 项`:""}\n打开「账本」查看，缴费后点击「已缴费」。`,12000);
        for(const item of fresh)seen[`${item.id}:${item.nextDue}`]=today;
        this.plugin.app.saveLocalStorage(key,JSON.stringify(seen));
      }
      this.errorShown=false;
    }catch(error) {
      if(!this.errorShown&&this.enabled()){this.errorShown=true;new Notice(`续费提醒暂时无法读取：${error instanceof Error?error.message:"请检查账本资料"}`,8000);}
    }finally{this.checking=false;}
  }
}
