// Fill these two values before deploying.
// Supabase Dashboard -> Project Settings -> API
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let pdfs = [], subject = "all";

function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function date(v){return new Intl.DateTimeFormat("en",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(v))}
function filtered(){const q=$("#search").value.trim().toLowerCase();return pdfs.filter(p=>(!q||`${p.title} ${p.subject} ${p.description}`.toLowerCase().includes(q))&&(subject==="all"||p.subject.toLowerCase()===subject.toLowerCase()))}

async function load(){
  try{
    const r=await fetch("/api/pdfs"); pdfs=await r.json();
    if(!Array.isArray(pdfs)) throw new Error(pdfs.error||"Failed to load library");
    render();
    const subs=[...new Set(pdfs.map(p=>p.subject))].sort();
    $("#chips").innerHTML=`<button class="chip active" data-s="all">All</button>`+subs.map(s=>`<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join("");
    $$("#chips .chip").forEach(b=>b.onclick=()=>{$$("#chips .chip").forEach(x=>x.classList.remove("active"));b.classList.add("active");subject=b.dataset.s;render()});
  }catch(e){$("#loading").textContent=e.message}
}
function render(){
  const list=filtered();$("#loading").classList.add("hidden");$("#count").textContent=list.length;$("#empty").classList.toggle("hidden",!!list.length);
  $("#grid").innerHTML=list.map(p=>`<article class="card"><div class="top"><span class="icon">PDF</span><span class="tag">${esc(p.subject)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description||"Study material from the group library.")}</p><div class="meta">Added ${date(p.createdAt)} · ${p.views||0} views</div><div class="links"><a class="view" target="_blank" rel="noopener" href="${p.previewUrl}" data-v="${p.id}">View PDF</a><a class="download" target="_blank" rel="noopener" href="${p.downloadUrl}">Download</a></div></article>`).join("");
  $$("[data-v]").forEach(a=>a.onclick=()=>fetch(`/api/view?id=${a.dataset.v}`,{method:"POST"}).catch(()=>{}));
}
$("#search").oninput=render;

const modal=$("#modal");$("#adminBtn").onclick=async()=>{modal.classList.remove("hidden");const{data:{session}}=await sb.auth.getSession();session?admin():login()};
$("#close").onclick=()=>modal.classList.add("hidden");modal.onclick=e=>{if(e.target===modal)modal.classList.add("hidden")};
function login(){$("#loginView").classList.remove("hidden");$("#adminView").classList.add("hidden")}
function admin(){$("#loginView").classList.add("hidden");$("#adminView").classList.remove("hidden");loadAdmin();resetForm()}
$("#login").onsubmit=async e=>{e.preventDefault();$("#loginErr").textContent="";const f=new FormData(e.target);const{error}=await sb.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});if(error)$("#loginErr").textContent=error.message;else admin()};
$("#logout").onclick=async()=>{await sb.auth.signOut();login()};

async function token(){const{data}=await sb.auth.getSession();if(!data.session)throw new Error("Please sign in again.");return data.session.access_token}
async function adminApi(method,body,id=""){
 const t=await token();return fetch(`/api/admin${id?`?id=${encodeURIComponent(id)}`:""}`,{method,headers:{"Content-Type":"application/json","Authorization":`Bearer ${t}`},body:body?JSON.stringify(body):undefined}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d})
}
async function loadAdmin(){
 try{const list=await adminApi("GET");$("#adminCount").textContent=`${list.length} items`;$("#adminList").innerHTML=list.map(p=>`<div class="item"><span class="icon">PDF</span><div class="info"><b>${esc(p.title)}</b><small>${esc(p.subject)} · ${p.views||0} views</small></div><button data-e="${p.id}">Edit</button><button class="del" data-d="${p.id}">Delete</button></div>`).join("");
 $$("#adminList [data-e]").forEach(b=>b.onclick=()=>edit(list.find(p=>p.id===b.dataset.e)));
 $$("#adminList [data-d]").forEach(b=>b.onclick=async()=>{const p=list.find(x=>x.id===b.dataset.d);if(!confirm(`Delete "${p.title}"?`))return;await adminApi("DELETE",null,p.id);await loadAdmin();await load();});
 }catch(e){$("#adminList").textContent=e.message}
}
function resetForm(){$("#pdfForm").reset();$("#pdfForm [name=id]").value="";$("#save").textContent="Add PDF";$("#cancel").classList.add("hidden");$("#formMsg").textContent=""}
function edit(p){const f=$("#pdfForm");f.id.value=p.id;f.title.value=p.title;f.subject.value=p.subject;f.description.value=p.description;f.driveUrl.value=p.driveUrl;$("#save").textContent="Save changes";$("#cancel").classList.remove("hidden");f.scrollIntoView({behavior:"smooth"})}
$("#cancel").onclick=resetForm;
$("#pdfForm").onsubmit=async e=>{e.preventDefault();$("#formMsg").textContent="";const f=new FormData(e.target),id=f.get("id");const body={title:f.get("title"),subject:f.get("subject"),description:f.get("description"),driveUrl:f.get("driveUrl")};try{await adminApi(id?"PUT":"POST",body,id);$("#formMsg").textContent=id?"Updated successfully.":"Added successfully.";resetForm();await loadAdmin();await load()}catch(err){$("#formMsg").textContent=err.message}};
load();