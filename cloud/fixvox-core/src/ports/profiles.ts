export interface ProfilePublicationPort<TAction extends string = string, TResult = unknown> {
  mutate(action: TAction, payload: unknown): Promise<TResult>;
}
