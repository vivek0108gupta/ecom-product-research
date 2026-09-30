import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric` comes back as a string through node-postgres (to protect precision).
 * Money and scores in this system are small enough for IEEE doubles, and every consumer
 * wants a number, so convert at the boundary. NULL stays NULL — never coerced to 0.
 */
export const NumericTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null => (value === null || value === undefined ? null : value),
  from: (value: string | null): number | null => (value === null ? null : Number.parseFloat(value)),
};
