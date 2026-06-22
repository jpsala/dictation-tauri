export type {
  DeliveryEvidence,
  DeliveryRequest,
  DeliveryStatus,
  DeliveryStrategy,
  DesktopDeliveryGateway,
  DesktopTargetConfidence,
  DesktopTargetSnapshot,
} from "./types";

export {
  deliveryStatuses,
  deliveryStrategies,
} from "./types";

export {
  assertDefaultDeliveryEvidenceAllowed,
  createReviewOnlyEvidence,
  deriveDeliveryEvidence,
  forbiddenDefaultDeliveryStatuses,
  isPasteObservedEvidence,
} from "./evidence";
export type {
  DeliveryEvidenceDraft,
  DeliveryEvidenceOptions,
} from "./evidence";
export {
  createCopyDeliveryGateway,
  createPasteSendDeliveryGateway,
  createReviewOnlyDeliveryGateway,
} from "./adapters";
export type {
  CopyDeliveryGatewayOptions,
  CopyDeliveryWriter,
  PasteSendDeliveryGatewayOptions,
} from "./adapters";
