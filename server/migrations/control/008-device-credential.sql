-- Control 008 — the enrollment credential: what an endpoint presents on every hub request once it
-- has enrolled, so that a request claiming to be a known device can be CHECKED (D282, 2026-09-12).
--
-- DECISION PROVENANCE (register §5.7b). Status is the status held WHEN THIS MIGRATION WAS WRITTEN.
--   D271 (DECIDED 2026-09-12, founder) — where the hub runs relative to the endpoint: one machine
--     for development and testing; in production on the same LAN/WAN as the endpoints. The LAN
--     answer is what makes a credential engineering rather than theatre (the P3a/P3b handover
--     §2.1), and is the reason this column exists at all.
--   D282 (PROPOSED 2026-09-12) — an enrolled device holds ONE credential: a 256-bit random token,
--     minted when the device becomes active, shown to the endpoint exactly once, stored here only
--     as its sha256 — the shape `enrollment_secrets.secret_hash` (001) and `admin_sessions`
--     (003) already use, so a database read cannot impersonate a device. Presented as
--     `Authorization: Bearer` on every /v1 request and looked up by hash. A revoked device's
--     credential is refused on its next request, which is what turns `revokeDevices()` (D83a)
--     from a status change into a control. It is a PER-OS-USER ENROLLMENT credential: it lives in
--     Electron's per-user userData beside the profile (D215), so each Windows account on a shared
--     machine enrolls separately. Not a machine identity, not hardware, not a person.
--   D61 (PROPOSED) — NOT what this is. D61 is a signed assertion exchanged for a short-lived token
--     over a TPM-backed key in broker custody (D60/D64), none of which is built. This is the weaker
--     credential on D61's path: the same route shape with a bearer secret where the signature will
--     go. When D60/D63/D64 land, the secret is replaced by the assertion and the routes do not move.
--   D273 (PROPOSED 2026-09-12; its two conditions REVERT with this) — `last_seen_at` gets its real
--     writer: the authenticated request. Until now it was written only on enroll and approve.
--
-- WHY A NULLABLE COLUMN AND NOT A TABLE. One live credential per device is the whole model:
-- rotation is revoke-and-re-enroll, so every replacement is visible in the console's queue. A row
-- with no credential is a device that was approved by hand (console or CLI) and whose endpoint has
-- not asked yet — its next submission with the enrollment secret mints one. The partial unique
-- index is the lookup key and the guarantee that one hash identifies exactly one device.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT EXISTS. test/db.test.mjs §1 runs
-- this file a second time against a migrated control plane and asserts the catalog did not move.
ALTER TABLE control.devices ADD COLUMN IF NOT EXISTS credential_hash      bytea;
ALTER TABLE control.devices ADD COLUMN IF NOT EXISTS credential_issued_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS devices_credential_hash
  ON control.devices (credential_hash) WHERE credential_hash IS NOT NULL;
