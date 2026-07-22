const LOCAL_KEY="painel-da-mirna:teacher:v1",TOKEN_KEY="painel-da-mirna:cloud-token:v1";
const resources=["groups","students","lessons","attendance","observations"];
const safe=(v,f=null)=>{try{return JSON.parse(v);}catch{return f;}};
function token(){return localStorage.getItem(TOKEN_KEY)?.trim()||"";}
function local(){const value=safe(localStorage.getItem(LOCAL_KEY),{});return value&&typeof value==="object"?value:{};}
function headers(){return{"Content-Type":"application/json",Accept:"application/json","x-painel-token":token()};}
async function request(method,body){const response=await fetch("/api/teacher",{method,headers:headers(),body:body?JSON.stringify(body):undefined,cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||"Migração indisponível.");return payload;}
async function migrate(){if(!token())return{migrated:0,skipped:true};const current=local();if(!resources.some(resource=>Array.isArray(current[resource])&&current[resource].length))return{migrated:0};const remote=await request("GET"),counts={};let migrated=0;for(const resource of resources){const known=new Set((remote[resource]||[]).map(item=>item.id));counts[resource]=0;for(const item of current[resource]||[]){if(!item?.id||known.has(item.id))continue;const data={...item};delete data.id;delete data.createdAt;delete data.updatedAt;try{await request("POST",{resource,id:item.id,data});known.add(item.id);counts[resource]+=1;migrated+=1;}catch(error){if(!/duplicate|unique/i.test(String(error.message)))throw error;}}}return{migrated,counts};}
window.__mirnaTeacherMigration={run:migrate};
try{await migrate();}catch(error){window.dispatchEvent(new CustomEvent("mirna:teacher-migration-error",{detail:{message:String(error?.message||error)}}));}
