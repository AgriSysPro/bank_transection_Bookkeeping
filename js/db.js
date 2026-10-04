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
        openingBalance: parseFloat(account.openingBalance) || 0,
        createdAt: now,
        updatedAt: now
      });
    },
    update: function (id, data) {
      return db.accounts.update(id, {
        name: data.name,
        accountNumber: data.accountNumber,
        accountType: data.accountType || 'bank',
        openingBalance: parseFloat(data.openingBalance) || 0,
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
        color: category.color || '#3b82f6'
      });
    },
    update: function (id, data) {
      return db.categories.update(id, data);
    },
    delete: function (id) {
      // Unset categoryId for linked transactions before deleting
      return db.transaction('rw', db.categories, db.transactions, function () {
        db.transactions.where('categoryId').equals(id).modify({ categoryId: null });
        db.categories.delete(id);
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
        description: transaction.description,
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
        description: data.description,
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
        
        var totalOpeningBalance = 0;
        accounts.forEach(function (a) {
          totalOpeningBalance += (a.openingBalance || 0);
        });

        var totalCredits = 0, totalDebits = 0;
        txns.forEach(function (t) {
          if (t.type === 'credit') totalCredits += t.amount;
          else totalDebits += t.amount;
        });
        
        var netBalance = totalOpeningBalance + totalCredits - totalDebits;
        return { totalCredits: totalCredits, totalDebits: totalDebits, netBalance: netBalance, count: txns.length };
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
    return Promise.all([db.accounts.toArray(), db.transactions.toArray()]).then(function (results) {
      return {
        version: 1,
        exportDate: new Date().toISOString(),
        appName: 'BankBookkeeping',
        data: { accounts: results[0], transactions: results[1] }
      };
    });
  };

  BK.restoreAllData = function (backup) {
    if (!backup || !backup.data || backup.appName !== 'BankBookkeeping') {
      return Promise.reject(new Error('Invalid backup file format.'));
    }
    return db.transaction('rw', db.accounts, db.transactions, function () {
      db.accounts.clear();
      db.transactions.clear();
      if (backup.data.accounts && backup.data.accounts.length > 0) {
        db.accounts.bulkAdd(backup.data.accounts);
      }
      if (backup.data.transactions && backup.data.transactions.length > 0) {
        db.transactions.bulkAdd(backup.data.transactions);
      }
    });
  };
})();
