import { redirect } from 'next/navigation';

/** The CSM home is the client list itself; there is no separate overview page. */
export default function CSMHomePage() {
  redirect('/csm/clients');
}
