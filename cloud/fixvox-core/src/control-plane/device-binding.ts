import type { ControlPlaneStoragePort, IdPort } from "../ports";

export class DeviceBindingConflictError extends Error {
  readonly code = "device_binding_conflict";

  constructor() {
    super("Device binding conflicts with an existing registration.");
    this.name = "DeviceBindingConflictError";
  }
}

type ResolveDeviceBindingInput<TRecord extends { installId: string }> = {
  storage: ControlPlaneStoragePort;
  ids: IdPort;
  installId: string;
  suppliedDeviceId: string | null;
  installKey: (installId: string) => string;
  deviceKey: (deviceId: string) => string;
  parseMappedDeviceId: (raw: string | null) => string | null;
  parseRecord: (raw: string | null) => TRecord | null;
};

export async function resolveDeviceBinding<TRecord extends { installId: string }>(
  input: ResolveDeviceBindingInput<TRecord>,
): Promise<{
  mappedDeviceId: string | null;
  deviceId: string;
  recordKey: string;
  previous: TRecord | null;
}> {
  const mappedDeviceId = input.parseMappedDeviceId(await input.storage.get(input.installKey(input.installId)));
  if (input.suppliedDeviceId && mappedDeviceId && input.suppliedDeviceId !== mappedDeviceId) {
    throw new DeviceBindingConflictError();
  }

  const deviceId = input.suppliedDeviceId ?? mappedDeviceId ?? `dev_${input.ids.randomUuid()}`;
  const recordKey = input.deviceKey(deviceId);
  const previous = input.parseRecord(await input.storage.get(recordKey));
  if (previous && previous.installId !== input.installId) {
    throw new DeviceBindingConflictError();
  }

  return { mappedDeviceId, deviceId, recordKey, previous };
}
