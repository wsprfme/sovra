import { redirect } from 'next/navigation';
import { coreClient } from '@/lib/core-client';
import { getSessionToken } from '@/lib/session';

export default async function Home() {
  const status = await coreClient.status();
  if (!status.hasAccount) {
    redirect('/setup');
  }
  const token = await getSessionToken();
  if (!token) {
    redirect('/login');
  }
  redirect('/files');
}
