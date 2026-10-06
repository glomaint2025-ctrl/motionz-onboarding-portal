'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { LeadRequestForm } from '@/components/portal/LeadRequestForm';

/** Client portal → Leads → Report an unresponsive lead. Follows the Leads section (module `leads`). */
export default function UnresponsiveLeadPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';
  return <LeadRequestForm clientId={clientId} type="unresponsive" />;
}
