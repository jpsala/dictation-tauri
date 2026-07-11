export const deliveryStrategies = [
  "review_only",
  "copy",
  "paste_send",
  "unknown",
] as const;

export type DeliveryStrategy = (typeof deliveryStrategies)[number];

export const deliveryStatuses = [
  "available",
  "copied",
  "paste_sent",
  "failed",
  "uncertain",
  "paste_observed",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

export type DesktopTargetConfidence = "none" | "low" | "medium" | "high";

export type DesktopTargetSnapshot = {
  capturedAt?: string;
  appLabel?: string;
  windowLabel?: string;
  confidence: DesktopTargetConfidence;
};

export type DeliveryTargetAffinity = "current" | "saved";

export type DeliveryRequest = {
  sessionId: string;
  text: string;
  strategy: DeliveryStrategy;
  allowDesktopSideEffects: boolean;
  targetSnapshot?: DesktopTargetSnapshot;
  targetAffinity?: DeliveryTargetAffinity;
};

export type DeliveryEvidence = {
  status: DeliveryStatus;
  output?: string;
  strategy: DeliveryStrategy;
  message: string;
  reason?: string;
  targetBefore?: DesktopTargetSnapshot;
  targetAfter?: DesktopTargetSnapshot;
};

export interface DesktopDeliveryGateway {
  deliver(request: DeliveryRequest): Promise<DeliveryEvidence>;
}
