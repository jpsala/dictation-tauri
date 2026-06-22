import { redactHostRuntimeText } from "../host-runtime/redaction";
import {
  createReviewOnlyEvidence,
  deriveDeliveryEvidence,
} from "./evidence";
import type {
  DeliveryRequest,
  DesktopDeliveryGateway,
} from "./types";

export type CopyDeliveryWriter = (
  text: string,
  request: DeliveryRequest,
) => Promise<void> | void;

export type CopyDeliveryGatewayOptions = {
  copyText?: CopyDeliveryWriter;
  successReason?: string;
};

export type PasteSendDeliveryGatewayOptions = {
  reason?: string;
  failWith?: string;
};

export function createReviewOnlyDeliveryGateway(): DesktopDeliveryGateway {
  return {
    async deliver(request) {
      return createReviewOnlyEvidence({
        ...request,
        strategy: "review_only",
        allowDesktopSideEffects: false,
      });
    },
  };
}

export function createCopyDeliveryGateway(
  options: CopyDeliveryGatewayOptions = {},
): DesktopDeliveryGateway {
  return {
    async deliver(request) {
      const copyRequest = {
        ...request,
        strategy: "copy" as const,
      };

      try {
        await options.copyText?.(copyRequest.text, copyRequest);
      } catch (error) {
        return deriveDeliveryEvidence(copyRequest, {
          status: "failed",
          reason: redactedReason(error, "Copy delivery failed."),
        });
      }

      return deriveDeliveryEvidence(copyRequest, {
        status: "copied",
        reason: options.successReason ?? "Transcript copied as fallback.",
      });
    },
  };
}

export function createPasteSendDeliveryGateway(
  options: PasteSendDeliveryGatewayOptions = {},
): DesktopDeliveryGateway {
  return {
    async deliver(request) {
      const pasteRequest = {
        ...request,
        strategy: "paste_send" as const,
      };

      if (options.failWith) {
        return deriveDeliveryEvidence(pasteRequest, {
          status: "failed",
          reason: redactedReason(options.failWith, "Paste delivery failed."),
        });
      }

      return deriveDeliveryEvidence(pasteRequest, {
        status: "paste_sent",
        reason: redactedReason(
          options.reason,
          "Paste command was sent without observation.",
        ),
      });
    },
  };
}

function redactedReason(error: unknown, fallback: string): string {
  return redactHostRuntimeText(error ?? fallback, { maxMessageLength: 220 });
}
