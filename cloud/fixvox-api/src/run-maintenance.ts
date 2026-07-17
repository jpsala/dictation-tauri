import { composeApi } from "./composition.ts";
import { runMaintenanceJobs } from "./jobs.ts";

const api = composeApi();
try {
  const result = await runMaintenanceJobs({
    async releaseExpiredReservations() {
      const rows = await api.sql.unsafe<{ id: string }>(`
        UPDATE usage_reservations SET state = 'expired', updated_at = now()
        WHERE state = 'reserved' AND expires_at <= now() RETURNING id::text
      `);
      return rows.length;
    },
    async refreshSafeProjections() {
      await api.sql.unsafe("SELECT 1 FROM control_plane_authority WHERE singleton = true");
    },
  });
  if (result.some((job) => !job.ok)) process.exitCode = 1;
} finally {
  await api.close();
}
