-- Score-submit rate limiting: one row per accepted submit, keyed by a salted hash of the client IP, kept for 1 hour.
CREATE TABLE IF NOT EXISTS hits (ipk TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS hits_ipk_ts ON hits(ipk, ts);
CREATE INDEX IF NOT EXISTS hits_ts ON hits(ts);
