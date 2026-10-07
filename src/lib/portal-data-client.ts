/**
 * Browser-side loading of `/api/portal/[clientId]/data`.
 *
 * The portal layout loads it first (to know who is signed in and which sections are on) and only
 * then shows the page, and most pages need the very same answer straight away. Without this, every
 * page view asked the server twice, one after the other. The layout's answer is now handed to the
 * page: once, and only if it is a few seconds old. Anything later (a refresh after saving, moving
 * to another section) asks the server again, so nothing stale is kept.
 */

const HANDOFF_MS = 5000;

let handoff: { clientId: string; at: number; response: Promise<Response> } | null = null;

const request = (clientId: string) => fetch(`/api/portal/${clientId}/data`);

/** For the portal layout: always asks the server, and keeps the answer for the page about to render. */
export function loadPortalData(clientId: string): Promise<Response> {
  const response = request(clientId);
  const entry = { clientId, at: Date.now(), response };
  handoff = entry;
  response.catch(() => {
    if (handoff === entry) handoff = null;
  });
  return response.then((res) => res.clone());
}

/** For portal pages: the layout's fresh answer if there is one (used once), otherwise a new request. */
export function fetchPortalData(clientId: string): Promise<Response> {
  const entry = handoff;
  if (entry && entry.clientId === clientId && Date.now() - entry.at < HANDOFF_MS) {
    handoff = null;
    // A failed layout request is not passed on: the page makes its own.
    return entry.response.then(
      (res) => (res.ok ? res.clone() : request(clientId)),
      () => request(clientId)
    );
  }
  handoff = null;
  return request(clientId);
}
