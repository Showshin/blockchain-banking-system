# Product spec — Online Banking System

## Mục tiêu

Xây dựng hệ thống tiền gửi có kỳ hạn trên smart contract. Người gửi khóa token, nhận chứng chỉ NFT, hưởng lãi đơn và có thể tất toán hoặc tái tục. Quản trị viên tạo gói, quản lý kho lãi và tạm dừng hệ thống.

## Ba contract bắt buộc

| Contract | Trách nhiệm | Ranh giới quan trọng |
|---|---|---|
| `MockUSDC` | ERC-20 6 decimals, mint được để test | Không dùng USDC thật để mint |
| `VaultManager` | Giữ tiền lãi của ngân hàng, fee receiver, pause | Không giữ gốc của người gửi |
| `SavingCore` | Gói, mở sổ, tính lãi/phạt, NFT, tất toán, tái tục | Không trả lãi từ pool gốc |

## Luồng bắt buộc

1. **Open** — kiểm tra gói, min/max, chuyển gốc vào `SavingCore`, mint NFT, lưu snapshot APR và penalty.
2. **Withdraw at maturity** — trả gốc + lãi đơn; lãi lấy từ `VaultManager`; nếu vault thiếu tiền thì revert theo spec gốc.
3. **Early withdrawal** — không trả lãi; trừ penalty từ gốc; penalty chuyển cho fee receiver.
4. **Manual renew** — chỉ sau maturity; lãi cộng vào gốc; mint chứng chỉ mới; đánh dấu sổ cũ `ManualRenewed`.
5. **Auto renew** — sau grace period; bot gọi; giữ nguyên APR gốc; tạo sổ mới cùng tenor.

## Công thức

```text
interest = principal * aprBpsAtOpen * tenorDays / (365 * 10_000)
penalty  = principal * penaltyBpsAtOpen / 10_000
payout at maturity = principal + interest
payout early       = principal - penalty
new principal      = principal + interest
```

Tính bằng integer arithmetic; nhân trước, chia sau. Không dùng số thực trong contract.

## Sự kiện bắt buộc

`PlanCreated`, `PlanUpdated`, `DepositOpened`, `Withdrawn`, `Renewed` với các trường theo đề bài.

## Kiểm thử tối thiểu

- `createPlan`: valid, disabled, invalid APR.
- `openDeposit`: happy path, below min, above max, disabled plan.
- `withdrawAtMaturity`: đúng lãi, quá sớm, đã tất toán.
- `earlyWithdraw`: đúng penalty, không trả lãi.
- `renewDeposit`: principal mới, status.
- `autoRenewDeposit`: trước grace fail, sau grace pass, APR khóa.
- Vault: fund, withdraw, thiếu tiền trả lãi.
- Pause: chặn withdraw.
- Coverage > 90%.

## Personal variant

MSSV **22665321** cho ra `A = 1`, `B = 2`. Đây là bộ tham số chính thức dùng cho contract, test, dữ liệu demo và video:

| Tham số | Công thức | Giá trị chính thức |
|---|---|---|
| Grace period | `(A mod 3) + 2` ngày | 3 ngày |
| APR mặc định | `200 + A * 25` bps | 225 bps = 2.25% |
| Penalty | `300 + B * 50` bps | 400 bps = 4.00% |
| Tenor mặc định | B chẵn 90 ngày, B lẻ 180 ngày | 90 ngày |

Giá trị này đã được khóa trong test, deployment và dữ liệu frontend. Video cuối kỳ phải dùng đúng bộ số này.

## Deliverables

- Source contract + test Hardhat coverage > 90%.
- Frontend React song ngữ Việt/Anh, nối MetaMask, xem plan, mở sổ, xem sổ, tất toán/tái tục.
- README có hướng dẫn chạy, personal variant và **Design Answers**.
- Video demo 3–5 phút.
