import { redactHostRuntimeText } from "../host-runtime/redaction";
import { deriveDeliveryEvidence } from "./evidence";
import type {
  DeliveryEvidence,
  DeliveryRequest,
  DesktopTargetConfidence,
  DesktopTargetSnapshot,
} from "./types";

export const pasteObservationStatuses = [
  "observed",
  "not_observed",
  "mismatch",
  "unsupported",
  "timeout",
] as const;

export type PasteObservationStatus = (typeof pasteObservationStatuses)[number];

export type PasteObservation = {
  status: PasteObservationStatus;
  confidence: DesktopTargetConfidence;
  reason: string;
  targetAfter?: DesktopTargetSnapshot;
};

export type PasteObservationInput<TTarget = unknown> = {
  sessionId: string;
  text: string;
  target: TTarget;
  targetBefore?: DesktopTargetSnapshot;
  pasteSentReason?: string;
};

export interface DesktopPasteObserver<TTarget = unknown> {
  observe(input: PasteObservationInput<TTarget>): Promise<PasteObservation>;
}

export type ObservedPasteEvidenceOptions = {
  pasteSentReason?: string;
};

export function deriveObservedPasteEvidence(
  request: DeliveryRequest,
  observation: PasteObservation,
  options: ObservedPasteEvidenceOptions = {},
): DeliveryEvidence {
  if (isVerifiedPasteObservation(request, observation)) {
    return deriveDeliveryEvidence(
      request,
      {
        status: "paste_observed",
        reason: observation.reason,
        targetAfter: observation.targetAfter,
      },
      { allowVerifiedPasteObservation: true },
    );
  }

  return deriveDeliveryEvidence(request, {
    status: "paste_sent",
    reason: observation.reason || options.pasteSentReason,
    targetAfter: observation.targetAfter,
  });
}

export function derivePasteObserverErrorEvidence(
  request: DeliveryRequest,
  error: unknown,
): DeliveryEvidence {
  return deriveDeliveryEvidence(request, {
    status: "paste_sent",
    reason: redactHostRuntimeText(error, {
      maxMessageLength: 220,
    }),
  });
}

export function isVerifiedPasteObservation(
  request: DeliveryRequest,
  observation: PasteObservation,
): boolean {
  return (
    request.allowDesktopSideEffects &&
    request.strategy === "paste_send" &&
    observation.status === "observed" &&
    observation.confidence === "high"
  );
}
