export interface ClockPort {
  now(): Date;
}

export interface IdPort {
  randomUuid(): string;
}
