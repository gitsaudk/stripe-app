const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'expertshub.db');
const db = new sqlite3.Database(dbPath);

// Initialize database schema
const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table - stores both clients and freelancers
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          user_type TEXT NOT NULL CHECK(user_type IN ('client', 'freelancer')),
          first_name TEXT,
          last_name TEXT,
          stripe_customer_id TEXT, -- For clients
          stripe_connect_account_id TEXT, -- For freelancers
          account_status TEXT DEFAULT 'pending', -- pending, active, suspended
          onboarding_completed BOOLEAN DEFAULT FALSE,
          balance_cents INTEGER DEFAULT 0, -- Platform balance for clients
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Transactions table - tracks all money movements
      db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK(type IN ('deposit', 'transfer', 'payout', 'refund')),
          from_user_id INTEGER, -- NULL for deposits from external
          to_user_id INTEGER, -- NULL for payouts to external
          amount_cents INTEGER NOT NULL,
          stripe_transaction_id TEXT, -- Payment intent, transfer, or payout ID
          status TEXT DEFAULT 'pending', -- pending, completed, failed, canceled
          description TEXT,
          metadata TEXT, -- JSON string for additional data
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_user_id) REFERENCES users(id),
          FOREIGN KEY (to_user_id) REFERENCES users(id)
        )
      `);

      // Projects table - tracks work assignments
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          freelancer_id INTEGER,
          title TEXT NOT NULL,
          description TEXT,
          amount_cents INTEGER NOT NULL,
          status TEXT DEFAULT 'open', -- open, assigned, in_progress, completed, canceled
          escrow_transaction_id INTEGER, -- Points to transaction that holds funds
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES users(id),
          FOREIGN KEY (freelancer_id) REFERENCES users(id),
          FOREIGN KEY (escrow_transaction_id) REFERENCES transactions(id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating tables:', err);
          reject(err);
        } else {
          console.log('Database initialized successfully');
          resolve();
        }
      });
    });
  });
};

// Helper functions for database operations
const dbHelpers = {
  // Create user
  createUser: (userData) => {
    return new Promise((resolve, reject) => {
      const { email, user_type, first_name, last_name, stripe_customer_id, stripe_connect_account_id } = userData;
      const sql = `
        INSERT INTO users (email, user_type, first_name, last_name, stripe_customer_id, stripe_connect_account_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [email, user_type, first_name, last_name, stripe_customer_id, stripe_connect_account_id], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...userData });
      });
    });
  },

  // Get user by email
  getUserByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Get user by ID
  getUserById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Update user
  updateUser: (id, updates) => {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(id);
      
      const sql = `UPDATE users SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  // Create transaction
  createTransaction: (transactionData) => {
    return new Promise((resolve, reject) => {
      const { type, from_user_id, to_user_id, amount_cents, stripe_transaction_id, status, description, metadata } = transactionData;
      const sql = `
        INSERT INTO transactions (type, from_user_id, to_user_id, amount_cents, stripe_transaction_id, status, description, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [type, from_user_id, to_user_id, amount_cents, stripe_transaction_id, status, description, JSON.stringify(metadata)], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...transactionData });
      });
    });
  },

  // Get transactions by user
  getTransactionsByUser: (userId, type = null) => {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM transactions WHERE from_user_id = ? OR to_user_id = ?';
      let params = [userId, userId];
      
      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }
      
      sql += ' ORDER BY created_at DESC';
      
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get all freelancers
  getFreelancers: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM users WHERE user_type = "freelancer" ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get all clients
  getClients: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM users WHERE user_type = "client" ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

module.exports = {
  db,
  initializeDatabase,
  dbHelpers
};
