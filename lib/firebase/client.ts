'use client';
import {initializeApp,getApps,getApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {firebaseConfig} from './config';
export function getFirebaseAuth(){
 if(typeof window==='undefined')throw new Error('Authentication is available in your browser.');
 const app=getApps().length?getApp():initializeApp(firebaseConfig);
 return getAuth(app);
}
export function authMessage(error:unknown){
 const code=(error as {code?:string})?.code;
 const messages:Record<string,string>={
 'auth/invalid-credential':'The email or password is incorrect. Please try again.',
 'auth/invalid-login-credentials':'The email or password is incorrect. Please try again.',
 'auth/user-not-found':'The email or password is incorrect. Please try again.',
 'auth/wrong-password':'The email or password is incorrect. Please try again.',
 'auth/email-already-in-use':'An account already uses this email. Log in or reset your password.',
 'auth/invalid-email':'Enter a valid email address.',
 'auth/weak-password':'Choose a stronger password with at least 8 characters.',
 'auth/password-does-not-meet-requirements':'Your password does not meet the project’s password policy. Add uppercase and lowercase letters, a number, and a symbol.',
 'auth/too-many-requests':'Too many attempts. Please wait a few minutes and try again.',
 'auth/operation-not-allowed':'Email/password sign-in needs to be enabled in Firebase Authentication.',
 'auth/network-request-failed':'Could not reach the sign-in service. Check your connection and retry.',
 'auth/unauthorized-domain':'This website domain needs to be added to Firebase Authentication’s authorized domains.',
 'auth/user-disabled':'This account is disabled. Contact the Auronix team.',
 'auth/requires-recent-login':'Please log in again to continue.',
 'auth/invalid-api-key':'Firebase sign-in configuration could not be loaded.',
 };
 return messages[code||'']||'We couldn’t complete that request. Please try again.';
}
