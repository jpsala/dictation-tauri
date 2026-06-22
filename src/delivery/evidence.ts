import type {
  DeliveryEvidence,
  DeliveryRequest,
  DeliveryStatus,
  DeliveryStrategy,
} from "./types";

export const forbiddenDefaultDeliveryStatuses = ["paste_observed"] as const;

export type DeliveryEvidenceDraft = {
  status: DeliveryStatus;
  output?: string;
  strategy?: DeliveryStrategy;
  message?: string;
  reason?: string;
  targetAfter?: DeliveryEvidence["targetAfter"];
};

export type DeliveryEvidenceOptions = {
  allowVerifiedPasteObservation?: boolean;
};

export function createReviewOnlyEvidence(
  request: DeliveryRequest,
): DeliveryEvidence {
  return {
    status: "available",
    output: request.text,
    strategy: "review_only",
    message: "Transcript is available for review and manual copy.",
    targetBefore: request.targetSnapshot,
  };
}

export function deriveDeliveryEvidence(
  request: DeliveryRequest,
  draft?: DeliveryEvidenceDraft,
  options: DeliveryEvidenceOptions = {},
): DeliveryEvidence {
  if (!draft || request.strategy === "review_only") {
    return createReviewOnlyEvidence(request);
  }

  const status = normalizeStatusForRequest(request, draft.status);
  const evidence: DeliveryEvidence = {
    status,
    output: draft.output ?? request.text,
    strategy: draft.strategy ?? request.strategy,
    message: draft.message ?? defaultDeliveryMessage(status),
    reason: draft.reason,
    targetBefore: request.targetSnapshot,
    targetAfter: draft.targetAfter,
  };

  assertDefaultDeliveryEvidenceAllowed(evidence, options);

  return evidence;
}

export function assertDefaultDeliveryEvidenceAllowed(
  evidence: DeliveryEvidence,
  options: DeliveryEvidenceOptions = {},
): void {
  if (
    evidence.status === "paste_observed" &&
    options.allowVerifiedPasteObservation !== true
  ) {
    throw new Error(
      "paste_observed is forbidden without a verified desktop observer.",
    );
  }
}

export function isPasteObservedEvidence(evidence: DeliveryEvidence): boolean {
  return evidence.status === "paste_observed";
}

function normalizeStatusForRequest(
  request: DeliveryRequest,
  status: DeliveryStatus,
): DeliveryStatus {
  if (status === "paste_sent" && !request.allowDesktopSideEffects) {
    return "uncertain";
  }

  return status;
}

function defaultDeliveryMessage(status: DeliveryStatus): string {
  switch (status) {
    case "available":
      return "Transcript is available for review and manual copy.";
    case "copied":
      return "Transcript was copied; target insertion was not observed.";
    case "paste_sent":
      return "Paste command was sent but target insertion was not observed.";
    case "failed":
      return "Delivery failed; transcript remains available for review.";
    case "uncertain":
      return "Delivery outcome is uncertain; transcript remains available.";
    case "paste_observed":
      return "Paste insertion was observed by a verified desktop observer.";
  }
}
