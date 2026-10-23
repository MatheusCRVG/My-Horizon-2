//! Only encrypted envelopes cross this boundary; there is no arbitrary SQL IPC.
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, time::Duration};

type Result<T> = std::result::Result<T, String>;
const SCHEMA_VERSION: i64 = 2;
const MAX_CIPHER_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WrappedKey {
    pub salt: String,
    pub iv: String,
    pub cipher: String,
    pub rounds: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Envelope {
    pub format: String,
    pub version: u32,
    pub vault_id: String,
    pub owner: String,
    pub password: WrappedKey,
    pub recovery: WrappedKey,
    pub iv: String,
    pub cipher: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SealedSession {
    pub iv: String,
    pub cipher: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VaultRecord {
    pub owner: String,
    pub envelope: Envelope,
    pub pending: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_sync: Option<String>,
    pub device: String,
    #[serde(default)]
    pub seen: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<SealedSession>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authorized: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OperationRecord {
    pub id: String,
    pub owner: String,
    pub vault_id: String,
    pub payload: Envelope,
    pub created_at: String,
}

pub struct Repository {
    connection: Connection,
}

fn sql_error(_: rusqlite::Error) -> String {
    // Never echo SQL values, the envelope, session, filesystem paths or tokens.
    "Não foi possível concluir a operação no armazenamento local.".into()
}
fn json_error(_: serde_json::Error) -> String {
    "O registro cifrado está inválido ou usa um formato incompatível.".into()
}
fn identifier(value: &str) -> Result<()> {
    if value.is_empty() || value.len() > 512 || value.chars().any(char::is_control) {
        return Err("Identificador local inválido.".into());
    }
    Ok(())
}
fn binary(value: &str, min: usize, max: usize) -> Result<()> {
    if value.len() > max.saturating_mul(4).div_ceil(3).saturating_add(4) {
        return Err("O conteúdo cifrado excede o limite local.".into());
    }
    let bytes = STANDARD.decode(value).map_err(|_| "Conteúdo cifrado deve usar base64 válido.".to_string())?;
    if bytes.len() < min || bytes.len() > max {
        return Err("O conteúdo cifrado possui tamanho inválido.".into());
    }
    Ok(())
}
impl Envelope {
    fn validate(&self) -> Result<()> {
        identifier(&self.owner)?;
        identifier(&self.vault_id)?;
        if self.format != "financeiro5" || self.version != 1 {
            return Err("Formato de cofre incompatível. Nenhum dado foi substituído.".into());
        }
        binary(&self.iv, 12, 12)?;
        binary(&self.cipher, 16, MAX_CIPHER_BYTES)?;
        for wrap in [&self.password, &self.recovery] {
            if wrap.rounds != 600_000 {
                return Err("Parâmetros de proteção da chave incompatíveis.".into());
            }
            binary(&wrap.salt, 16, 16)?;
            binary(&wrap.iv, 12, 12)?;
            binary(&wrap.cipher, 48, 48)?;
        }
        Ok(())
    }
}
impl VaultRecord {
    fn validate(&self) -> Result<()> {
        identifier(&self.owner)?;
        identifier(&self.device)?;
        self.envelope.validate()?;
        if self.owner != self.envelope.owner {
            return Err("O titular não corresponde ao cofre cifrado.".into());
        }
        if let Some(account) = &self.account_id { identifier(account)?; }
        if self.cursor.is_some_and(|cursor| cursor > 9_007_199_254_740_991) {
            return Err("Cursor de sincronização inválido.".into());
        }
        if self.seen.len() > 100_000 { return Err("Histórico local excede o limite suportado.".into()); }
        for id in &self.seen { identifier(id)?; }
        if let Some(session) = &self.session {
            binary(&session.iv, 12, 12)?;
            binary(&session.cipher, 16, 1024 * 1024)?;
            if self.account_id.is_none() {
                return Err("Uma sessão cifrada precisa estar vinculada à conta.".into());
            }
        }
        if self.last_sync.as_ref().is_some_and(|time| time.len() > 64 || time.chars().any(char::is_control)) {
            return Err("Data de sincronização inválida.".into());
        }
        Ok(())
    }
}
impl OperationRecord {
    fn validate(&self, record: &VaultRecord) -> Result<()> {
        identifier(&self.id)?;
        self.payload.validate()?;
        if self.owner != record.owner || self.payload.owner != record.owner
            || self.vault_id != record.envelope.vault_id || self.payload.vault_id != self.vault_id {
            return Err("A operação pertence a outro titular ou cofre.".into());
        }
        if self.created_at.is_empty() || self.created_at.len() > 64 || self.created_at.chars().any(char::is_control) {
            return Err("Data da operação inválida.".into());
        }
        Ok(())
    }
}

fn read_vault(connection: &Connection, owner: &str) -> Result<Option<VaultRecord>> {
    let json: Option<String> = connection.query_row("SELECT record_json FROM vaults WHERE owner = ?1", [owner], |row| row.get(0)).optional().map_err(sql_error)?;
    json.map(|json| serde_json::from_str(&json).map_err(json_error)).transpose()
}
fn guard_update(previous: &VaultRecord, record: &VaultRecord) -> Result<()> {
    if previous.envelope.vault_id != record.envelope.vault_id {
        return Err("Outro cofre já está vinculado a este titular. Os dados anteriores foram preservados.".into());
    }
    if previous.account_id.is_some() && previous.account_id != record.account_id {
        return Err("A conta vinculada não pode ser substituída ou removida silenciosamente.".into());
    }
    if previous.cursor.is_some_and(|old| record.cursor.is_none_or(|next| next < old)) {
        return Err("Este resultado de sincronização está desatualizado. Recarregue o cofre.".into());
    }
    Ok(())
}

impl Repository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let mut connection = Connection::open(path).map_err(sql_error)?;
        connection.busy_timeout(Duration::from_secs(5)).map_err(sql_error)?;
        connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA secure_delete = ON;").map_err(sql_error)?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0)).map_err(sql_error)?;
        if version > SCHEMA_VERSION { return Err("Este armazenamento foi criado por uma versão mais recente do My Horizon+. Nenhum dado foi alterado.".into()); }
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(sql_error)?;
        if version < 1 {
            transaction.execute_batch("CREATE TABLE IF NOT EXISTS vaults (owner TEXT PRIMARY KEY NOT NULL, vault_id TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), UNIQUE(owner, vault_id)); PRAGMA user_version = 1;").map_err(sql_error)?;
        }
        if version < 2 {
            transaction.execute_batch("CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, vault_id TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), created_at TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)), FOREIGN KEY(owner, vault_id) REFERENCES vaults(owner, vault_id)); CREATE INDEX IF NOT EXISTS outbox_pending_owner ON outbox(owner, vault_id, acknowledged, created_at, id); PRAGMA user_version = 2;").map_err(sql_error)?;
            transaction.execute_batch(r#"
                CREATE TRIGGER IF NOT EXISTS vault_record_insert BEFORE INSERT ON vaults
                WHEN NOT (json_extract(NEW.record_json, '$.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.envelope.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.envelope.vaultId') IS NEW.vault_id
                    AND json_type(NEW.record_json, '$.envelope.cipher') IS 'text'
                    AND json_type(NEW.record_json, '$.envelope.entities') IS NULL
                    AND json_type(NEW.record_json, '$.doc') IS NULL)
                BEGIN SELECT RAISE(ABORT, 'invalid_ciphered_vault'); END;
                CREATE TRIGGER IF NOT EXISTS vault_record_update BEFORE UPDATE ON vaults
                WHEN NOT (json_extract(NEW.record_json, '$.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.envelope.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.envelope.vaultId') IS NEW.vault_id
                    AND json_type(NEW.record_json, '$.envelope.cipher') IS 'text'
                    AND json_type(NEW.record_json, '$.envelope.entities') IS NULL
                    AND json_type(NEW.record_json, '$.doc') IS NULL)
                BEGIN SELECT RAISE(ABORT, 'invalid_ciphered_vault'); END;
                CREATE TRIGGER IF NOT EXISTS outbox_record_insert BEFORE INSERT ON outbox
                WHEN NOT (json_extract(NEW.record_json, '$.id') IS NEW.id
                    AND json_extract(NEW.record_json, '$.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.vaultId') IS NEW.vault_id
                    AND json_extract(NEW.record_json, '$.payload.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.payload.vaultId') IS NEW.vault_id
                    AND json_type(NEW.record_json, '$.payload.cipher') IS 'text'
                    AND json_type(NEW.record_json, '$.payload.entities') IS NULL)
                BEGIN SELECT RAISE(ABORT, 'invalid_ciphered_operation'); END;
                CREATE TRIGGER IF NOT EXISTS outbox_record_update BEFORE UPDATE ON outbox
                WHEN NOT (json_extract(NEW.record_json, '$.id') IS NEW.id
                    AND json_extract(NEW.record_json, '$.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.vaultId') IS NEW.vault_id
                    AND json_extract(NEW.record_json, '$.payload.owner') IS NEW.owner
                    AND json_extract(NEW.record_json, '$.payload.vaultId') IS NEW.vault_id
                    AND json_type(NEW.record_json, '$.payload.cipher') IS 'text'
                    AND json_type(NEW.record_json, '$.payload.entities') IS NULL)
                BEGIN SELECT RAISE(ABORT, 'invalid_ciphered_operation'); END;
            "#).map_err(sql_error)?;
        }
        transaction.commit().map_err(sql_error)?;
        Ok(Self { connection })
    }

    pub fn get(&self, owner: &str) -> Result<Option<VaultRecord>> {
        identifier(owner)?;
        read_vault(&self.connection, owner)
    }
    pub fn list(&self) -> Result<Vec<VaultRecord>> {
        let mut statement = self.connection.prepare("SELECT record_json FROM vaults ORDER BY owner").map_err(sql_error)?;
        let values = statement.query_map([], |row| row.get::<_, String>(0)).map_err(sql_error)?;
        values.map(|row| serde_json::from_str(&row.map_err(sql_error)?).map_err(json_error)).collect()
    }
    pub fn put(&mut self, record: VaultRecord) -> Result<()> {
        self.commit(record, vec![], vec![])
    }
    pub fn commit(&mut self, mut record: VaultRecord, operations: Vec<OperationRecord>, acknowledged: Vec<String>) -> Result<()> {
        record.validate()?;
        if operations.len() > 256 || acknowledged.len() > 4096 {
            return Err("Divida esta sincronização em lotes menores.".into());
        }
        let transaction = self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(sql_error)?;
        if let Some(previous) = read_vault(&transaction, &record.owner)? {
            guard_update(&previous, &record)?;
            // A stale snapshot must not forget already observed remote operations.
            let mut ids: HashSet<String> = record.seen.iter().cloned().collect();
            for id in previous.seen { if ids.insert(id.clone()) { record.seen.push(id); } }
        }
        record.validate()?;
        let existing = transaction.query_row("SELECT owner FROM vaults WHERE owner = ?1", [&record.owner], |row| row.get::<_, String>(0)).optional().map_err(sql_error)?;
        // Insert the parent in the same transaction before any queued child.
        if existing.is_none() {
            transaction.execute("INSERT INTO vaults (owner, vault_id, record_json) VALUES (?1, ?2, ?3)", params![record.owner, record.envelope.vault_id, serde_json::to_string(&record).map_err(json_error)?]).map_err(sql_error)?;
        }
        for operation in operations {
            operation.validate(&record)?;
            let previous: Option<String> = transaction.query_row("SELECT record_json FROM outbox WHERE id = ?1", [&operation.id], |row| row.get(0)).optional().map_err(sql_error)?;
            if let Some(json) = previous {
                let old: OperationRecord = serde_json::from_str(&json).map_err(json_error)?;
                if old != operation { return Err("Um identificador de operação já foi usado com outro conteúdo. Nada foi salvo.".into()); }
            } else {
                transaction.execute("INSERT INTO outbox (id, owner, vault_id, record_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![operation.id, operation.owner, operation.vault_id, serde_json::to_string(&operation).map_err(json_error)?, operation.created_at]).map_err(sql_error)?;
            }
        }
        for id in acknowledged {
            identifier(&id)?;
            let belongs: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM outbox WHERE id = ?1 AND owner = ?2 AND vault_id = ?3)", params![id, record.owner, record.envelope.vault_id], |row| row.get(0)).map_err(sql_error)?;
            if !belongs { return Err("A confirmação não corresponde a uma operação deste cofre. Nada foi salvo.".into()); }
            transaction.execute("UPDATE outbox SET acknowledged = 1 WHERE id = ?1 AND owner = ?2 AND vault_id = ?3", params![id, record.owner, record.envelope.vault_id]).map_err(sql_error)?;
        }
        let has_pending: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM outbox WHERE owner = ?1 AND vault_id = ?2 AND acknowledged = 0)", params![record.owner, record.envelope.vault_id], |row| row.get(0)).map_err(sql_error)?;
        record.pending |= has_pending;
        transaction.execute("UPDATE vaults SET record_json = ?1 WHERE owner = ?2 AND vault_id = ?3", params![serde_json::to_string(&record).map_err(json_error)?, record.owner, record.envelope.vault_id]).map_err(sql_error)?;
        transaction.commit().map_err(sql_error)
    }

    pub fn outbox(&self, owner: &str) -> Result<Vec<OperationRecord>> {
        identifier(owner)?;
        let mut statement = self.connection.prepare("SELECT record_json FROM outbox WHERE owner = ?1 AND acknowledged = 0 ORDER BY created_at, id").map_err(sql_error)?;
        let values = statement.query_map([owner], |row| row.get::<_, String>(0)).map_err(sql_error)?;
        values.map(|row| serde_json::from_str(&row.map_err(sql_error)?).map_err(json_error)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn envelope(owner: &str, vault: &str) -> Envelope {
        let wrap = WrappedKey { salt: STANDARD.encode([1; 16]), iv: STANDARD.encode([2; 12]), cipher: STANDARD.encode([3; 48]), rounds: 600_000 };
        Envelope { format: "financeiro5".into(), version: 1, owner: owner.into(), vault_id: vault.into(), password: wrap.clone(), recovery: wrap, iv: STANDARD.encode([4; 12]), cipher: STANDARD.encode([5; 32]) }
    }
    fn record(owner: &str) -> VaultRecord {
        VaultRecord { owner: owner.into(), envelope: envelope(owner, &format!("vault-{owner}")), pending: false, last_sync: None, device: "device-1".into(), seen: vec![], account_id: Some(format!("account-{owner}")), cursor: Some(0), session: None, authorized: Some(true) }
    }
    fn operation(record: &VaultRecord, id: &str) -> OperationRecord {
        OperationRecord { id: id.into(), owner: record.owner.clone(), vault_id: record.envelope.vault_id.clone(), payload: record.envelope.clone(), created_at: "2026-10-23T00:00:00.000Z".into() }
    }
    #[test]
    fn commit_persists_snapshot_and_queue_then_ack_atomically() {
        let mut db = Repository::open(":memory:").unwrap();
        let mut row = record("one"); let op = operation(&row, "op-1");
        db.commit(row.clone(), vec![op.clone()], vec![]).unwrap();
        assert!(db.get("one").unwrap().unwrap().pending);
        assert_eq!(db.outbox("one").unwrap(), vec![op]);
        row.cursor = Some(1); row.last_sync = Some("2026-10-23T00:00:01.000Z".into());
        db.commit(row.clone(), vec![], vec!["op-1".into()]).unwrap();
        assert!(db.outbox("one").unwrap().is_empty());
        assert_eq!(db.get("one").unwrap(), Some(row));
    }
    #[test]
    fn rollback_preserves_snapshot_queue_and_acknowledgements() {
        let mut db = Repository::open(":memory:").unwrap(); let row = record("one");
        let original = operation(&row, "original");
        db.commit(row.clone(), vec![original.clone()], vec![]).unwrap();
        let before = db.get("one").unwrap();
        let mut next = row; next.cursor = Some(5);
        let valid = operation(&next, "new"); let mut reused = original.clone(); reused.payload.cipher = STANDARD.encode([9; 32]);
        assert!(db.commit(next.clone(), vec![valid, reused], vec!["original".into()]).is_err());
        assert_eq!(db.get("one").unwrap(), before);
        assert_eq!(db.outbox("one").unwrap(), vec![original]);
        assert!(db.commit(next, vec![], vec!["unknown".into()]).is_err());
        assert_eq!(db.get("one").unwrap(), before);
    }
    #[test]
    fn duplicate_is_idempotent_even_after_ack_and_cannot_resurrect() {
        let mut db = Repository::open(":memory:").unwrap(); let row = record("one"); let op = operation(&row, "stable");
        db.commit(row.clone(), vec![op.clone(), op.clone()], vec![]).unwrap();
        assert_eq!(db.outbox("one").unwrap().len(), 1);
        db.commit(row.clone(), vec![], vec![op.id.clone()]).unwrap();
        db.commit(row, vec![op], vec![]).unwrap();
        assert!(db.outbox("one").unwrap().is_empty());
    }
    #[test]
    fn owner_vault_and_account_are_isolated() {
        let mut db = Repository::open(":memory:").unwrap(); let one = record("one"); let two = record("two");
        db.put(one.clone()).unwrap(); db.put(two.clone()).unwrap();
        let foreign = operation(&two, "foreign");
        assert!(db.commit(one.clone(), vec![foreign.clone()], vec![]).is_err());
        db.commit(two.clone(), vec![foreign], vec![]).unwrap();
        assert!(db.commit(one.clone(), vec![], vec!["foreign".into()]).is_err());
        assert!(db.outbox("one").unwrap().is_empty());
        let mut bad = one.clone(); bad.account_id = two.account_id; assert!(db.put(bad).is_err());
        let mut bad = one.clone(); bad.envelope.vault_id = "other-vault".into(); assert!(db.put(bad).is_err());
        let mut bad = one.clone(); bad.envelope.owner = "two".into(); assert!(db.put(bad).is_err());
        let mut bad_op = operation(&one, "wrong-payload"); bad_op.payload.vault_id = "different".into();
        assert!(db.commit(one.clone(), vec![bad_op], vec![]).is_err());
        assert_eq!(db.get("one").unwrap(), Some(one));
    }
    #[test]
    fn cursor_never_regresses_and_seen_is_not_lost() {
        let mut db = Repository::open(":memory:").unwrap(); let mut one = record("one"); one.cursor = Some(9); one.seen = vec!["seen-1".into()]; db.put(one.clone()).unwrap();
        let mut stale = one.clone(); stale.cursor = Some(8); assert!(db.put(stale).is_err());
        let mut missing = one.clone(); missing.cursor = None; assert!(db.put(missing).is_err());
        one.cursor = Some(10); one.seen = vec![]; db.put(one).unwrap();
        assert_eq!(db.get("one").unwrap().unwrap().seen, vec!["seen-1"]);
    }
    #[test]
    fn encrypted_session_can_be_cleared_without_removing_account_or_data() {
        let mut db = Repository::open(":memory:").unwrap(); let mut row = record("one");
        row.session = Some(SealedSession { iv: STANDARD.encode([7; 12]), cipher: STANDARD.encode([8; 64]) });
        db.put(row.clone()).unwrap(); row.session = None; row.authorized = Some(false); db.put(row.clone()).unwrap();
        assert_eq!(db.get("one").unwrap(), Some(row));
        let raw: String = db.connection.query_row("SELECT record_json FROM vaults", [], |r| r.get(0)).unwrap();
        assert!(!raw.contains("access_token")); assert!(!raw.contains("refresh_token")); assert!(!raw.contains("entities"));
    }
    #[test]
    fn version_one_migration_and_reopen_preserve_existing_vault_and_outbox() {
        let temp = tempfile::tempdir().unwrap(); let path = temp.path().join("cofre.sqlite3"); let row = record("one");
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch("CREATE TABLE vaults (owner TEXT PRIMARY KEY NOT NULL, vault_id TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), UNIQUE(owner, vault_id)); PRAGMA user_version = 1;").unwrap();
            db.execute("INSERT INTO vaults VALUES (?1, ?2, ?3)", params![row.owner, row.envelope.vault_id, serde_json::to_string(&row).unwrap()]).unwrap();
        }
        let op = operation(&row, "retained");
        { let mut db = Repository::open(&path).unwrap(); assert_eq!(db.get("one").unwrap(), Some(row.clone())); db.commit(row.clone(), vec![op.clone()], vec![]).unwrap(); }
        let db = Repository::open(&path).unwrap(); assert_eq!(db.outbox("one").unwrap(), vec![op]);
        let mut persisted = row; persisted.pending = true; assert_eq!(db.get("one").unwrap(), Some(persisted));
        assert_eq!(db.connection.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0)).unwrap(), 2);
    }
    #[test]
    fn malformed_or_plaintext_payloads_are_rejected() {
        let mut db = Repository::open(":memory:").unwrap(); let mut row = record("one"); row.envelope.cipher = "documento sem cifra".into(); assert!(db.put(row).is_err());
        let mut json = serde_json::to_value(record("one")).unwrap(); json["envelope"]["entities"] = serde_json::json!([]); assert!(serde_json::from_value::<VaultRecord>(json).is_err());
        assert!(db.list().unwrap().is_empty());
    }
    #[test]
    fn sqlite_guards_reject_json_that_disagrees_with_its_routing_columns() {
        let mut db = Repository::open(":memory:").unwrap(); let row = record("one");
        let wrong = db.connection.execute("INSERT INTO vaults VALUES (?1, ?2, ?3)", params!["wrong", "vault-wrong", serde_json::to_string(&row).unwrap()]);
        assert!(wrong.is_err());
        db.put(row.clone()).unwrap();
        let mut raw = serde_json::to_value(&row).unwrap(); raw["envelope"]["entities"] = serde_json::json!([]);
        assert!(db.connection.execute("UPDATE vaults SET record_json = ?1 WHERE owner = 'one'", [raw.to_string()]).is_err());
        let operation = operation(&row, "op-one");
        assert!(db.connection.execute("INSERT INTO outbox (id,owner,vault_id,record_json,created_at) VALUES (?1,?2,?3,?4,?5)", params!["op-wrong", row.owner, row.envelope.vault_id, serde_json::to_string(&operation).unwrap(), operation.created_at]).is_err());
        assert!(db.outbox("one").unwrap().is_empty());
    }
}
