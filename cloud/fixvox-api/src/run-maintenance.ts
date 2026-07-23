import { composeApi } from "./composition.ts";
import { runMaintenanceJobs } from "./jobs.ts";
import { PostgresBudgetLedgerMaintenanceRepository } from "./postgres/budget-ledger-maintenance-repository.ts";

const api = composeApi();
const budgetMaintenance = new PostgresBudgetLedgerMaintenanceRepository(api.sql);
try {
  const result = await runMaintenanceJobs({
    async releaseExpiredReservations() {
      const rows = await api.sql.unsafe<{ id: string }>(`
        UPDATE usage_reservations SET state = 'expired', updated_at = now()
        WHERE state = 'reserved' AND expires_at <= now() RETURNING id::text
      `);
      const budget = await budgetMaintenance.expireDueReservations({
        now: new Date().toISOString(),
        limit: 100,
      });
      return rows.length + budget.expiredCount;
    },
    async publishBudgetLedgerOutbox() {
      const result = await budgetMaintenance.publishPendingOutbox({ limit: 100 });
      return result.publishedCount;
    },
    async refreshSafeProjections() {
      await api.sql.unsafe("SELECT 1 FROM control_plane_authority WHERE singleton = true");
    },
    async expireAuthHandoffs() {
      const oauth = await api.sql.unsafe(`UPDATE oauth_states SET result_status = 'expired' WHERE expires_at <= now() AND result_status = 'pending' RETURNING state_hash`);
      const desktop = await api.sql.unsafe(`UPDATE desktop_login_sessions SET status = 'expired', updated_at = now() WHERE expires_at <= now() AND status = 'pending' RETURNING session_hash`);
      return oauth.length + desktop.length;
    },
    async pruneProductSignals() {
      const rows = await api.sql.unsafe<{ count: string }>(`WITH deleted AS (DELETE FROM feedback_events WHERE occurred_at < now() - interval '30 days' RETURNING 1) SELECT count(*)::text AS count FROM deleted`);
      return Number(rows[0]?.count ?? 0);
    },
  });
  if (result.some((job) => !job.ok)) process.exitCode = 1;
} finally {
  await api.close();
}
