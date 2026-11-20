'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {onAuthStateChanged,signOut,User} from 'firebase/auth';
import {getFirebaseAuth,authMessage} from '../lib/firebase/client';
type AuthContextValue={user:User|null,initializing:boolean,authError:string,logout:()=>Promise<void>,refreshUser:()=>Promise<void>};
const Context=createContext<AuthContextValue>({user:null,initializing:true,authError:'',logout:async()=>{},refreshUser:async()=>{}});
export function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null),[initializing,setInitializing]=useState(true),[authError,setAuthError]=useState('');
 useEffect(()=>{try{return onAuthStateChanged(getFirebaseAuth(),u=>{setUser(u);setInitializing(false);setAuthError('');},e=>{setAuthError(authMessage(e));setInitializing(false);});}catch(e){setAuthError(authMessage(e));setInitializing(false);}},[]);
 const logout=async()=>{await signOut(getFirebaseAuth());setUser(null);};
 const refreshUser=async()=>{const current=getFirebaseAuth().currentUser;if(current){await current.reload();await current.getIdToken(true);setUser(null);setUser(getFirebaseAuth().currentUser);}};
 return <Context.Provider value={{user,initializing,authError,logout,refreshUser}}>{children}</Context.Provider>;
}
export const useFirebaseUser=()=>useContext(Context);
