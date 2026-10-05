'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';

const destinations=[{href:'/dashboard/overview',label:'Overview',icon:'◈'},
  {href:'/dashboard/content',label:'Content library',icon:'▤'},
  {href:'/dashboard/curriculum',label:'Curriculum',icon:'▦'},
  {href:'/dashboard',label:'Licences',icon:'◇'}];

export default function ConsoleShell({email,roles,children}:{email:string;roles:string[];children:React.ReactNode}) {
  const pathname=usePathname(),[open,setOpen]=useState(false),toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>setOpen(false),[pathname]);
  function close(){setOpen(false);toggle.current?.focus();}
  const current=destinations.find(d=>d.href==='/dashboard'?pathname==='/dashboard'||pathname.startsWith('/dashboard/licences'):pathname.startsWith(d.href));
  return <div className="portal-shell" onKeyDown={event=>{if(event.key==='Escape'&&open)close();}}>
    <a className="skip-link" href="#workspace">Skip to content</a>
    <aside className={`portal-sidebar ${open?'is-open':''}`} id="company-navigation" aria-label="Company navigation">
      <Link className="portal-logo" href="/dashboard/overview"><span aria-hidden="true">▥</span> KEEEL</Link>
      <p className="eyebrow">COMPANY CONSOLE</p>
      <nav aria-label="Main navigation">{destinations.map(d=><Link key={d.href} href={d.href} aria-current={current?.href===d.href?'page':undefined} onClick={()=>setOpen(false)}><span aria-hidden="true">{d.icon}</span>{d.label}</Link>)}</nav>
      <div className="sidebar-note"><strong>Little discoveries.<br/>Lasting learning.</strong><p>Manage content and device licences in one place.</p></div>
    </aside>
    <div className="portal-workspace">
      <header className="portal-topbar"><button ref={toggle} type="button" className="secondary menu-toggle" aria-controls="company-navigation" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close':'Menu'}</button><span>Workspace <span aria-hidden="true"> / </span> <strong>{current?.label??'Content'}</strong></span><div className="staff-identity"><span>{email}<small>{roles.join(' · ')}</small></span><form action="/api/staff/logout" method="post"><button className="secondary">Sign out</button></form></div></header>
      <div id="workspace" tabIndex={-1}>{children}</div>
    </div>
  </div>;
}
