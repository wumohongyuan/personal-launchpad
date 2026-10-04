"use strict";
const {advance,daysUntil}=require("./finance-store");
const {dateKey,validDate}=require("./model");
function schedule(subscriptions,today=dateKey(),days=365){
 if(!validDate(today)||!Number.isInteger(days)||days<1||days>366)throw Error("日期范围无效。");
 const events=[];
 for(const source of subscriptions){if(source.archived||!source.active)continue;let item={...source},iterations=0;
  while(daysUntil(today,item.nextDue)<days){
   if(++iterations>15000)throw Error("订阅账期过旧，请先调整下次到期日。");
   if(item.nextDue>=today)events.push({...item,date:item.nextDue});
   if(item.cycle==="once")break;
   const next=advance(item);if(next<=item.nextDue)throw Error("订阅账期无法推进。");item.nextDue=next;
  }
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
function overview(subscriptions,today=dateKey()){
 const events=schedule(subscriptions,today,30),active=subscriptions.filter(s=>s.active&&!s.archived);
 const sum=items=>{const result=items.reduce((n,s)=>n+s.amount,0);if(!Number.isSafeInteger(result))throw Error("汇总金额超出安全范围。");return result;};
 const annual=active.reduce((n,s)=>n+s.amount*({monthly:12,quarterly:4,yearly:1,weekly:52,once:0}[s.cycle]||0),0);
 if(!Number.isSafeInteger(annual))throw Error("汇总金额超出安全范围。");
 return {seven:sum(events.filter(s=>daysUntil(today,s.date)<7)),thirty:sum(events),monthly:Math.round(annual/12),overdue:sum(active.filter(s=>s.nextDue<today)),events};
}
const escapeText=text=>String(text).replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");
function fold(line){let result="",part="",bytes=0;const encoder=new TextEncoder();for(const char of line){const size=encoder.encode(char).length;if(bytes+size>75){result+=part+"\r\n";part=" ";bytes=1;}part+=char;bytes+=size;}return result+part;}
// RFC 5545: UTF-8 octet folding, CRLF, stable UIDs, local 09:00 alarms.
function calendar(subscriptions,today=dateKey(),stamp=new Date().toISOString()){
 const events=schedule(subscriptions,today,365),lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Personal Launchpad//Renewals//ZH","CALSCALE:GREGORIAN"];
 for(const item of events){const date=item.date.replace(/-/g,"");lines.push("BEGIN:VEVENT",`UID:${item.id}-${item.date}@personal-launchpad`,`DTSTAMP:${stamp.replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}`,`DTSTART:${date}T090000`,`DTEND:${date}T093000`,`SUMMARY:${escapeText("续费 · "+item.name)}`,`DESCRIPTION:${escapeText("预计费用 ¥"+(item.amount/100).toFixed(2)+"。以实际账单为准；缴费后请在个人空间登记。")}`,"TRANSP:TRANSPARENT","BEGIN:VALARM",`TRIGGER:${item.remindDays?"-P"+item.remindDays+"D":"PT0S"}`,"ACTION:DISPLAY",`DESCRIPTION:${escapeText(item.name+"续费提醒")}`,"END:VALARM","END:VEVENT");}
 lines.push("END:VCALENDAR");return lines.map(fold).join("\r\n")+"\r\n";
}
module.exports={schedule,overview,calendar};
