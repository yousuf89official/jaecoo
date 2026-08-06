import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Check, Clock3, Copy, DatabaseZap, KeyRound, Link2, LoaderCircle, Settings2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Card, EmptyState, MetricTable, Notice, PageHeader, SectionHeading, StatusPill } from '../components/Ui';
import { DataErrorBanner } from './shared';

interface WacReportingHealth {freshness:Array<Record<string,unknown>>;syncRuns:Array<Record<string,unknown>>;issues?:Array<Record<string,unknown>>;accounts:Array<Record<string,unknown>>;schemaVersion:string;provenance?:string}
interface HealthResponse {checkedAt:string;timezone:string;states:Array<Record<string,unknown>>;facts:Array<Record<string,unknown>>;recentRuns:Array<Record<string,unknown>>;wacReporting:WacReportingHealth|null}
interface ClientAccess {slug:string;enabled:boolean;passcodeSet:boolean;updatedAt:string|null;clientUrl:string}

export function SettingsPage(){
  const query=useQuery({queryKey:['health'],queryFn:()=>apiFetch<HealthResponse>('/api/health'),retry:1});
  const data=query.data??{checkedAt:new Date().toISOString(),timezone:'Asia/Jakarta',states:[],facts:[],recentRuns:[],wacReporting:null};
  const [adminToken,setAdminToken]=useState('');
  const [access,setAccess]=useState<ClientAccess|null>(null);
  const [enabled,setEnabled]=useState(false);
  const [passcode,setPasscode]=useState('');
  const [working,setWorking]=useState('');
  const [message,setMessage]=useState<{type:'success'|'error';text:string}|null>(null);
  const [copied,setCopied]=useState(false);

  async function adminRequest<T>(path:string,method='GET',body?:Record<string,unknown>):Promise<T>{
    const response=await fetch(path,{method,headers:{Accept:'application/json',Authorization:`Bearer ${adminToken}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>({message:'The server did not return JSON.'}));
    if(!response.ok)throw new Error(payload.message??payload.error??`Request failed (${response.status})`);
    return payload as T;
  }

  async function loadAccess(){
    setWorking('access');setMessage(null);
    try{const next=await adminRequest<ClientAccess>('/api/admin/client-access');setAccess(next);setEnabled(next.enabled);setMessage({type:'success',text:'Masteradmin controls unlocked for this session.'});}
    catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Unable to load settings.'});}
    finally{setWorking('');}
  }

  async function saveAccess(){
    setWorking('save');setMessage(null);
    try{const next=await adminRequest<ClientAccess>('/api/admin/client-access','POST',{enabled,...(passcode?{passcode}:{})});setAccess(next);setPasscode('');setMessage({type:'success',text:next.enabled?'Client link is enabled. Existing sessions were revoked and the current passcode is active.':'Client link is disabled and existing sessions were revoked.'});}
    catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Unable to save client access.'});}
    finally{setWorking('');}
  }

  async function ownerAction(path:string,label:string){
    setWorking(path);setMessage(null);
    try{const result=await adminRequest<Record<string,unknown>>(path,'POST');setMessage({type:'success',text:label==='onboard'?'Facebook, Instagram and TikTok are registered and readable.':`Historical organic import finished for ${String(result.start)} through ${String(result.end)}.`});await query.refetch();}
    catch(error){setMessage({type:'error',text:error instanceof Error?error.message:'Owner action failed.'});}
    finally{setWorking('');}
  }

  async function copyLink(){if(!access)return;await navigator.clipboard.writeText(access.clientUrl);setCopied(true);setTimeout(()=>setCopied(false),1600)}

  return <><PageHeader eyebrow="Masteradmin" title="Settings & access" description="Manage source authentication, historical imports, client access and internal data diagnostics from one protected workspace." aside={<button className="button secondary" onClick={()=>query.refetch()}><Activity size={15}/> Refresh status</button>}/><DataErrorBanner message={query.error?.message}/>
    <Notice type="secure" title="Masteradmin boundary"><p>Admin tokens, WAC credentials and client passcodes are never displayed or stored in browser storage. Passcodes are stored as peppered hashes and client sessions use signed HTTP-only cookies.</p></Notice>

    <section className="content-section"><SectionHeading kicker="Access control" title="Unlock masteradmin settings" description="Enter ADMIN_REFRESH_SECRET to make an owner-authorised change. The token stays only in this page's memory and clears on reload."/>
      <Card className="settings-panel"><label className="field-label">Admin action token<input type="password" autoComplete="off" value={adminToken} onChange={(event)=>setAdminToken(event.target.value)} placeholder="Enter the masteradmin token"/></label><button className="button dark" disabled={!adminToken||Boolean(working)} onClick={loadAccess}>{working==='access'&&<LoaderCircle className="spin" size={13}/>} Unlock settings</button></Card>
      {message&&<p className={`settings-result ${message.type}`}>{message.text}</p>}
    </section>

    <section className="content-section"><SectionHeading kicker="Client view" title="Four-digit client access" description="Create a shareable read-only dashboard link. Changing the passcode or enabled state immediately revokes all existing client sessions." action={<StatusPill status={access?.enabled?'live':'unavailable'} label={access?.enabled?'enabled':'disabled'}/>}/>
      <Card className="client-access-card">
        <div className="client-link-row"><div><Link2 size={18}/><div><strong>Client dashboard</strong><span>{access?.clientUrl??'/client/jaecoo'}</span></div></div><button className="button secondary" disabled={!access} onClick={copyLink}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy link'}</button></div>
        <div className="settings-form-grid"><label className="toggle-field"><input type="checkbox" checked={enabled} disabled={!access} onChange={(event)=>setEnabled(event.target.checked)}/><span><strong>Enable client link</strong><small>Clients see reporting pages only; Settings is excluded.</small></span></label><label className="field-label">New 4-digit passcode<input inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} value={passcode} disabled={!access} onChange={(event)=>setPasscode(event.target.value.replace(/\D/g,'').slice(0,4))} placeholder={access?.passcodeSet?'Leave blank to keep current':'Required to enable'}/></label><button className="button dark" disabled={!access||Boolean(working)||(Boolean(passcode)&&passcode.length!==4)} onClick={saveAccess}>{working==='save'&&<LoaderCircle className="spin" size={13}/>} Save client access</button></div>
      </Card>
    </section>

    <section className="content-section"><SectionHeading kicker="Owned social" title="Facebook, Instagram & TikTok authentication" description="Register the exact @jaecoo.id assets with permanent read grants, then import all history available from each platform API."/>
      <div className="split-grid equal"><Card className="settings-action-card"><KeyRound/><div><strong>1. Authenticate and verify</strong><p>Runs the owner-only WAC onboarding plan and confirms all three channels return can_read: true.</p><button className="button dark" disabled={!access||Boolean(working)} onClick={()=>ownerAction('/api/admin/onboard-organic','onboard')}>{working==='/api/admin/onboard-organic'&&<LoaderCircle className="spin" size={13}/>} Authenticate accounts</button></div></Card><Card className="settings-action-card"><DatabaseZap/><div><strong>2. Import available history</strong><p>Paginates all posts/videos and requests organic insights in bounded historical windows. Current profile fields are stored as dated snapshots.</p><button className="button dark" disabled={!access||Boolean(working)} onClick={()=>ownerAction('/api/admin/sync-organic','sync')}>{working==='/api/admin/sync-organic'&&<LoaderCircle className="spin" size={13}/>} Fetch historical metrics</button></div></Card></div>
    </section>

    <div className="health-summary"><Card><DatabaseZap/><div><span>Registered states</span><strong>{data.states.length||'—'}</strong></div></Card><Card><ShieldCheck/><div><span>Fact sources</span><strong>{data.facts.length||'—'}</strong></div></Card><Card><Clock3/><div><span>Last checked</span><strong>{new Date(data.checkedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'})}</strong></div></Card></div>
    <section className="content-section"><SectionHeading kicker="Data diagnostics" title="Connection inventory" description="Seeded states are expectations; connected states require a successful ingestion."/><Card>{data.states.length?<div className="table-scroll"><table><thead><tr><th>Source</th><th>Status</th><th>Message</th><th>Last success</th></tr></thead><tbody>{data.states.map((row)=><tr key={String(row.source)}><td><strong>{String(row.source)}</strong></td><td><StatusPill status={String(row.status).includes('connected')?'live':String(row.status).includes('qa_')?'warning':String(row.status).includes('seeded')?'seeded':'unavailable'} label={String(row.status)}/></td><td>{String(row.message??'—')}</td><td>{String(row.last_success_at??'Unavailable')}</td></tr>)}</tbody></table></div>:<EmptyState message="Connect DATABASE_URL and apply the seed to populate source health."/>}</Card></section>
    <section className="content-section"><SectionHeading kicker="Warehouse" title="Fact freshness"/><Card>{data.facts.length?<div className="table-scroll"><table><thead><tr><th>Platform</th><th>Account</th><th>Latest report</th><th>Ingested</th><th>Rows</th></tr></thead><tbody>{data.facts.map((row)=><tr key={`${row.platform}-${row.account_id}`}><td><strong>{String(row.platform)}</strong></td><td className="mono">{String(row.account_id)}</td><td>{String(row.latest_report_date)}</td><td>{String(row.last_ingested_at)}</td><td>{String(row.row_count)}</td></tr>)}</tbody></table></div>:<EmptyState message="The fact warehouse is empty until the first backfill succeeds."/>}</Card></section>
    <section className="content-section"><SectionHeading kicker="WAC contract" title="Reporting freshness & sync status" description="Sanitized owner-reporting metadata; raw connector payloads and credentials are not exposed." action={data.wacReporting?<StatusPill status={data.wacReporting.provenance==='authorized_read_only_snapshot'?'partial':'live'} label={data.wacReporting.provenance==='authorized_read_only_snapshot'?'snapshot available':`schema ${data.wacReporting.schemaVersion}`}/>:<StatusPill status="unavailable" label="awaiting WAC sync"/>}/><div className="split-grid equal"><Card><div className="card-head"><div><strong>Registered accounts</strong><span>account_list</span></div></div><MetricTable rows={data.wacReporting?.accounts??[]} emptyMessage="No WAC account inventory has been captured."/></Card><Card><div className="card-head"><div><strong>Recent sync runs</strong><span>reporting_sync_status</span></div></div><MetricTable rows={data.wacReporting?.syncRuns??[]} emptyMessage="No WAC reporting sync status has been captured."/></Card></div></section>
  </>;
}
