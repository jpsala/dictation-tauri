import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { formatDoctorReport, runAosDoctor } from "../../scripts/lib/aos-doctor.ts";

export default function aosDoctor(omp: ExtensionAPI) {
  omp.registerCommand("doctor", {
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
