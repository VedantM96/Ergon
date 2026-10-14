import { animate, stagger, inView, hover, press, scroll, spring } from "./vendor/motion.js";

const enterEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const controlBindings = new WeakSet();
const scrollBindings = new WeakMap();
let driftItems = [];
let started = false;

function ready() {
  document.documentElement.classList.add("motion-ready");
  const underline = document.querySelector(".wordmark-sweep");
  if (!reduced() && underline) animate(underline, { transform:["scaleX(0)","scaleX(1)"] }, { duration:.38, easing:enterEase });
  const first = [document.querySelector(".rail"),document.querySelector(".topbar")].filter(Boolean);
  if (first.length && !reduced()) animate(first,{opacity:[0,1],transform:["translateY(8px)","translateY(0px)"]},{duration:.32,delay:stagger(.05),easing:enterEase});
  started = true;
  return Promise.resolve(true);
}
function reveal(elements) {
  const list = elements ? (elements instanceof Element ? [elements] : [...elements]) : [];
  if (!list.length) return;
  if (reduced()) { list.forEach(el=>{el.style.opacity="1";el.style.transform="none";}); return; }
  list.forEach((el,index)=>inView(el,()=>{
    animate(el,{opacity:[0,1],transform:["translateY(12px)","translateY(0px)"]},{duration:.34,delay:index*.05,easing:enterEase});
  }));
}
function sweep(highlightEls) {
  const list=[...highlightEls]; if (!list.length) return;
  if (reduced()) { list.forEach(el=>{const fill=el.querySelector(".hl-fill");if(fill)fill.style.transform="scaleX(1)";});return; }
  list.forEach(el=>{const fill=el.querySelector(".hl-fill");if(fill)fill.style.transform="scaleX(0)";});
  const fills=list.map(el=>el.querySelector(".hl-fill")).filter(Boolean);
  if(fills.length)animate(fills,{transform:["scaleX(0)","scaleX(1)"]},{duration:.46,delay:stagger(.055),easing:enterEase});
}
function countTo(el,from,to,opts={}) {
  const duration=reduced()?0:(opts.duration??.72);
  if(duration===0){el.textContent=String(Math.round(to)).padStart(opts.pad||0,"0");return;}
  animate(from,to,{duration,easing:enterEase,onUpdate:value=>{el.textContent=String(Math.round(value)).padStart(opts.pad||0,"0");},onComplete:()=>{el.textContent=String(Math.round(to)).padStart(opts.pad||0,"0");}});
}
function gauge(pathEl,score) {
  if(!pathEl)return;const r=Number(pathEl.getAttribute("r"))||14;const circumference=2*Math.PI*r;const end=circumference*(1-Math.max(0,Math.min(100,score))/100);
  pathEl.style.strokeDasharray=String(circumference);
  if(reduced()){pathEl.style.strokeDashoffset=String(end);return;}
  animate(pathEl,{strokeDashoffset:[circumference,end]},{duration:.38,easing:enterEase});
}
function colorAt(score){const css=getComputedStyle(document.documentElement);return css.getPropertyValue(score<=15?"--clear":score<=45?"--fuzzy":"--vague").trim();}
function debt(el,from,to){
  countTo(el,from,to,{duration:.82,pad:2});
  if(!reduced())animate(el,{color:[colorAt(from),colorAt(to)]},{duration:.82,easing:enterEase});else el.style.color=colorAt(to);
}
function flight(fromEl,toEl){
  if(!fromEl||!toEl||reduced())return Promise.resolve();
  const a=fromEl.getBoundingClientRect(),b=toEl.getBoundingClientRect();
  const ghost=document.createElement("span");ghost.className="flight-ghost";ghost.textContent=fromEl.querySelector("h4")?.textContent||"Approved promise";
  ghost.style.left=a.left+"px";ghost.style.top=a.top+"px";ghost.style.width=Math.max(160,Math.min(a.width,280))+"px";document.body.append(ghost);
  const dx=b.left-a.left,dy=b.top-a.top;
  return new Promise(resolve=>animate(ghost,{transform:["translate(0px,0px) scale(1)","translate("+dx+"px,"+dy+"px) scale(.48)"],opacity:[.92,0]},{duration:.42,easing:enterEase,onComplete:()=>{ghost.remove();resolve();}}));
}
function flip(root,mutateFn){
  if(!root){mutateFn();return;}
  const before=new Map([...root.querySelectorAll(".task-card[data-id]")].map(el=>[el.dataset.id,el.getBoundingClientRect()]));
  mutateFn();
  if(reduced())return;
  for(const el of root.querySelectorAll(".task-card[data-id]")){const old=before.get(el.dataset.id);if(!old)continue;const next=el.getBoundingClientRect(),dx=old.left-next.left,dy=old.top-next.top;if(Math.abs(dx)+Math.abs(dy)<1)continue;
    animate(el,{transform:["translate("+dx+"px,"+dy+"px)","translate(0px,0px)"]},{type:"spring",stiffness:260,damping:28});
  }
}
function pulse(el){
  if(!el||reduced())return;const ring=document.createElement("span");ring.className="pulse-ring";el.append(ring);
  animate(ring,{transform:["scale(.96)","scale(1.08)"],opacity:[.75,0]},{duration:.48,easing:enterEase,onComplete:()=>ring.remove()});
}
function toastElement(el){
  if(reduced()){setTimeout(()=>el.remove(),2600);return;}
  animate(el,{transform:["translateY(8px)","translateY(0px)"],opacity:[0,1]},{type:"spring",stiffness:260,damping:28});
  setTimeout(()=>animate(el,{transform:["translateY(0px)","translateY(5px)"],opacity:[1,0]},{duration:.18,easing:enterEase,onComplete:()=>el.remove()}),2800);
}
function startDrift(elements){
  if(started===false||reduced())return;driftItems=[...elements].map(el=>animate(el,{transform:["translate3d(0,0,0)","translate3d(3%,-3%,0)"]},{duration:40,repeat:Infinity,repeatType:"reverse",easing:"linear"}));
  const pause=()=>driftItems.forEach(item=>document.hidden?item.pause():item.play());document.addEventListener("visibilitychange",pause);pause();
}
function showToast(message,type="info"){
  const region=document.querySelector("#toast-region");if(!region)return null;
  const el=document.createElement("div");el.className="toast "+type;const dot=document.createElement("span");dot.className="toast-mark";const text=document.createElement("span");text.textContent=String(message);el.append(dot,text);region.append(el);toastElement(el);return el;
}
function progress(el,value){if(!el)return;if(reduced()){el.style.transform="scaleX("+value+")";return;}animate(el,{transform:"scaleX("+value+")"},{duration:.22,easing:enterEase});}
function syncMinimap(container,marker){
  if(!container||!marker||scrollBindings.has(container))return;
  const stop=scroll(progress=>{const max=container.clientHeight-22;marker.style.transform="translateY("+(Math.max(0,Math.min(1,progress))*Math.max(0,max))+"px)";},{target:container});
  scrollBindings.set(container,stop);
}
function changeView(outgoing,incoming){
  if(!outgoing||!incoming)return Promise.resolve();incoming.hidden=false;
  if(reduced()){outgoing.hidden=true;incoming.hidden=false;incoming.style.opacity="1";incoming.style.transform="none";return Promise.resolve();}
  return new Promise(resolve=>animate(outgoing,{opacity:[1,0],transform:["translateY(0px)","translateY(-3px)"]},{duration:.12,easing:enterEase,onComplete:()=>{outgoing.hidden=true;incoming.hidden=false;animate(incoming,{opacity:[0,1],transform:["translateY(8px)","translateY(0px)"]},{duration:.26,easing:enterEase,onComplete:resolve});}}));
}
function bindControls(scope=document){
  const items=scope.matches?.("button,a")?[scope,...scope.querySelectorAll("button,a")]:[...scope.querySelectorAll("button,a")];
  for(const el of items){if(controlBindings.has(el))continue;controlBindings.add(el);
    hover(el,(element)=>{if(reduced())return;animate(element,{transform:"translateY(-1px) scale(1.01)"},{duration:.14,easing:enterEase});return()=>animate(element,{transform:"translateY(0px) scale(1)"},{duration:.14,easing:enterEase});});
    press(el,(element)=>{if(reduced())return;animate(element,{transform:"scale(.97)"},{duration:.12,easing:enterEase});return()=>animate(element,{transform:"scale(1)"},{duration:.14,easing:enterEase});});
  }
}
function reducedMotion(){return reduced();}

export const ergonMotion={ready,reveal,sweep,countTo,gauge,flight,flip,pulse,toast:showToast,toastElement,drift:startDrift,startDrift,reduced:reducedMotion,progress,syncMinimap,changeView,bindControls,debt};
