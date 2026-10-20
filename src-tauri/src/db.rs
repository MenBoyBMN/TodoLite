use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TabItem {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TodoItem {
    pub id: String,
    pub tab_id: String,
    pub text: String,
    pub completed: i32,
    pub priority: String,
    pub sort_order: i32,
    pub due_date: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteItem {
    pub id: String,
    pub tab_id: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReorderItem {
    pub id: String,
    #[serde(alias = "sortOrder")]
    pub sort_order: i32,
}

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new() -> Result<Self> {
        let app_dir = get_app_dir();
        fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("todolite.db");
        let conn = Connection::open(db_path)?;
        let _ = conn.execute("PRAGMA foreign_keys = ON;", []);

        let db = DbState {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute("PRAGMA foreign_keys = ON;", [])?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS todos (
                id TEXT PRIMARY KEY,
                tab_id TEXT NOT NULL,
                text TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                priority TEXT NOT NULL DEFAULT 'none',
                sort_order INTEGER NOT NULL,
                due_date TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (tab_id) REFERENCES tabs (id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS note_tabs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // Ensure notes table references note_tabs (id) correctly and migrate if old schema references tabs (id)
        let notes_sql: Option<String> = conn.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |r| r.get(0),
        ).ok();

        if let Some(sql) = notes_sql {
            if sql.contains("REFERENCES tabs") || !sql.contains("REFERENCES note_tabs") {
                let _ = conn.execute("PRAGMA foreign_keys = OFF;", []);
                let _ = conn.execute(
                    "CREATE TABLE IF NOT EXISTS notes_migrated (
                        id TEXT PRIMARY KEY,
                        tab_id TEXT NOT NULL UNIQUE,
                        content TEXT NOT NULL DEFAULT '',
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (tab_id) REFERENCES note_tabs (id) ON DELETE CASCADE
                    )",
                    [],
                );
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO notes_migrated (id, tab_id, content, updated_at)
                     SELECT id, tab_id, content, updated_at FROM notes",
                    [],
                );
                let _ = conn.execute("DROP TABLE notes;", []);
                let _ = conn.execute("ALTER TABLE notes_migrated RENAME TO notes;", []);
                let _ = conn.execute("PRAGMA foreign_keys = ON;", []);
            }
        } else {
            conn.execute(
                "CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    tab_id TEXT NOT NULL UNIQUE,
                    content TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (tab_id) REFERENCES note_tabs (id) ON DELETE CASCADE
                )",
                [],
            )?;
        }

        // Insert initial tab if empty
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM tabs", [], |r| r.get(0))?;
        if count == 0 {
            let now = chrono::Utc::now().to_rfc3339();
            let tab1_id = "tab-work";
            let tab2_id = "tab-personal";

            conn.execute(
                "INSERT INTO tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![tab1_id, "Công việc", 0, &now],
            )?;
            conn.execute(
                "INSERT INTO tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![tab2_id, "Cá nhân", 1, &now],
            )?;

            // Seed example todos
            conn.execute(
                "INSERT INTO todos (id, tab_id, text, completed, priority, sort_order, due_date, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    "todo-demo-1",
                    tab1_id,
                    "Hoàn thành kế hoạch công việc hôm nay",
                    0,
                    "high",
                    0,
                    Option::<String>::None,
                    &now
                ],
            )?;
            conn.execute(
                "INSERT INTO todos (id, tab_id, text, completed, priority, sort_order, due_date, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    "todo-demo-2",
                    tab1_id,
                    "Kiểm tra email và phản hồi đối tác",
                    1,
                    "medium",
                    1,
                    Option::<String>::None,
                    &now
                ],
            )?;
            conn.execute(
                "INSERT INTO todos (id, tab_id, text, completed, priority, sort_order, due_date, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    "todo-demo-3",
                    tab2_id,
                    "Ghi chú vào sổ tay TodoLite ✨",
                    0,
                    "low",
                    0,
                    Option::<String>::None,
                    &now
                ],
            )?;
        }

        // Insert initial note_tabs and note if empty
        let note_tab_count: i64 = conn.query_row("SELECT COUNT(*) FROM note_tabs", [], |r| r.get(0)).unwrap_or(0);
        if note_tab_count == 0 {
            let now = chrono::Utc::now().to_rfc3339();
            let note_tab1_id = "note-tab-1";
            let note_tab2_id = "note-tab-2";

            conn.execute(
                "INSERT INTO note_tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![note_tab1_id, "Ghi chú 1", 0, &now],
            )?;
            conn.execute(
                "INSERT INTO note_tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![note_tab2_id, "Ý tưởng", 1, &now],
            )?;

            let initial_note = "<h2>Chào mừng bạn đến với TakeNote! ✨</h2><p>Đây là sổ tay ghi chú thông minh được tích hợp ngay trong TodoLite.</p><ul><li>Hỗ trợ gõ tiếng Việt có dấu chuẩn xác 🇻🇳</li><li>Có thể <strong>in đậm</strong>, <em>in nghiêng</em>, <u>gạch chân</u></li><li><mark style=\"background-color: #fef08a;\">Highlight màu sắc</mark> để làm nổi bật ý quan trọng</li><li>Chèn biểu tượng cảm xúc 💡 🎯 🚀</li></ul><p>Thử ghi lại những suy nghĩ hay ghi chú công việc của bạn ngay tại đây nhé!</p>";

            conn.execute(
                "INSERT OR REPLACE INTO notes (id, tab_id, content, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params!["note-seed-1", note_tab1_id, initial_note, &now],
            )?;
        }

        Ok(())
    }

    // Tabs CRUD
    pub fn get_all_tabs(&self) -> Result<Vec<TabItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, sort_order, created_at FROM tabs ORDER BY sort_order ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(TabItem {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        let mut tabs = Vec::new();
        for tab in rows {
            tabs.push(tab?);
        }
        Ok(tabs)
    }

    pub fn create_tab(&self, name: String) -> Result<TabItem> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let max_sort: i32 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM tabs",
            [],
            |r| r.get(0),
        ).unwrap_or(-1);
        let sort_order = max_sort + 1;
        let created_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![&id, &name, sort_order, &created_at],
        )?;

        Ok(TabItem {
            id,
            name,
            sort_order,
            created_at,
        })
    }

    pub fn update_tab(&self, id: String, name: String) -> Result<TabItem> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tabs SET name = ?1 WHERE id = ?2",
            params![&name, &id],
        )?;

        let tab = conn.query_row(
            "SELECT id, name, sort_order, created_at FROM tabs WHERE id = ?1",
            params![&id],
            |r| {
                Ok(TabItem {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    sort_order: r.get(2)?,
                    created_at: r.get(3)?,
                })
            },
        )?;
        Ok(tab)
    }

    pub fn delete_tab(&self, id: String) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM todos WHERE tab_id = ?1", params![&id])?;
        conn.execute("DELETE FROM tabs WHERE id = ?1", params![&id])?;
        Ok(())
    }

    // Todos CRUD
    pub fn get_all_todos(&self) -> Result<Vec<TodoItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, tab_id, text, completed, priority, sort_order, due_date, created_at 
             FROM todos ORDER BY sort_order ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(TodoItem {
                id: row.get(0)?,
                tab_id: row.get(1)?,
                text: row.get(2)?,
                completed: row.get(3)?,
                priority: row.get(4)?,
                sort_order: row.get(5)?,
                due_date: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut todos = Vec::new();
        for t in rows {
            todos.push(t?);
        }
        Ok(todos)
    }

    pub fn create_todo(
        &self,
        tab_id: String,
        text: String,
        priority: String,
        due_date: Option<String>,
    ) -> Result<TodoItem> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let min_sort: i32 = conn.query_row(
            "SELECT COALESCE(MIN(sort_order), 0) FROM todos WHERE tab_id = ?1",
            params![&tab_id],
            |r| r.get(0),
        ).unwrap_or(0);
        let sort_order = min_sort - 1;
        let created_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO todos (id, tab_id, text, completed, priority, sort_order, due_date, created_at)
             VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, ?7)",
            params![&id, &tab_id, &text, &priority, sort_order, &due_date, &created_at],
        )?;

        Ok(TodoItem {
            id,
            tab_id,
            text,
            completed: 0,
            priority,
            sort_order,
            due_date,
            created_at,
        })
    }

    pub fn toggle_todo(&self, id: String) -> Result<TodoItem> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE todos SET completed = CASE WHEN completed = 1 THEN 0 ELSE 1 END WHERE id = ?1",
            params![&id],
        )?;

        let todo = conn.query_row(
            "SELECT id, tab_id, text, completed, priority, sort_order, due_date, created_at 
             FROM todos WHERE id = ?1",
            params![&id],
            |r| {
                Ok(TodoItem {
                    id: r.get(0)?,
                    tab_id: r.get(1)?,
                    text: r.get(2)?,
                    completed: r.get(3)?,
                    priority: r.get(4)?,
                    sort_order: r.get(5)?,
                    due_date: r.get(6)?,
                    created_at: r.get(7)?,
                })
            },
        )?;
        Ok(todo)
    }

    pub fn update_todo(&self, id: String, text: String) -> Result<TodoItem> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE todos SET text = ?1 WHERE id = ?2",
            params![&text, &id],
        )?;

        let todo = conn.query_row(
            "SELECT id, tab_id, text, completed, priority, sort_order, due_date, created_at 
             FROM todos WHERE id = ?1",
            params![&id],
            |r| {
                Ok(TodoItem {
                    id: r.get(0)?,
                    tab_id: r.get(1)?,
                    text: r.get(2)?,
                    completed: r.get(3)?,
                    priority: r.get(4)?,
                    sort_order: r.get(5)?,
                    due_date: r.get(6)?,
                    created_at: r.get(7)?,
                })
            },
        )?;
        Ok(todo)
    }

    pub fn update_todo_deadline(&self, id: String, due_date: Option<String>) -> Result<TodoItem> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE todos SET due_date = ?1 WHERE id = ?2",
            params![&due_date, &id],
        )?;

        let todo = conn.query_row(
            "SELECT id, tab_id, text, completed, priority, sort_order, due_date, created_at 
             FROM todos WHERE id = ?1",
            params![&id],
            |r| {
                Ok(TodoItem {
                    id: r.get(0)?,
                    tab_id: r.get(1)?,
                    text: r.get(2)?,
                    completed: r.get(3)?,
                    priority: r.get(4)?,
                    sort_order: r.get(5)?,
                    due_date: r.get(6)?,
                    created_at: r.get(7)?,
                })
            },
        )?;
        Ok(todo)
    }

    pub fn delete_todo(&self, id: String) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM todos WHERE id = ?1", params![&id])?;
        Ok(())
    }

    pub fn reorder_todos(&self, items: Vec<ReorderItem>) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare("UPDATE todos SET sort_order = ?1 WHERE id = ?2")?;
            for item in items {
                stmt.execute(params![item.sort_order, &item.id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    // Note Tabs CRUD
    pub fn get_all_note_tabs(&self) -> Result<Vec<TabItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, sort_order, created_at FROM note_tabs ORDER BY sort_order ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(TabItem {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        let mut tabs = Vec::new();
        for tab in rows {
            tabs.push(tab?);
        }
        Ok(tabs)
    }

    pub fn create_note_tab(&self, name: String) -> Result<TabItem> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let max_sort: i32 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM note_tabs",
            [],
            |r| r.get(0),
        ).unwrap_or(-1);
        let sort_order = max_sort + 1;
        let created_at = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO note_tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![&id, &name, sort_order, &created_at],
        )?;

        Ok(TabItem {
            id,
            name,
            sort_order,
            created_at,
        })
    }

    pub fn update_note_tab(&self, id: String, name: String) -> Result<TabItem> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE note_tabs SET name = ?1 WHERE id = ?2",
            params![&name, &id],
        )?;

        let tab = conn.query_row(
            "SELECT id, name, sort_order, created_at FROM note_tabs WHERE id = ?1",
            params![&id],
            |r| {
                Ok(TabItem {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    sort_order: r.get(2)?,
                    created_at: r.get(3)?,
                })
            },
        )?;
        Ok(tab)
    }

    pub fn delete_note_tab(&self, id: String) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM notes WHERE tab_id = ?1", params![&id])?;
        conn.execute("DELETE FROM note_tabs WHERE id = ?1", params![&id])?;
        Ok(())
    }

    // Notes CRUD
    pub fn get_all_notes(&self) -> Result<Vec<NoteItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, tab_id, content, updated_at FROM notes"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(NoteItem {
                id: row.get(0)?,
                tab_id: row.get(1)?,
                content: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;

        let mut notes = Vec::new();
        for note in rows {
            notes.push(note?);
        }
        Ok(notes)
    }

    pub fn get_note_by_tab(&self, tab_id: String) -> Result<Option<NoteItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, tab_id, content, updated_at FROM notes WHERE tab_id = ?1"
        )?;
        let mut rows = stmt.query_map(params![&tab_id], |row| {
            Ok(NoteItem {
                id: row.get(0)?,
                tab_id: row.get(1)?,
                content: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;

        if let Some(note) = rows.next() {
            Ok(Some(note?))
        } else {
            Ok(None)
        }
    }

    pub fn upsert_note(&self, tab_id: String, content: String) -> Result<NoteItem> {
        let conn = self.conn.lock().unwrap();
        let updated_at = chrono::Utc::now().to_rfc3339();
        
        let existing_id: Option<String> = conn.query_row(
            "SELECT id FROM notes WHERE tab_id = ?1",
            params![&tab_id],
            |r| r.get(0),
        ).ok();

        let id = match existing_id {
            Some(old_id) => {
                conn.execute(
                    "UPDATE notes SET content = ?1, updated_at = ?2 WHERE id = ?3",
                    params![&content, &updated_at, &old_id],
                )?;
                old_id
            }
            None => {
                let new_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO notes (id, tab_id, content, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![&new_id, &tab_id, &content, &updated_at],
                )?;
                new_id
            }
        };

        Ok(NoteItem {
            id,
            tab_id,
            content,
            updated_at,
        })
    }

    pub fn reset_database(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute("PRAGMA foreign_keys = OFF;", []);
        let _ = conn.execute("DELETE FROM todos;", []);
        let _ = conn.execute("DELETE FROM tabs;", []);
        let _ = conn.execute("DELETE FROM notes;", []);
        let _ = conn.execute("DELETE FROM note_tabs;", []);
        let _ = conn.execute("DELETE FROM settings;", []);
        let _ = conn.execute("PRAGMA foreign_keys = ON;", []);

        drop(conn);
        self.init_tables()?;
        Ok(())
    }

    pub fn restore_backup(
        &self,
        tabs: Vec<TabItem>,
        todos: Vec<TodoItem>,
        note_tabs: Vec<TabItem>,
        notes: Vec<NoteItem>,
    ) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let _ = tx.execute("PRAGMA foreign_keys = OFF;", []);
        let _ = tx.execute("DELETE FROM todos;", []);
        let _ = tx.execute("DELETE FROM tabs;", []);
        let _ = tx.execute("DELETE FROM notes;", []);
        let _ = tx.execute("DELETE FROM note_tabs;", []);

        for tab in tabs {
            tx.execute(
                "INSERT INTO tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![tab.id, tab.name, tab.sort_order, tab.created_at],
            )?;
        }

        for todo in todos {
            tx.execute(
                "INSERT INTO todos (id, tab_id, text, completed, priority, sort_order, due_date, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    todo.id,
                    todo.tab_id,
                    todo.text,
                    todo.completed,
                    todo.priority,
                    todo.sort_order,
                    todo.due_date,
                    todo.created_at
                ],
            )?;
        }

        for ntab in note_tabs {
            tx.execute(
                "INSERT INTO note_tabs (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![ntab.id, ntab.name, ntab.sort_order, ntab.created_at],
            )?;
        }

        for note in notes {
            tx.execute(
                "INSERT INTO notes (id, tab_id, content, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![note.id, note.tab_id, note.content, note.updated_at],
            )?;
        }

        let _ = tx.execute("PRAGMA foreign_keys = ON;", []);
        tx.commit()?;
        Ok(())
    }
}

fn get_app_dir() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        PathBuf::from(app_data).join("TodoLite")
    } else {
        PathBuf::from(".todolite")
    }
}
