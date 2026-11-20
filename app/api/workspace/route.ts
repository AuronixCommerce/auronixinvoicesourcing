import {env} from 'cloudflare:workers';
import {FirebaseStore,verifyFirebase,fail} from '../../../lib/firebase/server';
export const dynamic='force-dynamic';
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const str=(v:unknown,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
const num=(v:unknown,min:number,max:number)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)fail('Please enter a valid number.');return n;};
const whole=(v:unknown,min:number,max:number)=>{const n=num(v,min,max);if(!Number.isInteger(n))fail('Units must be a whole number.');return n;};
const records=(v:any):any[]=>Object.values(v||{});
const sort=(v:any[])=>v.sort((a,b)=>String(b.created).localeCompare(String(a.created)));
async function context(request:Request){
 const identity=await verifyFirebase(request);
 const store=new FirebaseStore((env as any).FIREBASE_DATABASE_URL,identity.token);
 const path='members/'+identity.uid;
 let me=await store.get(path);
 if(!me){me=await store.transaction(path,current=>current||{id:identity.uid,email:identity.email,name:identity.name,company:'',phone:'',status:identity.admin?'approved':'pending',role:identity.admin?'admin':'user',created:new Date().toISOString()});}
 // Authorization always uses the configured Firebase UID, never a client-supplied role.
 if(identity.admin&&(me.role!=='admin'||me.status!=='approved')){me={...me,role:'admin',status:'approved'};await store.put(path,me);}
 me={...me,role:identity.admin?'admin':'user'};
 return {identity,store,me};
}
function activity(userId:string,message:string,now:string){const id=crypto.randomUUID();return {id,user_id:userId,message,created:now};}
export async function GET(request:Request){try{
 const {identity,store,me}=await context(request);
 const settings=await store.get('settings');const rate=Number(settings?.usd_pkr)||280;
 const people=identity.admin?records(await store.get('members')):[me];
 let inventory:any={};
 if(identity.admin)inventory=await store.get('inventory')||{};
 else if(me.status==='approved'&&identity.emailVerified)inventory[identity.uid]=await store.get('inventory/'+identity.uid)||{};
 const workspaces:any[]=records(inventory),products=sort(workspaces.flatMap(w=>records(w.products))),shipments=sort(workspaces.flatMap(w=>records(w.shipments))),events=sort(workspaces.flatMap(w=>records(w.events)));
 for(const s of shipments){events.push({id:'request-'+s.id,shipment_id:s.id,status:'Waiting for approval',message:'FBA shipment request submitted. Waiting for administrator approval.',location:'',created:s.created});}
 const logs=workspaces.flatMap(w=>records(w.activity));
 for(const s of shipments)logs.push({id:'request-'+s.id,user_id:s.user_id,message:`FBA shipment requested: ${s.units} × ${s.product_name}`,created:s.created});
 for(const m of people)logs.push({id:'member-'+m.id,user_id:m.id,message:m.status==='pending'?`New account awaiting approval: ${m.name}`:`Account created: ${m.name}`,created:m.created});
 return respond({me,members:sort(people),products,shipments,events:sort(events),activity:sort(logs).slice(0,30),rate,rateConfigured:!!settings?.usd_pkr,emailVerified:identity.emailVerified,verificationRequired:!identity.admin&&!identity.emailVerified});
 }catch(e:any){return respond({error:e.message,setupRequired:!(env as any).FIREBASE_DATABASE_URL},e.status||500);}}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)fail('Invalid request origin.',403);
 const {identity,store,me}=await context(request);const body:any=await request.json();const now=new Date().toISOString();const id=crypto.randomUUID();
 const requireAdmin=()=>{if(!identity.admin)fail('Administrator access required.',403);};
 const logTo=(w:any,user:string,message:string)=>{const log=activity(user,message,now);w.activity={...w.activity,[log.id]:log};};
 switch(body.action){
 case 'profile':{
 const uid=identity.admin&&body.id?str(body.id):identity.uid;const name=str(body.name,100);if(!name)fail('Your name is required.');
 await store.transaction('members/'+uid,m=>{if(!m)fail('Member not found.',404);return {...m,name,company:str(body.company,150),phone:str(body.phone,40)};});break;}
 case 'approve':case 'reject':{
 requireAdmin();const uid=str(body.id);if(uid===identity.uid)fail('The administrator account cannot be changed.');
 await store.transaction('members/'+uid,m=>{if(!m)fail('Member not found.',404);return {...m,status:body.action==='approve'?'approved':'rejected'};});break;}
 case 'rate':{
 requireAdmin();await store.put('settings/usd_pkr',num(body.rate,1,10000));break;}
 case 'product':{
 requireAdmin();const uid=str(body.user_id);const member=await store.get('members/'+uid);if(!member||member.status!=='approved')fail('Choose an approved member.');
 const name=str(body.name,160);if(!name)fail('Product name is required.');const image=str(body.image,2000);if(image){try{if(new URL(image).protocol!=='https:')fail('Use an HTTPS image URL.');}catch{fail('Use a valid HTTPS image URL.');}}
 const type=str(body.type);if(!['Local','International'].includes(type))fail('Choose Local or International.');const warehouse=str(body.warehouse,150);if(!warehouse)fail('Enter the warehouse name.');
 const price=Math.round(num(body.price,0.01,1000000)*100),available=whole(body.available,0,1000000);
 await store.transaction('inventory/'+uid,w=>{w=w||{};const previous=body.id?w.products?.[str(body.id)]:null;if(body.id&&!previous)fail('Product not found for this member.',404);
 const product={id:previous?.id||id,user_id:uid,name,image,sku:str(body.sku,80),category:str(body.category,60)||'General',type,warehouse,price,available,asin:str(body.asin,20),notes:str(body.notes,2000),created:previous?.created||now};
 w.products={...w.products,[product.id]:product};logTo(w,uid,`${previous?'Updated':'Assigned'} product: ${name}`);return w;});break;}
 case 'ship':{
 if(me.status!=='approved'||(!identity.admin&&!identity.emailVerified))fail('Your account needs email verification and administrator approval before requesting fulfillment.',403);
 const productId=str(body.product_id);let uid=identity.uid;
 if(identity.admin){const all=await store.get('inventory');const match=Object.entries<any>(all||{}).find(([,w])=>w.products?.[productId]);if(!match)fail('Product not found.',404);uid=match![0];}
 const p=await store.get('inventory/'+uid+'/products/'+productId);if(!p)fail('Product not found.',404);
 const units=whole(body.units,1,1000000);if(units>p.available)fail('There are not enough units available.',409);
 const address=str(body.address,2000);if(address.length<15)fail('Enter the full FBA delivery address.');const rate=Number(await store.get('settings/usd_pkr'));if(!rate)fail('Ask the administrator to set the exchange rate before requesting a shipment.');
 // Requests do not alter stock. Admin approval atomically reserves stock with the order and timeline.
 const shipment={id,user_id:uid,product_id:p.id,product_name:p.name,units,price:p.price,rate,address,shipment_ref:str(body.shipment_ref,100),notes:str(body.notes,2000),status:'Waiting for approval',tracking:'',reserved:false,created:now,updated:now};
 await store.transaction('inventory/'+uid+'/shipments/'+id,current=>{if(current)fail('Request already exists.',409);return shipment;});break;}
 case 'shipment':{
 requireAdmin();const shipmentId=str(body.id);const all=await store.get('inventory');const match=Object.entries<any>(all||{}).find(([,w])=>w.shipments?.[shipmentId]);if(!match)fail('Shipment not found.',404);const uid=match![0];
 await store.transaction('inventory/'+uid,w=>{const s=w?.shipments?.[shipmentId];if(!s)fail('Shipment not found.',404);const status=str(body.status),stages=['Order booked','In transit','At warehouse','Out for delivery','Delivered'];
 if(['Delivered','Cancelled'].includes(s.status))fail('This shipment is already complete.');
 if(s.status==='Waiting for approval'&&!['Order booked','Cancelled'].includes(status))fail('Approve the request before adding tracking updates.');
 if(s.status!=='Waiting for approval'&&![...stages,'Cancelled'].includes(status))fail('Choose a valid shipment status.');
 if(status==='Cancelled'&&!['Waiting for approval','Order booked','At warehouse'].includes(s.status))fail('Only requests before transit or at a warehouse may be cancelled.');
 const p=w.products?.[s.product_id];if(!p)fail('The assigned product is missing.');
 let reserved=s.reserved===true;
 if(s.status==='Waiting for approval'&&status==='Order booked'){if(p.available<s.units)fail('Not enough stock remains to approve this request. Update available units or cancel the request.',409);p.available-=s.units;reserved=true;}
 if(status==='Cancelled'&&reserved){p.available+=s.units;reserved=false;}
 w.shipments[shipmentId]={...s,status,reserved,tracking:str(body.tracking,200),updated:now};
 const event={id,shipment_id:shipmentId,status,message:str(body.message,2000)||status,location:str(body.location,200),created:now};w.events={...w.events,[id]:event};logTo(w,uid,`Shipment ${status.toLowerCase()}: ${s.product_name}`);return w;});break;}
 default:fail('Unknown action.');}
 return respond({ok:true});
 }catch(e:any){return respond({error:e.message||'Something went wrong.',setupRequired:!(env as any).FIREBASE_DATABASE_URL},e.status||500);}}
