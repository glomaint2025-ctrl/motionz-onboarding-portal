'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { LeadRequestForm } from '@/components/portal/LeadRequestForm';

/** Client portal → Leads → Request a lead replacement. Follows the Leads section (module `leads`). */
export default function LeadReplacementPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';
  return <LeadRequestForm clientId={clientId} type="replacement" />;
}
