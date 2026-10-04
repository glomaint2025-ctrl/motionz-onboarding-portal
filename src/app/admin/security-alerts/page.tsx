'use client';

import React from 'react';
import { LogExplorer } from '../_components/LogExplorer';

export default function SecurityAlertsPage() {
  return (
    <LogExplorer
      kind="security"
      title="Security Alerts"
      description="Sign-ins, failed attempts and blocked access, grouped by day. Times are shown in your local time."
    />
  );
}
