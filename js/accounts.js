"use strict";

/**
 * Accounts Controller
 * Handles account CRUD operations and UI rendering.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Toast = BK.Toast;
  var Modal = BK.ModalManager;
  var DB = BK.AccountsDB;

  function AccountsController() {
    this.editingId = null;
  }

  AccountsController.prototype.init = function () {
    var self = this;
    var form = document.getElementById('account-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); self.saveAccount(); });

    var addBtn = document.getElementById('btn-add-account');
    if (addBtn) addBtn.addEventListener('click', function () { self.showForm(); });
  };

  AccountsController.prototype.render = function () {
    var self = this;
    return DB.getAll().then(function (accounts) {
      var grid = document.getElementById('accounts-grid');
      if (!grid) return;
      U.clearChildren(grid);

      if (accounts.length === 0) {
        grid.appendChild(self.renderEmpty());
        return;
      }

      var promises = accounts.map(function (account) {
        return Promise.all([
          BK.calculateAccountBalance(account.id),
          BK.TransactionsDB.getByAccount(account.id)
        ]).then(function (res) {
          return { account: account, balance: res[0], txnCount: res[1].length };
        });
      });

      return Promise.all(promises).then(function (results) {
        results.forEach(function (r) {
          grid.appendChild(self.renderAccountCard(r.account, r.balance, r.txnCount));
        });
      });
    });
  };

  AccountsController.prototype.renderEmpty = function () {
    var self = this;
    return U.createElement('div', { 
      className: 'table-empty', 
      style: { gridColumn: '1 / -1', padding: '100px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-primary)' } 
    }, [
      U.createElement('i', { className: 'fas fa-university', style: { color: 'var(--primary)', opacity: '0.6' } }),
      U.createElement('p', { style: { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' } }, ['Your Financial Journey Starts Here']),
      U.createElement('p', { style: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' } }, ['Create your first account to begin tracking your bank transactions and performance.']),
      U.createElement('button', { className: 'btn btn-primary btn-lg', onClick: function () { self.showForm(); } }, [
        U.createElement('i', { className: 'fas fa-plus' }), ' Create My First Account'
      ])
    ]);
  };

  AccountsController.prototype.renderAccountCard = function (account, balance, txnCount) {
    var self = this;
    return U.createElement('div', { className: 'account-card' }, [
      U.createElement('div', { className: 'account-card-header' }, [
        U.createElement('div', {}, [
          U.createElement('div', { className: 'account-card-name' }, [U.escapeHtml(account.name)]),
          U.createElement('div', { className: 'account-card-number' }, [U.escapeHtml(account.accountNumber || 'N/A')])
        ]),
        U.createElement('div', { className: 'action-btns' }, [
          U.createElement('button', { className: 'btn btn-icon btn-ghost', title: 'Edit', onClick: function () { self.showForm(account); } }, [
            U.createElement('i', { className: 'fas fa-pen' })
          ]),
          U.createElement('button', { className: 'btn btn-icon btn-ghost text-danger', title: 'Delete', onClick: function () { self.deleteAccount(account.id, account.name); } }, [
            U.createElement('i', { className: 'fas fa-trash-alt' })
          ])
        ])
      ]),
      U.createElement('div', { className: 'account-card-label' }, ['Current Balance']),
      U.createElement('div', { className: 'account-card-balance ' + (balance >= 0 ? 'text-success' : 'text-danger') }, [U.formatCurrency(balance)]),
      U.createElement('div', { className: 'account-card-footer' }, [
        U.createElement('span', { className: 'text-muted', style: { fontSize: '12px' } }, ['Opening: ' + U.formatCurrency(account.openingBalance)]),
        U.createElement('span', { className: 'account-card-txn-count' }, [
          U.createElement('i', { className: 'fas fa-exchange-alt', style: { fontSize: '10px' } }),
          (txnCount || 0) + ' transactions'
        ])
      ])
    ]);
  };

  AccountsController.prototype.showForm = function (account) {
    this.editingId = account ? account.id : null;
    var title = document.getElementById('account-modal-title');
    var nameInput = document.getElementById('account-name');
    var numberInput = document.getElementById('account-number');
    var balanceInput = document.getElementById('account-opening-balance');

    if (title) title.textContent = account ? 'Edit Account' : 'New Account';
    if (nameInput) nameInput.value = account ? account.name : '';
    if (numberInput) numberInput.value = account ? account.accountNumber : '';
    if (balanceInput) balanceInput.value = account ? account.openingBalance : '';

    document.querySelectorAll('#account-form .form-group').forEach(function (g) { g.classList.remove('has-error'); });
    Modal.open('modal-account');
  };

  AccountsController.prototype.saveAccount = function () {
    var self = this;
    var nameInput = document.getElementById('account-name');
    var numberInput = document.getElementById('account-number');
    var balanceInput = document.getElementById('account-opening-balance');

    var name = nameInput.value.trim();
    var accountNumber = numberInput.value.trim();
    var openingBalance = balanceInput.value.trim();
    var valid = true;

    if (!U.validateRequired(name)) {
      nameInput.closest('.form-group').classList.add('has-error');
      valid = false;
    } else {
      nameInput.closest('.form-group').classList.remove('has-error');
    }

    if (openingBalance !== '' && !U.validateAmount(openingBalance) && parseFloat(openingBalance) !== 0) {
      balanceInput.closest('.form-group').classList.add('has-error');
      valid = false;
    } else {
      balanceInput.closest('.form-group').classList.remove('has-error');
    }

    if (!valid) { Toast.warning('Please fix the highlighted fields.'); return; }

    var data = { name: U.sanitize(name), accountNumber: U.sanitize(accountNumber), openingBalance: parseFloat(openingBalance) || 0 };

    var action = self.editingId ? DB.update(self.editingId, data) : DB.add(data);
    return action.then(function () {
      Toast.success(self.editingId ? 'Account updated successfully.' : 'Account created successfully.');
      Modal.close('modal-account');
      return self.render();
    }).then(function () {
      window.dispatchEvent(new CustomEvent('accounts-updated'));
    }).catch(function (err) {
      Toast.error('Failed to save account: ' + err.message);
    });
  };

  AccountsController.prototype.deleteAccount = function (id, name) {
    var self = this;
    return Modal.confirm('Delete Account', 'Are you sure you want to delete "' + name + '"? All transactions will also be deleted.', 'danger')
      .then(function (confirmed) {
        if (!confirmed) return;
        return DB.delete(id).then(function () {
          Toast.success('Account deleted successfully.');
          return self.render();
        }).then(function () {
          window.dispatchEvent(new CustomEvent('accounts-updated'));
        });
      }).catch(function (err) { Toast.error('Failed to delete: ' + err.message); });
  };

  AccountsController.prototype.renderAccountOptions = function (selectEl, selectedId) {
    return DB.getAll().then(function (accounts) {
      U.clearChildren(selectEl);
      selectEl.appendChild(U.createElement('option', { value: '' }, ['-- Select Account --']));
      accounts.forEach(function (acc) {
        var opt = U.createElement('option', { value: String(acc.id) }, [U.escapeHtml(acc.name)]);
        if (selectedId && acc.id === selectedId) opt.selected = true;
        selectEl.appendChild(opt);
      });
    });
  };

  BK.AccountsController = AccountsController;
})();
