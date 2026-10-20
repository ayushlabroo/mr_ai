import { DatabaseSync } from 'node:sqlite';
import { GatewayError } from './errors.mjs';

// Separate SQLite lock database: process death releases the lock automatically,
// and a second gateway cannot recover/replay another live process's runs.
export function acquireGatewayLock(filename) {
  const lock = new DatabaseSync(filename, { timeout: 0 });
  try {
    lock.exec('CREATE TABLE IF NOT EXISTS owner (id INTEGER); BEGIN EXCLUSIVE;');
    return lock;
  } catch {
    lock.close();
    throw new Error('Another MrAI gateway owns this data directory.');
  }
}

export class Ledger {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL,
        month TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        provider TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL,
        reserved INTEGER NOT NULL, held INTEGER NOT NULL, cost INTEGER,
        debit_preview INTEGER, usage_json TEXT, markdown TEXT, error TEXT,
        rates_json TEXT NOT NULL, markup_bps INTEGER NOT NULL, review_required INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS runs_owner_month ON runs(owner, month);
    `);
  }
  close() {
    this.db.close();
  }
  recover() {
    // Queued work was never sent. Sent work is ambiguous and is never replayed.
    this.db
      .prepare(
        "UPDATE runs SET status='failed', held=0, error='Gateway restarted before dispatch.' WHERE status='queued'",
      )
      .run();
    this.db
      .prepare(
        "UPDATE runs SET status='uncertain', error='Gateway restarted after dispatch. Provider cost needs review.' WHERE status='running'",
      )
      .run();
  }
  get(owner, id) {
    return this.db.prepare('SELECT * FROM runs WHERE owner=? AND id=?').get(owner, id);
  }
  summary(owner, now = Date.now()) {
    const month = new Date(now).toISOString().slice(0, 7);
    const cost = Number(
      this.db
        .prepare('SELECT COALESCE(SUM(cost),0) AS value FROM runs WHERE owner=? AND month=?')
        .get(owner, month).value,
    );
    const held = Number(
      this.db.prepare('SELECT COALESCE(SUM(held),0) AS value FROM runs WHERE owner=?').get(owner)
        .value,
    );
    const blocked = !!this.db
      .prepare(
        'SELECT 1 FROM runs WHERE owner=? AND (cost > reserved OR review_required=1) LIMIT 1',
      )
      .get(owner);
    return { month, costUsdMicros: cost, heldUsdMicros: held, blocked };
  }
  reserve({ owner, id, fingerprint, model, amount, limit, markupBps, now = Date.now() }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.get(owner, id);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new GatewayError(
            'ID_CONFLICT',
            'This request ID already belongs to different content.',
            409,
          );
        this.db.exec('COMMIT');
        return { row: existing, fresh: false };
      }
      if (this.db.prepare('SELECT 1 FROM runs WHERE id=?').get(id))
        throw new GatewayError('ID_CONFLICT', 'This request ID is unavailable.', 409);
      const summary = this.summary(owner, now);
      if (summary.blocked)
        throw new GatewayError(
          'BUDGET_REVIEW',
          'Usage exceeded its reservation. Review model pricing before more requests.',
          403,
        );
      if (summary.costUsdMicros + summary.heldUsdMicros + amount > limit)
        throw new GatewayError(
          'BUDGET_LIMIT',
          'The remaining budget cannot cover this model reservation.',
          402,
        );
      const active = Number(
        this.db
          .prepare(
            "SELECT COUNT(*) AS value FROM runs WHERE owner=? AND status IN ('queued','running')",
          )
          .get(owner).value,
      );
      if (active >= 2)
        throw new GatewayError('CONCURRENCY_LIMIT', 'Two drafts are already in progress.', 429);
      this.db
        .prepare(
          `INSERT INTO runs (id,owner,fingerprint,month,created_at,updated_at,provider,model,status,reserved,held,rates_json,markup_bps)
        VALUES (?,?,?,?,?,?,?,?, 'queued',?,?,?,?)`,
        )
        .run(
          id,
          owner,
          fingerprint,
          summary.month,
          now,
          now,
          model.provider,
          model.id,
          amount,
          amount,
          JSON.stringify(model.prices),
          markupBps,
        );
      this.db.exec('COMMIT');
      return { row: this.get(owner, id), fresh: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  dispatched(owner, id) {
    return (
      this.db
        .prepare(
          "UPDATE runs SET status='running', updated_at=? WHERE owner=? AND id=? AND status='queued'",
        )
        .run(Date.now(), owner, id).changes === 1
    );
  }
  settle(
    owner,
    id,
    { cost, debit, usage, markdown, failed = false, error = null, review = false },
  ) {
    this.db
      .prepare(
        `UPDATE runs SET status=?, held=0, cost=?, debit_preview=?, usage_json=?, markdown=?, error=?, review_required=?, updated_at=?
      WHERE owner=? AND id=? AND status IN ('running','uncertain')`,
      )
      .run(
        failed ? 'failed' : 'succeeded',
        cost,
        failed ? 0 : debit,
        JSON.stringify(usage),
        failed ? null : markdown,
        error,
        review ? 1 : 0,
        Date.now(),
        owner,
        id,
      );
  }
  fail(owner, id, message, rejected) {
    this.db
      .prepare(
        `UPDATE runs SET status=?, held=CASE WHEN ? THEN 0 ELSE held END, error=?, updated_at=?
      WHERE owner=? AND id=? AND status IN ('queued','running')`,
      )
      .run(rejected ? 'failed' : 'uncertain', rejected ? 1 : 0, message, Date.now(), owner, id);
  }
  cancel(owner, id) {
    this.db
      .prepare(
        `UPDATE runs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'uncertain' END,
      held=CASE WHEN status='queued' THEN 0 ELSE held END,
      error=CASE WHEN status='queued' THEN 'Cancelled before dispatch.' ELSE 'Cancelled after dispatch. Provider cost needs review.' END,
      updated_at=? WHERE owner=? AND id=? AND status IN ('queued','running')`,
      )
      .run(Date.now(), owner, id);
  }
  flagReview(owner, id) {
    this.db.prepare('UPDATE runs SET review_required=1 WHERE owner=? AND id=?').run(owner, id);
  }
}
