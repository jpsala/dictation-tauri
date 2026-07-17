export interface RequestEventPort<TEvent> {
  append(event: TEvent): Promise<void>;
}
