import {redirect} from 'next/navigation';
import {staffClient,getStaff} from '../../lib/staff-auth';
import ConsoleShell from './console-shell';

export default async function DashboardLayout({children}:{children:React.ReactNode}) {
  const client=await staffClient();
  const staff=client?await getStaff(client):null;
  if(!staff)redirect('/login');
  return <ConsoleShell email={staff.email??'Company staff'} roles={staff.roles}>{children}</ConsoleShell>;
}
