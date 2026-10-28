import type { BankState, SavingPlan } from '../types'

const plans: SavingPlan[] = [
  {
    id: 'plan-30',
    name: { vi: 'Linh hoạt 30', en: 'Flexible 30' },
    tenorDays: 30,
    aprBps: 175,
    minDeposit: 100,
    maxDeposit: 25_000,
    penaltyBps: 200,
    enabled: true,
    description: {
      vi: 'Dành cho khoản tiền cần quay vòng nhanh trong tháng.',
      en: 'For money you need back within the month.',
    },
  },
  {
    id: 'plan-90',
    name: { vi: 'Cân bằng 90', en: 'Balanced 90' },
    tenorDays: 90,
    aprBps: 225,
    minDeposit: 500,
    maxDeposit: 100_000,
    penaltyBps: 400,
    enabled: true,
    popular: true,
    description: {
      vi: 'Kỳ hạn cân bằng giữa lãi suất và khả năng xoay vốn.',
      en: 'A balance between yield and access to your capital.',
    },
  },
  {
    id: 'plan-180',
    name: { vi: 'Tích lũy 180', en: 'Accumulate 180' },
    tenorDays: 180,
    aprBps: 300,
    minDeposit: 1_000,
    maxDeposit: 250_000,
    penaltyBps: 450,
    enabled: true,
    description: {
      vi: 'Một nửa năm giữ nhịp tích lũy với mức phạt rút sớm vừa phải.',
      en: 'Half a year of steady saving with a moderate early-withdrawal penalty.',
    },
  },
  {
    id: 'plan-365',
    name: { vi: 'Trường kỳ 365', en: 'Long term 365' },
    tenorDays: 365,
    aprBps: 400,
    minDeposit: 2_500,
    maxDeposit: 500_000,
    penaltyBps: 500,
    enabled: true,
    description: {
      vi: 'Kỳ hạn dài cho phần vốn chưa cần dùng trong năm tới.',
      en: 'For capital you will not need during the next year.',
    },
  },
]

export function createSeedState(): BankState {
  return {
    plans,
    deposits: [],
    wallet: {
      connected: false,
      mode: null,
      address: null,
      balance: 12_480,
    },
    vault: {
      balance: 100_000,
    },
    nextCertificateNo: 1,
  }
}
