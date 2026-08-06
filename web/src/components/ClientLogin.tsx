import { useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, LockKeyhole } from 'lucide-react';

export function ClientLogin({onAuthenticated}:{onAuthenticated:()=>void}){
  const [passcode,setPasscode]=useState('');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent){
    event.preventDefault();setWorking(true);setError('');
    try{
      const response=await fetch('/api/client/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({passcode})});
      const body=await response.json().catch(()=>({message:'The access service did not return JSON.'}));
      if(!response.ok)throw new Error(body.message??'Access denied.');
      setPasscode('');onAuthenticated();
    }catch(reason){setError(reason instanceof Error?reason.message:'Access denied.');}
    finally{setWorking(false);}
  }
  return <main className="client-login"><div className="client-login-card"><div className="client-login-brand"><span>J</span><div><strong>JAECOO</strong><small>Indonesia Marketing Intelligence</small></div></div><div className="client-lock"><LockKeyhole size={23}/></div><p className="eyebrow">Secure client view</p><h1>Enter your access code</h1><p>Your four-digit passcode opens a read-only view of the JAECOO dashboard.</p><form onSubmit={submit}><label>4-digit passcode<input autoFocus aria-label="4-digit passcode" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="one-time-code" value={passcode} onChange={(event)=>setPasscode(event.target.value.replace(/\D/g,'').slice(0,4))} placeholder="••••"/></label><button className="button dark" disabled={working||passcode.length!==4}>{working?<LoaderCircle className="spin" size={15}/>:<KeyRound size={15}/>} Open dashboard</button></form>{error&&<p className="client-login-error">{error}</p>}<small>Access is controlled by the JAECOO masteradmin.</small></div></main>;
}
