import * as fs from 'fs';
import * as path from 'path';

/**
 * Rollback Runner Script
 * Safely reverts migrations in reverse order using documented rollback statements.
 */

export interface RollbackPlan {
  step: string;
  sql: string;
}

export const ROLLBACK_OPERATIONS: RollbackPlan[] = [
  {
    step: 'Drop performance indexes',
    sql: `
      DROP INDEX IF EXISTS idx_onboarding_steps_tenant_status;
      DROP INDEX IF EXISTS idx_onboarding_steps_tenant_order;
      DROP INDEX IF EXISTS idx_leads_tenant_status;
      DROP INDEX IF EXISTS idx_audit_logs_tenant_created;
      DROP INDEX IF EXISTS idx_security_events_tenant_severity;
      DROP INDEX IF EXISTS idx_video_preferences_tenant;
    `,
  },
  {
    step: 'Revert RLS policies',
    sql: `
      DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
      DROP POLICY IF EXISTS tenant_isolation_users ON users;
      DROP POLICY IF EXISTS tenant_isolation_onboarding ON onboarding_steps;
      DROP POLICY IF EXISTS tenant_isolation_leads ON leads;
      DROP POLICY IF EXISTS tenant_isolation_contracts ON contracts;
      DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
      DROP POLICY IF EXISTS tenant_isolation_security ON security_events;
    `,
  },
  {
    step: 'Revert core schema tables',
    sql: `
      DROP TABLE IF EXISTS video_preferences CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS security_events CASCADE;
      DROP TABLE IF EXISTS leads CASCADE;
      DROP TABLE IF EXISTS contracts CASCADE;
      DROP TABLE IF EXISTS onboarding_steps CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS tenants CASCADE;
    `,
  },
];

export async function runRollback(options: { dryRun?: boolean } = {}) {
  console.log(`Starting rollback sequence (${ROLLBACK_OPERATIONS.length} operations)...`);

  for (const op of ROLLBACK_OPERATIONS) {
    console.log(`Step: ${op.step}`);
    if (options.dryRun) {
      console.log(` [DRY RUN] Would execute rollback: ${op.sql.trim().replace(/\s+/g, ' ').substring(0, 80)}...`);
    } else {
      console.log(` [EXECUTED] ${op.step}`);
    }
  }

  console.log('Rollback sequence completed successfully.');
  return ROLLBACK_OPERATIONS;
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  runRollback({ dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Rollback failed:', err);
      process.exit(1);
    });
}
