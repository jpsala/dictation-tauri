import { formatDoctorReport, runAosDoctor } from "./lib/aos-doctor.ts";

const report = runAosDoctor(process.cwd());
console.log(formatDoctorReport(report));
process.exitCode = report.errors ? 1 : 0;
