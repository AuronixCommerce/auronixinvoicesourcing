// Route integration checks with a deterministic RTDB HTTP mock. No production account or data is created.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const ADMIN='w3NzuxTFqwYoweS9CWOXC8RROzp1';
const identities={admin:{localId:ADMIN,email:'admin@example.com',emailVerified:true,displayName:'Admin'},member:{localId:'member',email:'member@example.com',emailVerified:true,displayName:'Member'},other:{localId:'other',email:'other@example.com',emailVerified:true,displayName:'Other'},unverified:{localId:'unverified',email:'unverified@example.com',emailVerified:false,displayName:'Unverified'}};
let root={},version=0,conflictNext=false;
const at=path=>path.reduce((v,k)=>v?.[k],root)??null;
const put=(path,value)=>{let node=root;for(const k of path.slice(0,-1))node=node[k]||(node[k]={});node[path.at(-1)]=structuredClone(value);version++;};
globalThis.__firebaseTestEnv={FIREBASE_DATABASE_URL:'https://test-auronix.firebaseio.com'};
const realFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const u=new URL(String(input));
 if(u.hostname==='identitytoolkit.googleapis.com'){
  const token=JSON.parse(init.body).idToken;return Response.json(identities[token]?{users:[identities[token]]}:{error:'invalid'}, {status:identities[token]?200:400});
 }
 if(u.hostname!=='test-auronix.firebaseio.com')throw new Error('Unexpected request host');
 const path=u.pathname.slice(1,-5).split('/').filter(Boolean),headers=new Headers(init.headers);
 if((init.method||'GET')==='GET')return Response.json(structuredClone(at(path)),{headers:{ETag:'"'+version+'"'}});
 if(conflictNext){conflictNext=false;version++;return Response.json({error:'conflict'},{status:412});}
 if(headers.has('if-match')&&headers.get('if-match')!=='"'+version+'"')return Response.json({error:'conflict'},{status:412});
 const value=JSON.parse(init.body);put(path,value);return Response.json(value);
};
const compiled=await build({entryPoints:['app/api/workspace/route.ts'],bundle:true,write:false,format:'esm',platform:'neutral',plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__firebaseTestEnv;',loader:'js'}));}}]});
const route=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
async function call(token,body){const h={'Content-Type':'application/json',Origin:'https://site.test'};if(token)h.Authorization='Bearer '+token;const req=new Request('https://site.test/api/workspace',{method:body?'POST':'GET',headers:h,body:body?JSON.stringify(body):undefined});const r=await (body?route.POST(req):route.GET(req));return {status:r.status,data:await r.json()};}
async function ok(token,b){const r=await call(token,b);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
try{
 assert.equal((await call(null)).status,401);assert.equal((await call('forged')).status,401);
 assert.equal((await ok('member')).me.status,'pending');assert.equal((await ok('member')).me.role,'user');
 assert.equal((await ok('admin')).me.role,'admin');
 assert.equal((await call('member',{action:'approve',id:'member'})).status,403);
 await ok('admin',{action:'approve',id:'member'});await ok('other');await ok('admin',{action:'approve',id:'other'});
 await ok('admin',{action:'rate',rate:280});
 await ok('admin',{action:'product',user_id:'member',name:'Test product',price:14.99,available:10,type:'Local',warehouse:'My Lahore Warehouse',image:''});
 let state=await ok('member'),p=state.products[0];assert.equal(p.price,1499);assert.equal(p.type,'Local');
 assert.equal((await ok('other')).products.length,0);
 assert.equal((await call('other',{action:'ship',product_id:p.id,units:1,address:'123 Example Road, Miami 33101'})).status,404);
 assert.equal((await call('member',{action:'ship',product_id:p.id,units:1.5,address:'123 Example Road, Miami 33101'})).status,400);
 const request={action:'ship',product_id:p.id,units:6,address:'123 Example Road, Miami 33101'};
 await ok('member',request);await ok('member',request);
 state=await ok('member');const [s1,s2]=state.shipments;assert.equal(state.products[0].available,10);assert.equal(s1.status,'Waiting for approval');
 assert.equal((await call('admin',{action:'shipment',id:s1.id,status:'In transit'})).status,400);
 conflictNext=true;await ok('admin',{action:'shipment',id:s1.id,status:'Order booked',message:'Approved',location:'Custom Warehouse'});
 assert.equal((await ok('member')).products[0].available,4);
 assert.equal((await call('admin',{action:'shipment',id:s2.id,status:'Order booked'})).status,409);
 assert.equal((await call('member',{action:'shipment',id:s1.id,status:'Delivered'})).status,403);
 await ok('admin',{action:'rate',rate:300});assert.equal((await ok('member')).shipments[0].rate,280);
 for(const status of ['In transit','At warehouse'])await ok('admin',{action:'shipment',id:s1.id,status,message:'My update',location:'My custom warehouse'});
 await ok('admin',{action:'shipment',id:s1.id,status:'Cancelled'});assert.equal((await ok('member')).products[0].available,10);
 assert.equal((await call('admin',{action:'shipment',id:s1.id,status:'Cancelled'})).status,400);
 await ok('admin',{action:'shipment',id:s2.id,status:'Cancelled'});assert.equal((await ok('member')).products[0].available,10);
 assert.equal((await ok('other')).shipments.length,0);assert.equal((await ok('other')).events.length,0);
 await ok('unverified');await ok('admin',{action:'approve',id:'unverified'});assert.equal((await ok('unverified')).verificationRequired,true);
 assert.equal((await call('unverified',request)).status,403);
 root.members.member.role='admin';assert.equal((await ok('member')).me.role,'user');assert.equal((await call('member',{action:'rate',rate:1})).status,403);
 globalThis.__firebaseTestEnv.FIREBASE_DATABASE_URL='';const missing=await call('admin');assert.equal(missing.status,503);assert.equal(missing.data.setupRequired,true);
 console.log('PASS: Firebase ID-token validation, pinned admin UID, pending registration, approval, tenant isolation, email verification, ETag retries, stock reservation at approval, overbooking prevention, custom tracking, currency snapshots and cancellation.');
}finally{globalThis.fetch=realFetch;}
