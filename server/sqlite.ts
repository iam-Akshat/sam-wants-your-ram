import { Database } from 'bun:sqlite';
import type { ScoreRow, Storage } from './core';

export class SqliteStorage implements Storage {
  private db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, nick TEXT NOT NULL, gb INTEGER NOT NULL, dur INTEGER NOT NULL, ts INTEGER NOT NULL)');
    this.db.run('CREATE INDEX IF NOT EXISTS scores_ts ON scores(ts, gb)');
  }
  addScore(r: ScoreRow) { this.db.query('INSERT INTO scores (nick, gb, dur, ts) VALUES (?1, ?2, ?3, ?4)').run(r.nick, r.gb, r.dur, r.ts); }
  stats() { const r = this.db.query('SELECT COALESCE(SUM(gb),0) AS t, COUNT(*) AS n FROM scores').get() as { t: number; n: number }; return { totalGb: r.t, runs: r.n }; }
  top(since: number, limit: number) { return this.db.query('SELECT nick, gb, ts FROM scores WHERE ts >= ?1 ORDER BY gb DESC, ts ASC LIMIT ?2').all(since, limit) as { nick: string; gb: number; ts: number }[]; }
  rank(since: number, gb: number) { const r = this.db.query('SELECT COUNT(*) AS n FROM scores WHERE ts >= ?1 AND gb > ?2').get(since, gb) as { n: number }; return r.n + 1; }
}
