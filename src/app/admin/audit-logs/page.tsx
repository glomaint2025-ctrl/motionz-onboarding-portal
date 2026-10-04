'use client';

import React from 'react';
import { LogExplorer } from '../_components/LogExplorer';

export default function AuditLogsPage() {
  return (
    <LogExplorer
      kind="audit"
      title="Audit Logs"
      description="Who changed what in the portal, grouped by day. Times are shown in your local time."
    />
  );
}
