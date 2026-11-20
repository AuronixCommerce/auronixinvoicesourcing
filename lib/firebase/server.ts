import {firebaseConfig,ADMIN_UID} from './config';
export const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
export type FirebaseIdentity={uid:string,email:string,name:string,emailVerified:boolean,admin:boolean,token:string};
export async function verifyFirebase(request:Request):Promise<FirebaseIdentity>{
 const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];if(!token)fail('Please log in to continue.',401);
 const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!response.ok)fail('Your session has expired. Please log in again.',401);
 const result:any=await response.json(),u=result.users?.[0];if(!u?.localId||u.disabled)fail('Your session is invalid. Please log in again.',401);
 return {uid:u.localId,email:u.email||'',name:u.displayName||u.email?.split('@')[0]||'Member',emailVerified:u.emailVerified===true,admin:u.localId===ADMIN_UID,token:token!};
}
export class FirebaseStore{
 private base:string;
 constructor(databaseURL:string|undefined,private token:string){
  if(!databaseURL)fail('Realtime Database is not connected yet. The site owner needs to provide the Firebase database URL and publish the access rules.',503);
  const u=new URL(databaseURL!);
  if(u.protocol!=='https:'||!(u.hostname.endsWith('.firebaseio.com')||u.hostname.endsWith('.firebasedatabase.app'))||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))fail('The configured Realtime Database URL is invalid.',503);
  this.base=u.origin;
 }
 private url(path:string){if(!/^[A-Za-z0-9_\-/]*$/.test(path))fail('Invalid record path.');return this.base+'/'+path+'.json?auth='+encodeURIComponent(this.token);}
 async request(path:string,method='GET',body?:unknown,extra:Record<string,string>={}){
  const response=await fetch(this.url(path),{method,headers:{'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===412)return {conflict:true,data:null,etag:null};
  if(!response.ok){if(response.status===401||response.status===403)fail('Database access was denied. Check the published Firebase rules and your account approval.',403);if(response.status===404)fail('Realtime Database could not be found. Check the database URL.',503);fail('Could not save to Realtime Database. Please retry.',503);}
  return {conflict:false,data:await response.json() as any,etag:response.headers.get('ETag')};
 }
 async get(path:string){return (await this.request(path)).data;}
 async put(path:string,data:unknown){await this.request(path,'PUT',data);}
 async transaction(path:string,apply:(value:any)=>any){
  for(let attempt=0;attempt<5;attempt++){
   const current=await this.request(path,'GET',undefined,{'X-Firebase-ETag':'true'});if(!current.etag)fail('The database did not return a version. Please retry.',503);
   const next=apply(structuredClone(current.data));
   const written=await this.request(path,'PUT',next,{'if-match':current.etag!});if(!written.conflict)return next;
  }
  fail('Inventory changed while saving. Please refresh and try again.',409);
 }
}
