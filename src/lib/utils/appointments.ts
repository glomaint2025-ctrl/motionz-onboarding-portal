/**
 * The start time of a client's next call with their CSM: the earliest appointment that is still
 * in the future and has not been cancelled. Null when nothing is booked.
 * Used by the client Home page ("Next CSM Call").
 */
export function nextUpcomingCall(
  appointments: { appointment_time: string; status?: string | null }[] | null | undefined,
  now: number = Date.now()
): string | null {
  const upcoming = (appointments || [])
    .filter((a) => new Date(a.appointment_time).getTime() > now && !/cancel/i.test(a.status || ''))
    .sort((a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime());
  return upcoming[0]?.appointment_time || null;
}
