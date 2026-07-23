import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatDoctorReport, runAosDoctor } from "../../scripts/lib/aos-doctor.ts";

export default function aosDoctor(pi: ExtensionAPI) {
  pi.registerCommand("doctor", {
    description: "Auditar foco, referencias, índice y carga del AOS sin modificar archivos",
    handler: async (_args, ctx) => {
      const report = runAosDoctor(ctx.cwd);
      ctx.ui.notify(
        formatDoctorReport(report, 6),
        report.errors ? "error" : report.warnings ? "warning" : "info",
      );
    },
  });
}
