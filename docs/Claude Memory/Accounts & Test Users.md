# 👤 Accounts & Test Users

> ⚠️ SANITIZED FOR GIT — Passwords and private keys replaced with [REDACTED]. See .env files and DB on VPS for real values.

## Production Test Accounts

### Richard Wayne (Primary Test Account)
```
Email:        richardthebrucewayne@gmail.com
Internal ID:  db01a59c-a418-4da0-a4aa-fb032d500b04
Owen UUID:    72459d0e-8705-4b5d-bb40-904e4ae8a3a1  (same as sd3_user_id)
KYC status:   approved
Card ID:      b2e45dbc-898e-4881-9ff1-27e3640bb759
Card number:  2214 8394 9218 9587
Card balance: $0.00 (as of 2026-03-26)
EVM deposit:  0x75Aa3B70Cb3885c860246C8d5c5103368a9c45fC
Base:         0x34e81c59B814874611C7FB66661B57E599b4857D (Owen contract)
Solana:       5FnaNauWeWbgJCF2qxYCyesX3KZLRUecvy7AXmrS47mZ
```
> Note: Owen UUID 72459d0e is actually Chris' Owen account, used for testing.
> Owen has this enrolled in the card programme.

### richard@nuro.finance (Chris' Nuro Tester)
```
Email:        richard@nuro.finance
Password:     [REDACTED_PASSWORD]
Internal ID:  92c7b62d-90ea-4cf3-9f52-fd113be0dccf
Owen UUID:    49418fc8-23ab-49c3-96c9-9a64b4583c11
EVM deposit:  0xaBcc89d0aD4Cf75eB4e8d3729B25c8B26eB1f0F4
Cards:        4 cards — balances 0 / 0 / 0 / $21.93
```
> Note: The $21.93 card (77d9fb1e) is linked to this user. This is real money.
> The $1 USDC sent to this account's EVM address on 2026-03-25 failed to bridge
> because Owen API returned an error for user 49418fc8.

### Chris (Frontend Dev)
```
Email:        syncyourcode@gmail.com
Password:     [REDACTED_PASSWORD]
GitHub:       Ownable / helloeccho@proton.me
```

---

## Owen / SD3 API

### Enrolled in Card Programme
- `72459d0e-8705-4b5d-bb40-904e4ae8a3a1` (Chris / Richard Wayne's shared Owen account) ✅
- `49418fc8-23ab-49c3-96c9-9a64b4583c11` (richard@nuro.finance) — card provision failed with 404

### Owen Card Create Endpoint Issue
`POST /users/{owenUserId}/cards` returns 404 for some users.
Possible cause: user not enrolled for card issuance at that endpoint.
**TODO**: Confirm correct endpoint with Owen/SD3 team.

---

## JWT Generation (for curl testing)

### For Richard Wayne (richardthebrucewayne@gmail.com)
```bash
TOKEN=$(cd /home/cash/Cashly && node -e "
const jwt = require('jsonwebtoken');
const secret = '[REDACTED_JWT_SECRET]';
console.log(jwt.sign(
  { id: 'db01a59c-a418-4da0-a4aa-fb032d500b04', email: 'richardthebrucewayne@gmail.com' },
  secret, { expiresIn: '2h' }
));
")
```

### For richard@nuro.finance
```bash
TOKEN=$(cd /home/cash/Cashly && node -e "
const jwt = require('jsonwebtoken');
const secret = '[REDACTED_JWT_SECRET]';
console.log(jwt.sign(
  { id: '92c7b62d-90ea-4cf3-9f52-fd113be0dccf', email: 'richard@nuro.finance' },
  secret, { expiresIn: '2h' }
));
")
```

> **Note**: The frontend sends next-auth JWE tokens (encrypted) — NOT these JWT tokens.
> These tokens are for direct curl testing against the middleware only.

---

## Wallets

### Deployer Wallet (EVM)
```
Private key: [REDACTED_PRIVATE_KEY]
Fee vault:   0x749edFC84A28793ce150d4E7E71bcEe73C454b56
```

### Deployer Wallet (Solana)
```
Public key:  5FnaNauWeWbgJCF2qxYCyesX3KZLRUecvy7AXmrS47mZ
Private key: [REDACTED_SOLANA_KEY]
Recovery:    [REDACTED_RECOVERY_PHRASE]
```
