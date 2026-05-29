import { redirect } from 'next/navigation';
import { coreClient } from '@/lib/core-client';
import { setupAction } from '@/app/actions/auth';
import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const status = await coreClient.status();
  if (status.hasAccount) {
    redirect('/login');
  }
  return <AuthForm mode="setup" action={setupAction} />;
}
