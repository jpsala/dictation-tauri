import type { ReactNode } from "react";
import {
  settingEffectLabels,
  settingScopeLabels,
  settingSourceLabels,
  type SettingAvailability,
  type SettingProvenance,
} from "../section-contracts";

export type SettingRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  htmlFor?: string;
  layout?: "inline" | "stacked";
  provenance?: SettingProvenance;
  availability?: SettingAvailability;
  relation?: ReactNode;
  status?: ReactNode;
};

export function SettingRow({
  label,
  description,
  children,
  htmlFor,
  layout = "inline",
  provenance,
  availability,
  relation,
  status,
}: SettingRowProps) {
  const metadata = provenance ? [
    settingSourceLabels[provenance.source],
    provenance.scope ? settingScopeLabels[provenance.scope] : undefined,
    provenance.effect ? settingEffectLabels[provenance.effect] : undefined,
    provenance.detail,
  ].filter((item): item is string => Boolean(item)) : [];
  const unavailable = availability?.state === "disabled" || availability?.state === "managed"
    ? availability
    : undefined;
  const copy = (
    <span className="setting-row-copy">
      <strong>{label}</strong>
      {description ? <span>{description}</span> : null}
      {metadata.length ? (
        <span className="setting-row-metadata" aria-label={`Procedencia: ${metadata.join(". ")}`}>
          {metadata.map((item) => <span key={item}>{item}</span>)}
        </span>
      ) : null}
      {unavailable ? (
        <span className="setting-row-availability" role="status">
          {unavailable.state === "managed" ? "Administrado: " : "No disponible: "}{unavailable.reason}
        </span>
      ) : null}
      {relation ? <span className="setting-row-relation">{relation}</span> : null}
      {status ? <span className="setting-row-status" role="status">{status}</span> : null}
    </span>
  );
  return (
    <div
      className="setting-row"
      data-layout={layout}
      data-availability={availability?.state}
      aria-disabled={unavailable ? true : undefined}
    >
      {htmlFor ? <label htmlFor={htmlFor}>{copy}</label> : copy}
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
