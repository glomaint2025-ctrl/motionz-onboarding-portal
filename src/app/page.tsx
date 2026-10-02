import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? verifySession(sessionCookie) : null;

  if (!session) {
    redirect('/auth/login');
  }

  if (session.role === 'admin') {
    redirect('/admin');
  }

  if (session.role === 'csm') {
    redirect('/csm');
  }

  if (session.role === 'client' || session.role === 'client_member') {
    const targetPortal = session.tenantId ? `/portal/${session.tenantId}` : '/portal/demo';
    redirect(targetPortal);
  }

  redirect('/auth/login');
}
