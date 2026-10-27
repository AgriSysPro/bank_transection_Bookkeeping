"use strict";

/**
 * Database Service - IndexedDB via Dexie.js
 * Handles all data persistence for accounts and transactions.
 */

/* global Dexie */

var BK = window.BK || {};

(function () {
  var db = new Dexie('BankBookkeepingDB');

  db.version(1).stores({
    accounts: '++id, name, accountNumber, createdAt',
    transactions: '++id, accountId, date, type, amount, createdAt'
  });

  db.version(2).stores({
    accounts: '++id, name, accountNumber, createdAt',
    transactions: '++id, accountId, categoryId, date, type, amount, isTransfer, relatedId, createdAt',
    categories: '++id, name, type, color',
    recurring: '++id, nextDate, frequency'
  });

  db.version(3).stores({
    preferences: 'key'
  });

  // Rows written before sanitize() stopped HTML-escaping hold "&amp;" where the
  // user typed "&". Single-pass, so "&amp;lt;" becomes "&lt;" and does not cascade.
  var HTML_ENTITIES = { 'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', '#039': "'" };
  function unescapeStored(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&(amp|lt|gt|quot|#039);/g, function (match, name) {
      return HTML_ENTITIES[name];
    });
  }

  db.version(4).stores({
    accounts: '++id, name, accountNumber, createdAt',
    transactions: '++id, accountId, categoryId, date, type, amount, isTransfer, relatedId, createdAt',
    categories: '++id, name, type, color',
    recurring: '++id, nextDate, frequency',
    preferences: 'key'
  }).upgrade(function (tx) {
    return Promise.all([
      tx.table('transactions').toCollection().modify(function (t) {
        t.description = unescapeStored(t.description);
      }),
      tx.table('accounts').toCollection().modify(function (a) {
        a.name = unescapeStored(a.name);
        a.accountNumber = unescapeStored(a.accountNumber);
      }),
      tx.table('categories').toCollection().modify(function (c) {
        c.name = unescapeStored(c.name);
      })
    ]);
  });

  BK.db = db;

  // ─── Accounts Data Access ───
  BK.AccountsDB = {
    getAll: function () {
      return db.accounts.orderBy('name').toArray();
    },
    getById: function (id) {
      return db.accounts.get(id);
    },
    add: function (account) {
      var now = new Date().toISOString();
      return db.accounts.add({
        name: account.name,
        accountNumber: account.accountNumber,
        accountType: account.accountType || 'bank',
        phone: account.phone || '',
        notes: account.notes || '',
        openingBalance: parseFloat(account.openingBalance) || 0,
        targetAmount: parseFloat(account.targetAmount) || 0,
        createdAt: now,
        updatedAt: now
      });
    },
    update: function (id, data) {
      return db.accounts.update(id, {
        name: data.name,
        accountNumber: data.accountNumber,
        accountType: data.accountType || 'bank',
        phone: data.phone || '',
        notes: data.notes || '',
        openingBalance: parseFloat(data.openingBalance) || 0,
        targetAmount: parseFloat(data.targetAmount) || 0,
        updatedAt: new Date().toISOString()
      });
    },
    delete: function (id) {
      return db.transaction('rw', db.accounts, db.transactions, function () {
        db.transactions.where('accountId').equals(id).delete();
        db.accounts.delete(id);
      });
    },
    count: function () {
      return db.accounts.count();
    }
  };

  // ─── Categories Data Access ───
  BK.CategoriesDB = {
    getAll: function () {
      return db.categories.orderBy('name').toArray();
    },
    getByType: function (type) {
      return db.categories.where('type').equals(type).toArray();
    },
    add: function (category) {
      return db.categories.add({
        name: category.name,
        type: category.type, // 'income' or 'expense'
        group: category.group || (category.type === 'income' ? 'Core Business Revenue' : 'Operating & Facilities'),
        icon: category.icon || (category.type === 'income' ? 'fas fa-arrow-down' : 'fas fa-tag'),
        color: category.color || '#3b82f6',
        monthlyBudget: parseFloat(category.monthlyBudget) || 0
      });
    },
    update: function (id, data) {
      return db.categories.update(id, {
        name: data.name,
        type: data.type,
        group: data.group || 'Operating & Facilities',
        icon: data.icon || 'fas fa-tag',
        color: data.color || '#3b82f6',
        monthlyBudget: parseFloat(data.monthlyBudget) || 0
      });
    },
    delete: function (id) {
      // Unset categoryId for linked transactions before deleting
      return db.transaction('rw', db.categories, db.transactions, function () {
        db.transactions.where('categoryId').equals(id).modify({ categoryId: null });
        db.categories.delete(id);
      });
    },
    getStandardCategories: function () {
      return [
        // Operating & Facilities
        { name: 'Office / Shop Rent', type: 'expense', group: 'Operating & Facilities', icon: 'fas fa-building', color: '#6366f1', monthlyBudget: 50000 },
        { name: 'Electricity & Power', type: 'expense', group: 'Operating & Facilities', icon: 'fas fa-bolt', color: '#f59e0b', monthlyBudget: 25000 },
        { name: 'Internet & Telecommunications', type: 'expense', group: 'Operating & Facilities', icon: 'fas fa-wifi', color: '#3b82f6', monthlyBudget: 8000 },
        { name: 'Water & Utilities', type: 'expense', group: 'Operating & Facilities', icon: 'fas fa-tint', color: '#06b6d4', monthlyBudget: 5000 },
        { name: 'Repairs & Maintenance', type: 'expense', group: 'Operating & Facilities', icon: 'fas fa-tools', color: '#8b5cf6', monthlyBudget: 15000 },
        
        // Payroll & Labor
        { name: 'Staff Salaries & Wages', type: 'expense', group: 'Payroll & Labor', icon: 'fas fa-users', color: '#10b981', monthlyBudget: 150000 },
        { name: 'Contractor & Freelancer Fees', type: 'expense', group: 'Payroll & Labor', icon: 'fas fa-user-tie', color: '#14b8a6', monthlyBudget: 40000 },
        { name: 'Bonuses & Staff Welfare', type: 'expense', group: 'Payroll & Labor', icon: 'fas fa-award', color: '#eab308', monthlyBudget: 10000 },
        
        // Inventory & Supplies
        { name: 'Raw Materials & Inventory', type: 'expense', group: 'Inventory & Supplies', icon: 'fas fa-boxes', color: '#ec4899', monthlyBudget: 80000 },
        { name: 'Packaging & Cartons', type: 'expense', group: 'Inventory & Supplies', icon: 'fas fa-box-open', color: '#d946ef', monthlyBudget: 15000 },
        { name: 'Shipping & Delivery', type: 'expense', group: 'Inventory & Supplies', icon: 'fas fa-truck', color: '#64748b', monthlyBudget: 20000 },
        { name: 'Office Supplies & Stationery', type: 'expense', group: 'Inventory & Supplies', icon: 'fas fa-paperclip', color: '#94a3b8', monthlyBudget: 6000 },

        // Sales & Marketing
        { name: 'Online Ads & Promotions', type: 'expense', group: 'Sales & Marketing', icon: 'fas fa-bullhorn', color: '#f97316', monthlyBudget: 30000 },
        { name: 'Print & Branding Materials', type: 'expense', group: 'Sales & Marketing', icon: 'fas fa-palette', color: '#fb923c', monthlyBudget: 10000 },

        // Technology & Tools
        { name: 'Software & Cloud Subscriptions', type: 'expense', group: 'Technology & Tools', icon: 'fas fa-laptop-code', color: '#3b82f6', monthlyBudget: 12000 },
        { name: 'Hardware & IT Equipment', type: 'expense', group: 'Technology & Tools', icon: 'fas fa-desktop', color: '#0284c7', monthlyBudget: 20000 },

        // Travel & Transit
        { name: 'Vehicle Fuel & CNG', type: 'expense', group: 'Travel & Logistics', icon: 'fas fa-gas-pump', color: '#eab308', monthlyBudget: 20000 },
        { name: 'Vehicle Service & Maintenance', type: 'expense', group: 'Travel & Logistics', icon: 'fas fa-wrench', color: '#ca8a04', monthlyBudget: 10000 },
        { name: 'Travel & Lodging', type: 'expense', group: 'Travel & Logistics', icon: 'fas fa-plane', color: '#0ea5e9', monthlyBudget: 25000 },

        // Food & Hospitality
        { name: 'Office Tea & Refreshments', type: 'expense', group: 'Food & Refreshments', icon: 'fas fa-coffee', color: '#a16207', monthlyBudget: 8000 },
        { name: 'Meals & Client Entertainment', type: 'expense', group: 'Food & Refreshments', icon: 'fas fa-utensils', color: '#84cc16', monthlyBudget: 15000 },
        { name: 'Groceries & Kitchen Supplies', type: 'expense', group: 'Food & Refreshments', icon: 'fas fa-shopping-basket', color: '#22c55e', monthlyBudget: 40000 },

        // Legal & Financial
        { name: 'Bank Charges & Fees', type: 'expense', group: 'Financial & Taxes', icon: 'fas fa-university', color: '#64748b', monthlyBudget: 5000 },
        { name: 'Taxes & Regulatory Duties', type: 'expense', group: 'Financial & Taxes', icon: 'fas fa-landmark', color: '#dc2626', monthlyBudget: 20000 },
        { name: 'Legal & Professional Services', type: 'expense', group: 'Financial & Taxes', icon: 'fas fa-balance-scale', color: '#475569', monthlyBudget: 15000 },

        // Personal & Family
        { name: 'Family Allowance & Home', type: 'expense', group: 'Personal & Family', icon: 'fas fa-home', color: '#a855f7', monthlyBudget: 50000 },
        { name: 'Healthcare & Medical', type: 'expense', group: 'Personal & Family', icon: 'fas fa-medkit', color: '#ef4444', monthlyBudget: 15000 },
        { name: 'Education & Tuition', type: 'expense', group: 'Personal & Family', icon: 'fas fa-graduation-cap', color: '#3b82f6', monthlyBudget: 30000 },

        // Income Categories
        { name: 'Product & Goods Sales', type: 'income', group: 'Core Business Revenue', icon: 'fas fa-shopping-cart', color: '#10b981', monthlyBudget: 0 },
        { name: 'Service & Consulting Fees', type: 'income', group: 'Core Business Revenue', icon: 'fas fa-handshake', color: '#059669', monthlyBudget: 0 },
        { name: 'Freelance & Contract Work', type: 'income', group: 'Core Business Revenue', icon: 'fas fa-briefcase', color: '#047857', monthlyBudget: 0 },
        { name: 'Rental Income', type: 'income', group: 'Investments & Other', icon: 'fas fa-key', color: '#0284c7', monthlyBudget: 0 },
        { name: 'Investment & Dividends', type: 'income', group: 'Investments & Other', icon: 'fas fa-chart-line', color: '#0d9488', monthlyBudget: 0 },
        { name: 'Other Miscellaneous Inflow', type: 'income', group: 'Investments & Other', icon: 'fas fa-coins', color: '#16a34a', monthlyBudget: 0 }
      ];
    },
    seedStandardCategories: function () {
      var std = this.getStandardCategories();
      return db.categories.toArray().then(function (existing) {
        var existingNames = {};
        existing.forEach(function (c) { existingNames[c.name.toLowerCase().trim()] = true; });
        var toAdd = std.filter(function (s) { return !existingNames[s.name.toLowerCase().trim()]; });
        if (toAdd.length === 0) return Promise.resolve(0);
        return db.categories.bulkAdd(toAdd).then(function () {
          return toAdd.length;
        });
      });
    }
  };

  // ─── Transactions Data Access ───
  BK.TransactionsDB = {
    getAll: function () {
      return db.transactions.toArray().then(function (txns) {
        return txns.sort(function (a, b) { 
          var dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          return b.id - a.id; // Secondary sort by ID desc
        });
      });
    },
    getById: function (id) {
      return db.transactions.get(id);
    },
    getByAccount: function (accountId) {
      return db.transactions.where('accountId').equals(accountId).toArray().then(function (txns) {
        return txns.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      });
    },
    getByAccountAndDateRange: function (accountId, startDate, endDate) {
      return db.transactions.where('accountId').equals(accountId).toArray().then(function (txns) {
        return txns.filter(function (t) {
          return t.date >= startDate && t.date <= endDate;
        }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      });
    },
    getByAccountBeforeDate: function (accountId, date) {
      return db.transactions.where('accountId').equals(accountId).toArray().then(function (txns) {
        return txns.filter(function (t) { return t.date < date; });
      });
    },
    getRecent: function (limit) {
      limit = limit || 10;
      return db.transactions.toArray().then(function (txns) {
        return txns.sort(function (a, b) { 
          var dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          return b.id - a.id;
        }).slice(0, limit);
      });
    },
    add: function (transaction) {
      var data = {
        date: transaction.date,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId || null,
        type: transaction.type,
        amount: parseFloat(transaction.amount),
        reason: transaction.reason || '',
        personName: transaction.personName || '',
        personPhone: transaction.personPhone || '',
        personRole: transaction.personRole || '',
        description: transaction.description || '',
        isTransfer: !!transaction.isTransfer,
        relatedId: transaction.relatedId || null,
        isVerified: !!transaction.isVerified,
        receiptData: transaction.receiptData || null,
        receiptType: transaction.receiptType || null,
        receiptName: transaction.receiptName || null,
        createdAt: new Date().toISOString()
      };
      return db.transactions.add(data);
    },
    update: function (id, data) {
      var updateData = {
        date: data.date,
        accountId: data.accountId,
        categoryId: data.categoryId || null,
        type: data.type,
        amount: parseFloat(data.amount),
        reason: data.reason || '',
        personName: data.personName || '',
        personPhone: data.personPhone || '',
        personRole: data.personRole || '',
        description: data.description || '',
        isTransfer: !!data.isTransfer,
        relatedId: data.relatedId || null,
        isVerified: !!data.isVerified,
        receiptData: data.receiptData || null,
        receiptType: data.receiptType || null,
        receiptName: data.receiptName || null,
        updatedAt: new Date().toISOString()
      };
      return db.transactions.update(id, updateData);
    },
    delete: function (id) {
      return db.transactions.delete(id);
    },
    count: function () {
      return db.transactions.count();
    },
    getStats: function () {
      return Promise.all([
        db.accounts.toArray(),
        db.transactions.toArray()
      ]).then(function (results) {
        var accounts = results[0];
        var txns = results[1];
        
        var bankIds = {};
        var totalOpeningBalance = 0;
        accounts.forEach(function (a) {
          totalOpeningBalance += (a.openingBalance || 0);
          if (!a.accountType || a.accountType === 'bank') bankIds[a.id] = true;
        });

        // Cash flow only. A transfer between the user's own accounts is neither
        // income nor expense, and a movement on a receivable or payable account
        // is not cash at all, so neither belongs in these totals.
        var totalCredits = 0, totalDebits = 0, transferVolume = 0, transferCount = 0;
        txns.forEach(function (t) {
          if (t.isTransfer) {
            transferCount++;
            transferVolume += Math.abs(t.amount) || 0;
            return;
          }
          if (!bankIds[t.accountId]) return;
          if (t.type === 'credit') totalCredits += t.amount;
          else totalDebits += t.amount;
        });

        var netChange = totalCredits - totalDebits;
        return {
          totalOpeningBalance: totalOpeningBalance,
          totalCredits: totalCredits,
          totalDebits: totalDebits,
          transferVolume: transferVolume,
          transferCount: transferCount,
          netChange: netChange,
          netBalance: totalOpeningBalance + netChange,
          count: txns.length
        };
      });
    }
  };

  // ─── Balance Calculation ───
  BK.calculateAccountBalance = function (accountId) {
    return BK.AccountsDB.getById(accountId).then(function (account) {
      if (!account) return 0;
      var balance = account.openingBalance || 0;
      return BK.TransactionsDB.getByAccount(accountId).then(function (txns) {
        txns.forEach(function (t) {
          if (t.type === 'credit') balance += t.amount;
          else balance -= t.amount;
        });
        return balance;
      });
    });
  };

  // ─── Backup & Restore ───
  BK.backupAllData = function () {
    return Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.categories.toArray(),
      db.preferences.toArray()
    ]).then(function (results) {
      return {
        version: 2,
        exportDate: new Date().toISOString(),
        appName: 'BankBookkeeping',
        data: {
          accounts: results[0],
          transactions: results[1],
          categories: results[2],
          preferences: results[3]
        }
      };
    });
  };

  BK.restoreAllData = function (backup) {
    if (!backup || !backup.data || backup.appName !== 'BankBookkeeping') {
      return Promise.reject(new Error('Invalid backup file format.'));
    }
    var data = backup.data;
    return db.transaction('rw', db.accounts, db.transactions, db.categories, db.preferences, function () {
      db.accounts.clear();
      db.transactions.clear();
      db.categories.clear();
      db.preferences.clear();
      if (data.accounts && data.accounts.length > 0) db.accounts.bulkAdd(data.accounts);
      if (data.transactions && data.transactions.length > 0) db.transactions.bulkAdd(data.transactions);
      // Version 1 backups have neither array; restoring one simply leaves them empty.
      if (data.categories && data.categories.length > 0) db.categories.bulkAdd(data.categories);
      if (data.preferences && data.preferences.length > 0) db.preferences.bulkAdd(data.preferences);
    });
  };
})();
