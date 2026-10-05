import type { Metadata } from 'next';
import './globals.css';
import './portal-theme.css';
export const metadata:Metadata={title:'KEEEL · Company Console'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
