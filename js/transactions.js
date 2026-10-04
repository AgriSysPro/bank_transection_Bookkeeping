"use strict";

/**
 * Transactions Controller
 * Handles transaction CRUD, filtering, receipt uploads, and bulk actions.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Toast = BK.Toast;
  var Modal = BK.ModalManager;
  var TDB = BK.TransactionsDB;
  var ADB = BK.AccountsDB;

  function TransactionsController(accountsCtrl, app) {
    this.accountsCtrl = accountsCtrl;
    this.app = app;
    this.editingId = null;
    this.receiptData = null;
    this.receiptType = null;
    this.receiptName = null;
    this.filters = { search: '', accountId: '', accountType: '', type: '' };
    this.sort = { key: 'date', direction: 'desc' };
    this.categoriesCtrl = new BK.CategoriesController();
    this.selectedIds = new Set();
  }

  TransactionsController.prototype.init = function () {
    var self = this;
    var form = document.getElementById('transaction-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); self.saveTransaction(); });

    var addBtn = document.getElementById('btn-add-transaction');
    if (addBtn) addBtn.addEventListener('click', function () { self.showForm(); });

    var fileInput = document.getElementById('txn-receipt-file');
    if (fileInput) fileInput.addEventListener('change', function (e) { self.handleReceiptUpload(e); });

    var removeBtn = document.getElementById('btn-remove-receipt');
    if (removeBtn) removeBtn.addEventListener('click', function () { self.clearReceipt(); });

    var ocrBtn = document.getElementById('btn-ocr-extract');
    if (ocrBtn) ocrBtn.addEventListener('click', function () { self.handleOCR(); });

    // Handle Ctrl+V Paste for screenshots
    window.addEventListener('paste', function(e) {
      var modal = document.getElementById('modal-transaction');
      if (modal && modal.classList.contains('active')) {
        self.handlePaste(e);
      }
    });

    var transferCheck = document.getElementById('txn-is-transfer');
    if (transferCheck) {
      transferCheck.addEventListener('change', function () {
        var extra = document.getElementById('transfer-extra-fields');
        if (extra) extra.classList.toggle('hidden', !transferCheck.checked);
      });
    }

    // Header sorting
    var headers = document.querySelectorAll('#page-transactions thead th[data-sort]');
    headers.forEach(function (th) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        if (self.sort.key === key) {
          self.sort.direction = self.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          self.sort.key = key;
          self.sort.direction = 'asc';
        }
        self.renderTable();
      });
    });

    // Bulk actions
    var btnBulkDelete = document.getElementById('btn-bulk-delete');
    if (btnBulkDelete) btnBulkDelete.onclick = function() { self.bulkDelete(); };
    
    var btnBulkVerify = document.getElementById('btn-bulk-verify');
    if (btnBulkVerify) btnBulkVerify.onclick = function() { self.bulkToggleVerify(); };
    
    var btnBulkCategory = document.getElementById('btn-bulk-category');
    if (btnBulkCategory) btnBulkCategory.onclick = function() { self.bulkChangeCategory(); };

    var btnBulkCategoryApply = document.getElementById('btn-bulk-category-apply');
    if (btnBulkCategoryApply) btnBulkCategoryApply.onclick = function() { self.applyBulkCategory(); };
    
    var btnBulkClear = document.getElementById('btn-bulk-clear');
    if (btnBulkClear) btnBulkClear.onclick = function() { self.selectedIds.clear(); self.renderTable(); };

    this.initFilters();
  };

  TransactionsController.prototype.initFilters = function () {
    var self = this;
    var searchInput = document.getElementById('txn-filter-search');
    var accountFilter = document.getElementById('txn-filter-account');
    var typeFilter = document.getElementById('txn-filter-type');

    if (searchInput) {
      searchInput.addEventListener('input', U.debounce(function () {
        self.filters.search = searchInput.value.trim().toLowerCase();
        self.renderTable();
      }, 250));
    }
    if (accountFilter) {
      accountFilter.addEventListener('change', function () {
        self.filters.accountId = accountFilter.value;
        self.renderTable();
      });
    }
    var accountTypeFilter = document.getElementById('txn-filter-account-type');
    if (accountTypeFilter) {
      accountTypeFilter.addEventListener('change', function () {
        self.filters.accountType = accountTypeFilter.value;
        self.renderTable();
      });
    }
    if (typeFilter) {
      typeFilter.addEventListener('change', function () {
        self.filters.type = typeFilter.value;
        self.renderTable();
      });
    }
  };

  TransactionsController.prototype.render = function () {
    var self = this;
    var accountFilter = document.getElementById('txn-filter-account');
    if (accountFilter) {
      return self.accountsCtrl.renderAccountOptions(accountFilter).then(function () {
        var firstOpt = accountFilter.querySelector('option');
        if (firstOpt) firstOpt.textContent = 'All Accounts';
        return self.renderTable();
      });
    }
    return self.renderTable();
  };

  TransactionsController.prototype.renderTable = function () {
    var self = this;
    return Promise.all([TDB.getAll(), ADB.getAll()]).then(function (results) {
      var transactions = results[0];
      var accounts = results[1];
      var accountMap = {};
      var accountTypeMap = {};
      accounts.forEach(function (a) {
        accountMap[a.id] = a.name;
        accountTypeMap[a.id] = a.accountType || 'bank';
      });

      var filtered = transactions;
      if (self.filters.accountId) {
        var accId = parseInt(self.filters.accountId);
        filtered = filtered.filter(function (t) { return t.accountId === accId; });
      }
      if (self.filters.accountType) {
        filtered = filtered.filter(function (t) {
          return accountTypeMap[t.accountId] === self.filters.accountType;
        });
      }
      if (self.filters.type) {
        filtered = filtered.filter(function (t) { return t.type === self.filters.type; });
      }
      if (self.filters.search) {
        filtered = filtered.filter(function (t) {
          var desc = (t.description || '').toLowerCase();
          var accName = (accountMap[t.accountId] || '').toLowerCase();
          return desc.includes(self.filters.search) || accName.includes(self.filters.search);
        });
      }

      // Apply sorting
      filtered = U.sortData(filtered, self.sort.key, self.sort.direction);

      var tbody = document.getElementById('transactions-tbody');
      var masterCheckbox = document.getElementById('txn-master-checkbox');
      if (!tbody) return;
      U.clearChildren(tbody);
      
      if (masterCheckbox) {
        var selectedVisible = filtered.filter(function (t) { return self.selectedIds.has(t.id); }).length;
        masterCheckbox.checked = filtered.length > 0 && selectedVisible === filtered.length;
        masterCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < filtered.length;
        masterCheckbox.onclick = function() { self.toggleSelectAll(this.checked, filtered); };
      }
      self.updateBulkToolbar();

      if (filtered.length === 0) {
        tbody.appendChild(U.createElement('tr', {}, [
          U.createElement('td', { colSpan: '8' }, [
            U.createElement('div', { className: 'table-empty', style: { padding: '60px 20px' } }, [
              U.createElement('i', { className: 'fas fa-receipt', style: { fontSize: '48px', color: 'var(--primary)', opacity: '0.4' } }),
              U.createElement('p', { style: { fontWeight: '600', color: 'var(--text-primary)' } }, ['No transactions found']),
              U.createElement('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' } }, ['Try adjusting your filters or add a new transaction manually.']),
              U.createElement('div', { className: 'd-flex justify-center gap-2', style: { justifyContent: 'center' } }, [
                  U.createElement('button', { className: 'btn btn-outline btn-sm', onClick: function() { 
                      document.getElementById('txn-filter-search').value = '';
                      self.filters.search = '';
                      self.renderTable();
                  } }, ['Clear search']),
                  U.createElement('button', { className: 'btn btn-primary btn-sm', onClick: function() { self.showForm(); } }, [
                      U.createElement('i', { className: 'fas fa-plus' }), ' New Transaction'
                  ])
              ])
            ])
          ])
        ]));
        return;
      }

      filtered.forEach(function (txn) {
        tbody.appendChild(self.renderRow(txn, accountMap[txn.accountId] || 'Unknown', accounts));
      });

      // Transaction totals footer. Transfers move money between the user's own
      // accounts, so counting them would show income and expense that is not real.
      var totalCredits = 0, totalDebits = 0;
      filtered.forEach(function (t) {
        if (t.isTransfer) return;
        if (t.type === 'credit') totalCredits += t.amount;
        else totalDebits += t.amount;
      });

      var footerEl = document.getElementById('txn-table-footer');
      if (!footerEl) {
        footerEl = U.createElement('div', { className: 'table-footer', id: 'txn-table-footer' });
        var tableContainer = tbody.closest('.table-container');
        if (tableContainer) tableContainer.appendChild(footerEl);
      }
      U.clearChildren(footerEl);
      footerEl.appendChild(U.createElement('span', {}, [
        U.createElement('span', { className: 'label' }, ['Showing ']),
        filtered.length + ' of ' + transactions.length + ' transactions'
      ]));
      var statsDiv = U.createElement('div', { className: 'd-flex gap-2', style: { gap: '16px' } }, [
        U.createElement('span', { className: 'footer-stat' }, [
          U.createElement('span', { className: 'label' }, ['Credits: ']),
          U.createElement('span', { className: 'text-success' }, [U.formatCurrency(totalCredits)])
        ]),
        U.createElement('span', { className: 'footer-stat' }, [
          U.createElement('span', { className: 'label' }, ['Debits: ']),
          U.createElement('span', { className: 'text-danger' }, [U.formatCurrency(totalDebits)])
        ]),
        U.createElement('span', { className: 'footer-stat' }, [
          U.createElement('span', { className: 'label' }, ['Net: ']),
          U.createElement('span', { className: (totalCredits - totalDebits) >= 0 ? 'text-success' : 'text-danger' }, [
            U.formatCurrency(totalCredits - totalDebits)
          ])
        ])
      ]);
      footerEl.appendChild(statsDiv);
    });
  };

  TransactionsController.prototype.renderRow = function (txn, accountName, allAccounts) {
    var self = this;
    var isCredit = txn.type === 'credit';
    var isVerified = !!txn.isVerified;
    var isSelected = self.selectedIds.has(txn.id);

    var receiptCell;
    if (txn.receiptData) {
      receiptCell = U.createElement('td', {}, [
        U.createElement('button', { className: 'btn btn-ghost btn-sm receipt-indicator', title: 'View Attachment', onClick: function (e) { e.stopPropagation(); self.showReceiptPreview(txn); } }, [
          U.createElement('i', { className: 'fas fa-paperclip' })
        ])
      ]);
    } else {
      receiptCell = U.createElement('td', { className: 'text-muted' }, ['\u2014']);
    }

    return U.createElement('tr', {
        className: isSelected ? 'selected' : '',
        dataset: { txnId: txn.id },
        style: isSelected ? { background: 'var(--primary-light)' } : {},
        onClick: function() { self.toggleSelect(txn.id); }
    }, [
      U.createElement('td', { style: { textAlign: 'center' }, onClick: function(e) { e.stopPropagation(); } }, [
        U.createElement('input', { 
          type: 'checkbox', 
          className: 'txn-checkbox', 
          checked: isSelected,
          onChange: function() { self.toggleSelect(txn.id); }
        })
      ]),
      U.createElement('td', {}, [U.formatDate(txn.date)]),
      U.createElement('td', {}, [accountName]),
      U.createElement('td', {}, [
        U.createElement('span', { className: 'badge ' + (isCredit ? 'badge-credit' : 'badge-debit') }, [isCredit ? 'Credit' : 'Debit'])
      ]),
      U.createElement('td', { className: isCredit ? 'text-success' : 'text-danger', style: { fontWeight: '600' } }, [
        (isCredit ? '+' : '\u2212') + U.formatCurrency(txn.amount)
      ]),
      U.createElement('td', {}, [
        U.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
          U.createElement('span', {}, [txn.description || '\u2014']),
          txn.categoryId ? U.createElement('span', { className: 'badge', style: { fontSize: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', width: 'fit-content' } }, [
            U.createElement('i', { className: 'fas fa-tag', style: { fontSize: '9px', marginRight: '4px' } }),
            'Tagged'
          ]) : null
        ].filter(Boolean))
      ]),
      receiptCell,
      U.createElement('td', { onClick: function(e) { e.stopPropagation(); } }, [
        U.createElement('div', { className: 'action-btns' }, [
          U.createElement('button', { className: 'btn btn-icon btn-ghost', title: 'Print Professional Receipt (A4)', onClick: function() { BK.Receipts.generateA4(txn); } }, [
            U.createElement('i', { className: 'fas fa-print' })
          ]),
          U.createElement('button', { 
            className: 'btn btn-icon btn-ghost ' + (isVerified ? 'text-success' : 'text-muted'), 
            title: isVerified ? 'Verified' : 'Unverified - Click to Verify',
            onClick: function () { self.toggleVerify(txn); }
          }, [
            U.createElement('i', { className: isVerified ? 'fas fa-check-circle' : 'far fa-circle' })
          ]),
          U.createElement('button', { className: 'btn btn-icon btn-ghost', title: 'Edit', onClick: function () { self.showForm(txn); } }, [
            U.createElement('i', { className: 'fas fa-pen' })
          ]),
          U.createElement('button', { className: 'btn btn-icon btn-ghost text-danger', title: 'Delete', onClick: function () { self.deleteTransaction(txn.id); } }, [
            U.createElement('i', { className: 'fas fa-trash-alt' })
          ])
        ])
      ])
    ]);
  };

  // ─── Bulk Actions ───
  TransactionsController.prototype.toggleSelect = function(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.syncSelectionUI();
  };

  TransactionsController.prototype.toggleSelectAll = function(checked, currentTxns) {
    var self = this;
    if (checked) {
      currentTxns.forEach(function(t) { self.selectedIds.add(t.id); });
    } else {
      currentTxns.forEach(function(t) { self.selectedIds.delete(t.id); });
    }
    this.syncSelectionUI();
  };

  // Reflect the selection onto the existing rows. Rebuilding the table here would
  // discard scroll position and destroy the row mid-dispatch of its own event.
  TransactionsController.prototype.syncSelectionUI = function() {
    var self = this;
    var tbody = document.getElementById('transactions-tbody');
    if (tbody) {
      var rows = tbody.querySelectorAll('tr[data-txn-id]');
      var selectedVisible = 0;
      rows.forEach(function(row) {
        var id = parseInt(row.dataset.txnId, 10);
        var isSelected = self.selectedIds.has(id);
        if (isSelected) selectedVisible++;
        row.classList.toggle('selected', isSelected);
        row.style.background = isSelected ? 'var(--primary-light)' : '';
        var cb = row.querySelector('.txn-checkbox');
        if (cb) cb.checked = isSelected;
      });

      var masterCheckbox = document.getElementById('txn-master-checkbox');
      if (masterCheckbox) {
        masterCheckbox.checked = rows.length > 0 && selectedVisible === rows.length;
        masterCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < rows.length;
      }
    }
    this.updateBulkToolbar();
  };

  TransactionsController.prototype.updateBulkToolbar = function() {
    var toolbar = document.getElementById('bulk-actions-toolbar');
    var countEl = document.getElementById('bulk-selection-count');
    if (!toolbar) return;

    if (this.selectedIds.size > 0) {
      toolbar.classList.remove('hidden');
      if (countEl) countEl.textContent = this.selectedIds.size + ' items selected';
    } else {
      toolbar.classList.add('hidden');
    }
  };

  TransactionsController.prototype.bulkDelete = function() {
    var self = this;
    var ids = Array.from(this.selectedIds);
    if (ids.length === 0) return;

    // Removing one leg of a transfer but not the other would leave a stranded
    // entry that silently skews the balance of the account it sits in.
    return BK.db.transactions.where('id').anyOf(ids).toArray().then(function(selected) {
      var idSet = {};
      selected.forEach(function(t) {
        idSet[t.id] = true;
        if (t.relatedId) idSet[t.relatedId] = true;
      });
      var deleteIds = Object.keys(idSet).map(Number);
      var extra = deleteIds.length - ids.length;

      return Modal.confirm(
        'Bulk Delete',
        'Are you sure you want to delete ' + deleteIds.length + ' transactions?'
          + (extra > 0 ? ' This includes ' + extra + ' linked transfer entr' + (extra === 1 ? 'y' : 'ies') + '.' : ''),
        'danger'
      ).then(function(confirmed) {
        if (!confirmed) return;
        return BK.db.transactions.bulkDelete(deleteIds).then(function() {
          self.selectedIds.clear();
          Toast.success('Deleted ' + deleteIds.length + ' transactions.');
          return self.render();
        });
      });
    }).catch(function(err) { Toast.error('Failed to delete: ' + err.message); });
  };

  TransactionsController.prototype.bulkToggleVerify = function() {
    var self = this;
    var ids = Array.from(this.selectedIds);
    BK.db.transactions.where('id').anyOf(ids).modify(function(txn) {
      txn.isVerified = !txn.isVerified;
    }).then(function() {
      Toast.info('Verification updated for ' + ids.length + ' items.');
      return self.render();
    });
  };

  TransactionsController.prototype.bulkChangeCategory = function() {
    var ids = Array.from(this.selectedIds);
    if (ids.length === 0) return;

    var select = document.getElementById('bulk-cat-select');
    if (!select) return;

    return this.categoriesCtrl.renderOptions(select, null).then(function() {
      var clearOpt = select.querySelector('option');
      if (clearOpt) clearOpt.textContent = '— Clear category —';
      var countEl = document.getElementById('bulk-cat-count');
      if (countEl) countEl.textContent = ids.length + ' transaction' + (ids.length === 1 ? '' : 's') + ' selected.';
      Modal.open('modal-bulk-category');
    });
  };

  TransactionsController.prototype.applyBulkCategory = function() {
    var self = this;
    var select = document.getElementById('bulk-cat-select');
    var ids = Array.from(this.selectedIds);
    if (!select || ids.length === 0) return;

    var raw = select.value;
    var catId = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && isNaN(catId)) { Toast.error('Invalid category selected.'); return; }

    return BK.db.transactions.where('id').anyOf(ids).modify({ categoryId: catId }).then(function() {
      Toast.success('Category updated for ' + ids.length + ' items.');
      Modal.close('modal-bulk-category');
      self.selectedIds.clear();
      return self.render();
    }).catch(function(err) { Toast.error('Failed to update category: ' + err.message); });
  };

  TransactionsController.prototype.toggleVerify = function (txn) {
    var self = this;
    var newStatus = !txn.isVerified;
    return TDB.update(txn.id, Object.assign({}, txn, { isVerified: newStatus })).then(function () {
      Toast.info(newStatus ? 'Transaction verified.' : 'Verification removed.');
      return self.render();
    });
  };

  TransactionsController.prototype.showForm = function (txn) {
    var self = this;
    this.editingId = txn ? txn.id : null;
    var title = document.getElementById('txn-modal-title');
    var dateInput = document.getElementById('txn-date');
    var accountSelect = document.getElementById('txn-account');
    var typeSelect = document.getElementById('txn-type');
    var amountInput = document.getElementById('txn-amount');
    var descInput = document.getElementById('txn-description');
    var categorySelect = document.getElementById('txn-category');
    var isTransferCheck = document.getElementById('txn-is-transfer');
    var toAccountSelect = document.getElementById('txn-to-account');
    var transferExtra = document.getElementById('transfer-extra-fields');

    if (title) title.textContent = txn ? 'Edit Transaction' : 'New Transaction';

    // Categories rendering
    this.categoriesCtrl.renderOptions(categorySelect, txn ? txn.categoryId : null);

    this.accountsCtrl.renderAccountOptions(accountSelect, txn ? txn.accountId : null).then(function () {
      return self.accountsCtrl.renderAccountOptions(toAccountSelect, txn ? txn.relatedId : null);
    }).then(function () {
      if (dateInput) dateInput.value = txn ? txn.date : U.getTodayStr();
      if (typeSelect) typeSelect.value = txn ? txn.type : 'debit';
      if (amountInput) amountInput.value = txn ? txn.amount : '';
      if (descInput) descInput.value = txn ? txn.description : '';
      
      if (isTransferCheck) {
        isTransferCheck.checked = txn ? !!txn.isTransfer : false;
        isTransferCheck.disabled = !!txn;
        if (transferExtra) transferExtra.classList.toggle('hidden', !isTransferCheck.checked);
      }

      self.receiptData = txn ? txn.receiptData : null;
      self.receiptType = txn ? txn.receiptType : null;
      self.receiptName = txn ? txn.receiptName : null;
      self.updateReceiptUI();

      document.querySelectorAll('#transaction-form .form-group').forEach(function (g) { g.classList.remove('has-error'); });
      Modal.open('modal-transaction');
    });
  };

  TransactionsController.prototype.saveTransaction = function () {
    var self = this;
    var dateInput = document.getElementById('txn-date');
    var accountSelect = document.getElementById('txn-account');
    var typeSelect = document.getElementById('txn-type');
    var amountInput = document.getElementById('txn-amount');
    var descInput = document.getElementById('txn-description');
    var categorySelect = document.getElementById('txn-category');
    var isTransferCheck = document.getElementById('txn-is-transfer');
    var toAccountSelect = document.getElementById('txn-to-account');

    var date = dateInput.value;
    var accountId = parseInt(accountSelect.value);
    var type = typeSelect.value;
    var amount = amountInput.value.trim();
    var description = descInput.value.trim();
    var categoryId = parseInt(categorySelect.value) || null;
    var isTransfer = isTransferCheck ? isTransferCheck.checked : false;
    var toAccountId = toAccountSelect ? parseInt(toAccountSelect.value) : null;
    var valid = true;

    if (!U.validateDate(date)) { dateInput.closest('.form-group').classList.add('has-error'); valid = false; }
    else { dateInput.closest('.form-group').classList.remove('has-error'); }

    if (!accountId) { accountSelect.closest('.form-group').classList.add('has-error'); valid = false; }
    else { accountSelect.closest('.form-group').classList.remove('has-error'); }

    if (!U.validateAmount(amount)) { amountInput.closest('.form-group').classList.add('has-error'); valid = false; }
    else { amountInput.closest('.form-group').classList.remove('has-error'); }

    if (isTransfer && (!toAccountId || toAccountId === accountId)) {
      toAccountSelect.closest('.form-group').classList.add('has-error');
      Toast.warning('Select a different destination account for transfer.');
      valid = false;
    } else if (toAccountSelect) {
      toAccountSelect.closest('.form-group').classList.remove('has-error');
    }

    if (!valid) { Toast.warning('Please fix the highlighted fields.'); return; }

    var pAmount = parseFloat(amount);
    var data = {
      date: date, accountId: accountId, type: type,
      amount: pAmount, description: U.sanitize(description),
      categoryId: categoryId, isTransfer: isTransfer,
      receiptData: self.receiptData, receiptType: self.receiptType, receiptName: self.receiptName
    };

    var promise;
    if (self.editingId) {
      promise = TDB.getById(self.editingId).then(function (existingTxn) {
        if (existingTxn.isTransfer && existingTxn.relatedId) {
          return TDB.getById(existingTxn.relatedId).then(function (relatedTxn) {
            if (relatedTxn) {
              // Transfer legs are not spending, so they carry no category.
              var update1 = Object.assign({}, data, { type: existingTxn.type, accountId: existingTxn.accountId, categoryId: null });
              var update2 = Object.assign({}, data, { type: relatedTxn.type, accountId: relatedTxn.accountId, description: relatedTxn.description, categoryId: null });
              
              if (existingTxn.type === 'debit') {
                  update1.description = 'Transfer to target account: ' + data.description;
                  update2.description = 'Transfer from source account: ' + data.description;
                  if (toAccountId) update2.accountId = toAccountId;
              } else {
                  update1.description = 'Transfer from source account: ' + data.description;
                  update2.description = 'Transfer to target account: ' + data.description;
              }

              return Promise.all([
                TDB.update(self.editingId, update1),
                TDB.update(relatedTxn.id, update2)
              ]);
            }
            return TDB.update(self.editingId, data);
          });
        }
        return TDB.update(self.editingId, data);
      });
    } else if (isTransfer) {
      // Create two transactions. Neither leg is income or expense, so neither
      // carries a category — otherwise transfers show up in the spending chart.
      var debitTxn = Object.assign({}, data, { type: 'debit', categoryId: null, description: 'Transfer to target account: ' + description });
      promise = TDB.add(debitTxn).then(function (id1) {
        var creditTxn = Object.assign({}, data, {
          type: 'credit',
          accountId: toAccountId,
          categoryId: null,
          relatedId: id1,
          description: 'Transfer from source account: ' + description
        });
        return TDB.add(creditTxn).then(function (id2) {
          return TDB.update(id1, Object.assign({}, debitTxn, { relatedId: id2 }));
        });
      });
    } else {
      promise = TDB.add(data);
    }

    return promise.then(function () {
      Toast.success(self.editingId ? 'Transaction updated.' : 'Transaction added.');
      Modal.close('modal-transaction');
      return self.render();
    }).then(function () {
      window.dispatchEvent(new CustomEvent('transactions-updated'));
    }).catch(function (err) { Toast.error('Failed to save: ' + err.message); });
  };

  TransactionsController.prototype.deleteTransaction = function (id) {
    var self = this;
    return Modal.confirm('Delete Transaction', 'Are you sure you want to delete this transaction?', 'danger')
      .then(function (confirmed) {
        if (!confirmed) return;
        return TDB.getById(id).then(function (txn) {
          if (!txn) return;
          var p = TDB.delete(id);
          if (txn.relatedId) {
            p = p.then(function () { return TDB.delete(txn.relatedId); });
          }
          return p;
        }).then(function () {
          Toast.success('Transaction deleted.');
          return self.render();
        }).then(function () {
          window.dispatchEvent(new CustomEvent('transactions-updated'));
        });
      }).catch(function (err) { Toast.error('Failed to delete: ' + err.message); });
  };

  TransactionsController.prototype.handleReceiptUpload = function (e) {
    var file = e.target.files[0];
    if (file) {
      this.processFile(file);
    }
    e.target.value = '';
  };

  TransactionsController.prototype.handlePaste = function (e) {
    var self = this;
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var file = items[i].getAsFile();
        if (file) {
          // Give it a generic name if it's from clipboard
          var blob = file.slice(0, file.size, file.type);
          var newFile = new File([blob], "screenshot-" + Date.now() + ".png", { type: file.type });
          self.processFile(newFile);
        }
        break;
      }
    }
  };

  TransactionsController.prototype.processFile = function (file) {
    var self = this;
    var allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/vnd.ms-outlook', 'message/rfc822'];
    var ext = file.name.split('.').pop().toLowerCase();
    var isEmail = ext === 'msg' || ext === 'eml';

    if (allowed.indexOf(file.type) === -1 && !isEmail) {
      Toast.warning('Only images, PDFs, MSG, and EML files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      Toast.warning('File size must be under 5MB.');
      return;
    }

    U.fileToBase64(file).then(function (data) {
      self.receiptData = data;
      self.receiptType = file.type;
      self.receiptName = file.name;
      self.updateReceiptUI();
      Toast.info('Receipt "' + file.name + '" attached.');
    }).catch(function () { Toast.error('Failed to process file.'); });
  };

  TransactionsController.prototype.handleOCR = function () {
    var self = this;
    if (!this.receiptData) return;
    
    this.app.automation.performOCR(this.receiptData).then(function (result) {
      if (result.amount) {
        var amtInput = document.getElementById('txn-amount');
        if (amtInput) amtInput.value = result.amount;
        BK.Toast.success('Extracted amount: ' + result.amount);
      }
    }).catch(function (err) {
      BK.Toast.error('OCR failed: ' + err.message);
    });
  };

  TransactionsController.prototype.clearReceipt = function () {
    this.receiptData = null; this.receiptType = null; this.receiptName = null;
    this.updateReceiptUI();
  };

  TransactionsController.prototype.updateReceiptUI = function () {
    var uploadArea = document.getElementById('receipt-upload-area');
    var previewArea = document.getElementById('receipt-preview-area');
    var fileName = document.getElementById('receipt-file-name');
    if (this.receiptData) {
      if (uploadArea) uploadArea.classList.add('hidden');
      if (previewArea) previewArea.classList.remove('hidden');
      if (fileName) fileName.textContent = this.receiptName || 'Receipt attached';
    } else {
      if (uploadArea) uploadArea.classList.remove('hidden');
      if (previewArea) previewArea.classList.add('hidden');
    }
  };

  TransactionsController.prototype.showReceiptPreview = function (txn) {
    var container = document.getElementById('receipt-preview-content');
    if (!container) return;
    U.clearChildren(container);

    if (txn.receiptType && txn.receiptType.indexOf('image/') === 0) {
      var img = U.createElement('img', { className: 'receipt-preview-img', alt: 'Receipt' });
      img.src = txn.receiptData;
      container.appendChild(img);
    } else if (txn.receiptType === 'application/pdf') {
      var embed = U.createElement('embed', { type: 'application/pdf', style: { width: '100%', height: '70vh', borderRadius: '8px' } });
      embed.src = txn.receiptData;
      container.appendChild(embed);
    } else if (txn.receiptName && txn.receiptName.toLowerCase().endsWith('.eml')) {
      // EML Rendering
      try {
        var base64Content = txn.receiptData.split(',')[1];
        var rawText = atob(base64Content);
        var parsed = U.parseEml(rawText);
        
        var bodyEl;
        if (parsed.isHtml) {
          // Fully sandboxed: the email body is untrusted markup, so it must not
          // share this page's origin. No scripts run, so nothing is lost.
          bodyEl = U.createElement('iframe', {
            style: { width: '100%', border: 'none', height: '500px', backgroundColor: '#fff', borderRadius: '4px' },
            sandbox: ''
          });
          // Wait for mount or set srcdoc
          bodyEl.srcdoc = `<html><head><style>body { font-family: sans-serif; }</style></head><body>${parsed.body}</body></html>`;
        } else {
          bodyEl = U.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '14px', lineHeight: '1.6', color: 'var(--text-primary)' } }, [parsed.body]);
        }

        var emailView = U.createElement('div', { className: 'email-preview', style: { textAlign: 'left', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden', maxHeight: 'none' } }, [
          U.createElement('div', { style: { marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' } }, [
            U.createElement('div', { style: { fontWeight: '700', fontSize: '16px', marginBottom: '4px' } }, [parsed.subject]),
            U.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' } }, [
              U.createElement('strong', {}, ['From: ']), parsed.from
            ]),
            U.createElement('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, [
              U.createElement('strong', {}, ['Date: ']), parsed.date
            ])
          ]),
          bodyEl
        ]);
        container.appendChild(emailView);
        container.appendChild(U.createElement('div', { style: { marginTop: '16px' } }, [
          U.createElement('a', { href: txn.receiptData, download: txn.receiptName, className: 'btn btn-outline btn-sm' }, [
            U.createElement('i', { className: 'fas fa-download', style: { marginRight: '8px' } }), 'Download Original EML'
          ])
        ]));
      } catch (e) {
        container.appendChild(U.createElement('p', { className: 'text-danger' }, ['Failed to render EML file.']));
      }
    } else if (txn.receiptName && txn.receiptName.toLowerCase().endsWith('.msg')) {
      // MSG Placeholder & Download
      var msgView = U.createElement('div', { style: { padding: '40px 20px', textAlign: 'center' } }, [
        U.createElement('i', { className: 'fas fa-envelope-open-text', style: { fontSize: '64px', color: 'var(--primary)', marginBottom: '20px', opacity: '0.6' } }),
        U.createElement('h4', {}, ['Outlook Message File (.msg)']),
        U.createElement('p', { className: 'text-muted', style: { marginBottom: '24px' } }, ['Direct preview for .msg files is not supported in the browser.']),
        U.createElement('a', { href: txn.receiptData, download: txn.receiptName, className: 'btn btn-primary' }, [
          U.createElement('i', { className: 'fas fa-download', style: { marginRight: '8px' } }), 'Download to View in Outlook'
        ])
      ]);
      container.appendChild(msgView);
    } else {
      container.appendChild(U.createElement('p', { className: 'text-muted' }, ['Cannot preview this file type.']));
      if (txn.receiptData) {
        container.appendChild(U.createElement('a', { href: txn.receiptData, download: txn.receiptName || 'attachment', className: 'btn btn-outline btn-sm', style: { marginTop: '12px' } }, ['Download anyway']));
      }
    }
    Modal.open('modal-receipt-preview');
  };

  TransactionsController.prototype.applyFilter = function (filterObj) {
    if (filterObj.accountId !== undefined) this.filters.accountId = filterObj.accountId;
    if (filterObj.accountType !== undefined) this.filters.accountType = filterObj.accountType;
    if (filterObj.type !== undefined) this.filters.type = filterObj.type;
    if (filterObj.search !== undefined) this.filters.search = filterObj.search;

    var accountFilter = document.getElementById('txn-filter-account');
    var accountTypeFilter = document.getElementById('txn-filter-account-type');
    var typeFilter = document.getElementById('txn-filter-type');
    var searchInput = document.getElementById('txn-filter-search');

    if (accountFilter) accountFilter.value = this.filters.accountId;
    if (accountTypeFilter) accountTypeFilter.value = this.filters.accountType;
    if (typeFilter) typeFilter.value = this.filters.type;
    if (searchInput) searchInput.value = this.filters.search;

    this.renderTable();
  };

  BK.TransactionsController = TransactionsController;
})();
