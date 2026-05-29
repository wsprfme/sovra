import { redirect } from 'next/navigation';
import { coreClient } from '@/lib/core-client';
import { loginAction } from '@/app/actions/auth';
import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const status = await coreClient.status();
  if (!status.hasAccount) {
    redirect('/setup');
  }
  return <AuthForm mode="login" action={loginAction} />;
}
