export interface ProviderPort {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
