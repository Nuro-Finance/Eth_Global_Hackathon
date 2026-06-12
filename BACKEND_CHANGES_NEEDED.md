# Backend Changes Needed on VPS (ssh cash@74.50.109.203)

These changes are needed on the Express backend at `/home/cash/Cashly` to support
the frontend features in this commit.

---

## 1. Add `card_name` column to `cards` table

Run on the VPS:

```bash
sudo -u postgres psql -d cashly -c "
  ALTER TABLE cards ADD COLUMN IF NOT EXISTS card_name VARCHAR(255);
"
```

This allows users to rename their card and have it persist across sessions.

---

## 2. Update `PATCH /cards/:id` to handle `card_name` and `is_locked`

The existing handler needs to:
- Accept `card_name` in the body → update `cards.card_name`
- Accept `is_locked` in the body → update `cards.is_locked` AND call Owen API to suspend/activate the card

Example handler update in `nuro-routes.ts` (or wherever PATCH /cards/:id lives):

```typescript
// PATCH /cards/:id
app.patch('/cards/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { card_name, is_locked } = req.body;

  // Only allow the card owner to update
  const card = await pool.query('SELECT * FROM cards WHERE id = $1 AND user_id = $2', [id, userId]);
  if (card.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

  const updates = [];
  const values = [];
  let idx = 1;

  if (card_name !== undefined) {
    updates.push(`card_name = $${idx++}`);
    values.push(card_name);
  }
  if (is_locked !== undefined) {
    updates.push(`is_locked = $${idx++}`);
    values.push(is_locked);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  await pool.query(
    `UPDATE cards SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  );

  // If toggling lock, call Owen API to suspend/activate the card
  if (is_locked !== undefined) {
    const owenCard = card.rows[0];
    const owenCardId = owenCard.owen_card_id; // needs owen_card_id column — see note below
    const owenEndpoint = is_locked
      ? `/cards/${owenCardId}/suspend`
      : `/cards/${owenCardId}/resume`; // confirm exact endpoint with Owen docs

    try {
      await fetch(`${process.env.OWENS_API_BASE}${owenEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.OWENS_API_KEY,
        },
      });
    } catch (err) {
      console.error('[PATCH /cards/:id] Owen freeze/unfreeze failed:', err);
      // Don't fail the request — local state is updated, Owen will catch up
    }
  }

  res.json({ success: true });
});
```

---

## 3. Add `owen_card_id` to `cards` table (if not already present)

The Owen card ID is needed to call Owen's suspend/resume endpoint.

```bash
sudo -u postgres psql -d cashly -c "
  ALTER TABLE cards ADD COLUMN IF NOT EXISTS owen_card_id VARCHAR(255);
"
```

Then populate it for existing cards (Owen card ID is in the cards API response).

---

## 4. Owen API — Freeze/Unfreeze endpoints

Needs confirmation from Owen/SD3 docs. Likely:
- Freeze:   `POST {OWENS_API_BASE}/cards/{owenCardId}/suspend`
- Unfreeze: `POST {OWENS_API_BASE}/cards/{owenCardId}/resume`

Or it may be:
- `PATCH {OWENS_API_BASE}/cards/{owenCardId}` with `{ "status": "suspended" | "active" }`

Check the SD3 issuing API docs at https://rocket.sd3.gg/api/proxy/issuing/docs
or ask the Owen team for the exact endpoint.

---

## 6. Add `otp_codes` table for email verification

Run on the VPS to support the new OTP verification flow:

```bash
sudo -u postgres psql -d cashly -c "
  CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE
  );
  CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
"
```

This table stores the temporary 6-digit codes sent during the Sign-Up flow.

---

## 7. After making these changes, restart PM2

```bash
pm2 restart 0   # cashly-middleware (Express backend)
```
