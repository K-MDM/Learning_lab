'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
export type LicenceSummary={id:string;displaySuffix:string;status:string;firstActivatedAt:string|null;expiresAt:string|null;
  createdAt:string;generation:string;platform:string|null;deviceFingerprint:string|null;deviceActivatedAt:string|null};
type Issued={id:string;displaySuffix:string;key:string};
function date(value:string|null){return value?new Date(value).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';}
export default function LicenceManager({licences,issuanceConfigured}:{licences:LicenceSummary[];issuanceConfigured:boolean}){
  const router=useRouter();
  const [count,setCount]=useState(1),[search,setSearch]=useState(''),[status,setStatus]=useState('all');
  const [issued,setIssued]=useState<Issued[]>([]),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  const [requestId,setRequestId]=useState<string|null>(null);
  const [selected,setSelected]=useState<{licence:LicenceSummary;action:'reset'|'revoke'}|null>(null),[reason,setReason]=useState('');
  async function post(body:Record<string,unknown>){
    const response=await fetch('/api/staff/licences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error??'Request failed.');
    return result;
  }
  async function issue(event:React.FormEvent){
    event.preventDefault();setPending(true);setMessage('');
    const id=requestId??crypto.randomUUID();setRequestId(id);
    try{const result=await post({action:'issue',count,requestId:id});setIssued(result.issued);setRequestId(null);router.refresh();}
    catch(error){setMessage(error instanceof Error?error.message:'Issuance failed.');}
    finally{setPending(false);}
  }
  async function change(event:React.FormEvent){
    event.preventDefault();if(!selected)return;setPending(true);setMessage('');
    try{await post({action:selected.action,id:selected.licence.id,reason});setMessage(selected.action==='reset'?'Device binding reset. The original expiry is preserved.':'Licence revoked.');setSelected(null);setReason('');router.refresh();}
    catch(error){setMessage(error instanceof Error?error.message:'Action failed.');}
    finally{setPending(false);}
  }
  function download(){
    const blob=new Blob([issued.map(row=>`${row.id}\t${row.key}`).join('\n')],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='keeel-licences.txt';link.click();URL.revokeObjectURL(url);
  }
  const visible=licences.filter(row=>(status==='all'||row.status===status)&&`${row.id} ${row.displaySuffix} ${row.platform??''} ${row.deviceFingerprint??''}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <>
    <section className="panel issue-panel" aria-labelledby="issue-title"><div><h2 id="issue-title">Issue licences</h2>
      <p>One licence per device. Valid for 12 months from first activation.</p></div>
      <form onSubmit={issue}><label htmlFor="licence-count">Number of licences</label>
        <input id="licence-count" type="number" min={1} max={100} required value={count} disabled={pending||!!issued.length} onChange={e=>setCount(Number(e.target.value))}/>
        <button disabled={pending||!!issued.length||!issuanceConfigured}>{pending?'Working…':'Create licences'}</button>
      </form>
      {!issuanceConfigured&&<p className="notice">Issuance requires the server licence digest key to be configured.</p>}
    </section>
    {!!issued.length&&<section className="panel key-panel" aria-labelledby="keys-title"><h2 id="keys-title">Save these licence keys</h2>
      <p>These {issued.length===1?'key is':'keys are'} shown once. Save them before leaving this page. The server stores only a keyed digest.</p>
      <label htmlFor="issued-keys">New keys</label><textarea id="issued-keys" readOnly rows={Math.min(issued.length+1,10)} value={issued.map(row=>`${row.id}\t${row.key}`).join('\n')}/>
      <div className="actions"><button onClick={download}>Download keys</button><button className="secondary" onClick={()=>{setIssued([]);setMessage('Keys dismissed. Full keys cannot be retrieved from the server.');}}>I have saved the keys</button></div>
    </section>}
    {message&&<p className="notice" role="status">{message}</p>}
    {selected&&<section className="panel confirm-panel" aria-labelledby="confirm-title"><h2 id="confirm-title">{selected.action==='reset'?'Reset device binding':'Revoke licence'} · …{selected.licence.displaySuffix}</h2>
      <p>{selected.action==='reset'?'The current device loses online access. Another device can activate using the same licence key, keeping the original expiry.':'Revocation permanently blocks future activation and online content access for this licence.'}</p>
      <p className="muted">A disconnected device can retain access until its signed offline entitlement expires.</p>
      <form onSubmit={change}><label htmlFor="action-reason">Reason for the audit record</label><textarea id="action-reason" minLength={10} maxLength={300} required value={reason} onChange={event=>setReason(event.target.value)} disabled={pending}/>
        <div className="actions"><button className={selected.action==='revoke'?'danger':''} disabled={pending}>Confirm {selected.action}</button>
          <button type="button" className="secondary" disabled={pending} onClick={()=>setSelected(null)}>Cancel</button></div></form>
    </section>}
    <section className="panel" aria-labelledby="list-title"><div className="section-heading"><h2 id="list-title">Licences</h2><span className="muted">{visible.length} of {licences.length}</span></div>
      <div className="filters"><div><label htmlFor="licence-search">Search ID, key suffix or device</label><input id="licence-search" type="search" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div><label htmlFor="licence-status">Status</label><select id="licence-status" value={status} onChange={e=>setStatus(e.target.value)}>
          {['all','pending','active','expired','revoked'].map(value=><option key={value} value={value}>{value==='pending'?'Awaiting activation':value[0].toUpperCase()+value.slice(1)}</option>)}
        </select></div></div>
      {!visible.length?<p className="empty">{licences.length?'No licences match your filters.':'Create your first licence to get started.'}</p>:<div className="table-scroll"><table><thead><tr><th>Licence</th><th>Status</th><th>Device</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>
        {visible.map(row=><tr key={row.id}><td><Link href={`/dashboard/licences/${row.id}`}><strong>…{row.displaySuffix}</strong></Link><small>{row.id}</small><small>Issued {date(row.createdAt)}</small></td>
          <td><span className={`badge ${row.status}`}>{row.status==='pending'?'Awaiting activation':row.status}</span></td>
          <td>{row.platform?<><strong>{row.platform==='windows'?'Windows':'Android'}</strong><small>{row.deviceFingerprint}</small><small>Bound {date(row.deviceActivatedAt)}</small></>:'Unbound'}</td>
          <td>{row.expiresAt?<>{date(row.expiresAt)}<small>First activated {date(row.firstActivatedAt)}</small></>:'Starts on first activation'}</td>
          <td><div className="row-actions"><Link href={`/dashboard/licences/${row.id}`}>History</Link>
            <button className="secondary" disabled={pending||!row.platform||row.status==='revoked'||row.status==='expired'} onClick={()=>{setSelected({licence:row,action:'reset'});setReason('');setMessage('');}}>Reset device</button>
            <button className="danger" disabled={pending||row.status==='revoked'} onClick={()=>{setSelected({licence:row,action:'revoke'});setReason('');setMessage('');}}>Revoke</button></div></td></tr>)}
      </tbody></table></div>}
      {licences.length===1000&&<p className="muted">Showing the latest 1,000 licences.</p>}
    </section>
  </>;
}
