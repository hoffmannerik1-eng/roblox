import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const KEY=process.env.OPENAI_API_KEY;
const MODEL=process.env.MODEL||'gpt-4.1';
const MIN_SCORE=Number(process.env.MIN_SCORE||7);
const MAX_TRIES=Math.min(3,Math.max(1,Number(process.env.MAX_TRIES||3)));
const ROOT=process.cwd();
const GAMES_DIR=path.join(ROOT,'generated-games');
const CATALOG=path.join(ROOT,'games.json');
if(!KEY)throw new Error('OPENAI_API_KEY fehlt. Lege ihn in GitHub unter Settings → Secrets and variables → Actions an.');
fs.mkdirSync(GAMES_DIR,{recursive:true});
const log=(...a)=>console.log(new Date().toLocaleTimeString('de-DE'),...a);
const slug=s=>String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'neues-spiel';
const readCatalog=()=>{try{const v=JSON.parse(fs.readFileSync(CATALOG,'utf8'));return Array.isArray(v)?v:[]}catch{return []}};
function jsonFrom(text){const clean=String(text).replace(/^\uFEFF/,'').replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();const a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a<0||b<a)throw new Error('KI lieferte kein gültiges JSON.');return JSON.parse(clean.slice(a,b+1))}
async function ask(input,{search=false}={}){
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,input:[{role:'user',content:input}],...(search?{tools:[{type:'web_search'}]}:{})})});
 if(!response.ok)throw new Error('OpenAI '+response.status+': '+(await response.text()).slice(0,500));
 const data=await response.json();return (data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
}
async function research(existing,wanted){
 const list=existing.map(g=>g.title+' ('+g.cat+')').join('; ')||'noch keine';
 const raw=await ask('Du bist Game-Designer. Recherchiere aktuelle Trends bei Browser- und Casual-Games. Erfinde ein originelles, nicht kopiertes Spielkonzept, das noch nicht in dieser Galerie vorkommt. Bereits vorhanden: '+list+'. Gewünschter Typ: '+wanted+'. Antworte nur als JSON mit title,slug,type ("2d" oder "3d"),genre,trend,description,mechanics (Array).',{search:true});
 const c=jsonFrom(raw);c.title=String(c.title||'Neues Spiel').slice(0,60);c.slug=slug(c.slug||c.title);c.type=String(c.type).toLowerCase()==='3d'?'3d':'2d';c.genre=String(c.genre||'Arcade').slice(0,40);c.description=String(c.description||'Ein neues Browser-Spiel.').slice(0,240);c.mechanics=Array.isArray(c.mechanics)?c.mechanics.slice(0,8):[];
 if(existing.some(g=>g.slug===c.slug))c.slug+='-'+Date.now().toString(36).slice(-4);
 if(wanted==='2d'||wanted==='3d')c.type=wanted;
 return c;
}
async function build(c,previous){
 const prompt='Erstelle eine vollständige, direkt spielbare und eigenständige HTML-Datei für ein hochwertiges '+c.type.toUpperCase()+'-Browserspiel. Titel: '+c.title+'. Genre: '+c.genre+'. Beschreibung: '+c.description+'. Mechaniken: '+c.mechanics.join(', ')+'. Anforderungen: Startmenü, klare Anleitung, Punktestand, Game-Over und Neustart, steigender Schwierigkeitsgrad, Highscore in localStorage (try/catch), Tastatur- und Touch-Steuerung, responsive Canvas, gut gestaltete Grafik und Animationen, keine TODOs/Platzhalter. '+(c.type==='3d'?'Nutze WebGL direkt oder three.js r128 per CDN.':'Keine externen Bibliotheken.')+(previous?' Verbessere diese Version. Probleme: '+previous.notes+'\nVorherige Version:\n'+previous.html:'')+' Gib ausschließlich den vollständigen HTML-Code aus.';
 const out=await ask(prompt);const match=out.match(/```(?:html)?\s*([\s\S]*?)```/i);const html=(match?match[1]:out).trim();
 if(!/^<!doctype html/i.test(html)||!/<canvas\b/i.test(html)||!/<script\b/i.test(html))throw new Error('Die KI-Ausgabe ist keine vollständige HTML-Spiel-Datei.');
 return html;
}
async function test(html){
 const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const errors=[];
 try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:720});
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setContent(html,{waitUntil:'networkidle0',timeout:30000});await new Promise(r=>setTimeout(r,1200));
  const before=Buffer.from(await page.screenshot({type:'png'}));
  const start=await page.$('#start');if(start)await start.click().catch(()=>{});
  for(const key of ['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD']){await page.keyboard.press(key).catch(()=>{});await new Promise(r=>setTimeout(r,100))}
  await new Promise(r=>setTimeout(r,1200));const after=Buffer.from(await page.screenshot({type:'png'}));
  const changed=!before.equals(after);const blank=after.length<5000;
  return {errors:[...new Set(errors)].slice(0,10),shot:after,changed,blank};
 }finally{await browser.close()}
}
async function review(c,shot){
 const raw=await ask([{type:'input_text',text:'Bewerte streng die sichtbare Browser-Spiel-Vorschau von '+c.title+' ('+c.genre+'). Ist es fertig, lesbar und optisch ansprechend? JSON: {"score":1 bis 10,"issues":"konkrete Probleme"}'},{type:'input_image',image_url:'data:image/png;base64,'+shot.toString('base64')}]);
 const r=jsonFrom(raw);return {score:Number(r.score)||1,issues:String(r.issues||'')};
}
async function run(type='auto'){
 const catalog=readCatalog();log('Vorhandene Spiele:',catalog.length);
 const concept=await research(catalog,type);log('Konzept:',concept.title,concept.type,concept.genre);
 let previous=null,best=null;
 for(let n=1;n<=MAX_TRIES&&!best;n++){
  log('Erstelle Version',n);const html=await build(concept,previous);
  const result=await test(html);const rating=result.blank?{score:1,issues:'Leere Vorschau'}:await review(concept,result.shot);
  log('Testfehler:',result.errors.length,'Bild geändert:',result.changed,'Bewertung:',rating.score+'/10');
  if(!result.errors.length&&result.changed&&!result.blank&&rating.score>=MIN_SCORE)best={html,shot:result.shot,score:rating.score};
  else previous={html,notes:[result.errors.join(' | '),result.changed?'':'Spiel reagiert nicht auf Eingaben',rating.issues].filter(Boolean).join('; ')};
 }
 if(!best)throw new Error('Qualitätsprüfung nicht bestanden. Es wurde nichts veröffentlicht.');
 const dir=path.join(GAMES_DIR,concept.slug);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'index.html'),best.html);fs.writeFileSync(path.join(dir,'thumb.png'),best.shot);
 const item={id:'autopilot-'+concept.slug,slug:concept.slug,title:concept.title,desc:concept.description,icon:concept.type==='3d'?'🧊':'🎮',cat:concept.genre,htmlPath:'generated-games/'+concept.slug+'/index.html',thumb:'generated-games/'+concept.slug+'/thumb.png',author:'GAME AUTOPILOT',created:Date.now(),plays:0,type:concept.type,trend:concept.trend,score:best.score};
 catalog.unshift(item);fs.writeFileSync(CATALOG,JSON.stringify(catalog,null,2)+'\n');
 log('Veröffentlicht:',concept.title,'Note:',best.score+'/10');
}
const requested=process.argv[2]||'auto';
if(!['auto','2d','3d'].includes(requested))throw new Error('Modus muss auto, 2d oder 3d sein.');
await run(requested);
