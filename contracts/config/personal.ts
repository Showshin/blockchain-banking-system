export const STUDENT_ID = "22665321";
export const A = 1;
export const B = 2;

export const GRACE_PERIOD_DAYS = BigInt((A % 3) + 2);
export const DEFAULT_APR_BPS = 200 + A * 25;
export const DEFAULT_PENALTY_BPS = 300 + B * 50;
export const DEFAULT_TENOR_DAYS = B % 2 === 0 ? 90 : 180;

export const DAY_SECONDS = 24n * 60n * 60n;
export const GRACE_PERIOD_SECONDS = GRACE_PERIOD_DAYS * DAY_SECONDS;
export const DEFAULT_TENOR_SECONDS = BigInt(DEFAULT_TENOR_DAYS) * DAY_SECONDS;
