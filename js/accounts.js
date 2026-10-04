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
    if (addBtn) addBtn.addEventListener('click', function () { self.showForm(null, 'bank'); });

    var addRecBtn = document.getElementById('btn-add-receivable');
    if (addRecBtn) addRecBtn.addEventListener('click', function () { self.showForm(null, 'receivable'); });

    var addPayBtn = document.getElementById('btn-add-payable');
    if (addPayBtn) addPayBtn.addEventListener('click', function () { self.showForm(null, 'payable'); });
  };

  AccountsController.prototype.render = function () {
    var self = this;
    return DB.getAll().then(function (accounts) {
      var gridBank = document.getElementById('accounts-grid');
      var gridRec = document.getElementById('receivables-grid');
      var gridPay = document.getElementById('payables-grid');

      if (gridBank) U.clearChildren(gridBank);
      if (gridRec) U.clearChildren(gridRec);
      if (gridPay) U.clearChildren(gridPay);

      var bankAccs = accounts.filter(function(a) { return !a.accountType || a.accountType === 'bank'; });
      var recAccs = accounts.filter(function(a) { return a.accountType === 'receivable'; });
      var payAccs = accounts.filter(function(a) { return a.accountType === 'payable'; });

      if (gridBank && bankAccs.length === 0) gridBank.appendChild(self.renderEmpty('bank', 'Create your first bank account to begin tracking your transactions.', 'fas fa-university'));
      if (gridRec && recAccs.length === 0) gridRec.appendChild(self.renderEmpty('receivable', 'Add a person or business that owes you money.', 'fas fa-hand-holding-usd'));
      if (gridPay && payAccs.length === 0) gridPay.appendChild(self.renderEmpty('payable', 'Add a person or business that you owe money to.', 'fas fa-file-invoice-dollar'));

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
          var type = r.account.accountType || 'bank';
          if (type === 'bank' && gridBank) gridBank.appendChild(self.renderAccountCard(r.account, r.balance, r.txnCount));
          else if (type === 'receivable' && gridRec) gridRec.appendChild(self.renderAccountCard(r.account, r.balance, r.txnCount));
          else if (type === 'payable' && gridPay) gridPay.appendChild(self.renderAccountCard(r.account, r.balance, r.txnCount));
        });
      });
    });
  };

  AccountsController.prototype.renderEmpty = function (type, subtitle, iconClass) {
    var self = this;
    var btnText = ' Create My First Account';
    var btnClass = 'btn btn-primary btn-lg';
    
    if (type === 'receivable') {
      btnText = ' Add New Receivable';
      btnClass = 'btn btn-aloe btn-lg';
    } else if (type === 'payable') {
      btnText = ' Add New Payable';
      btnClass = 'btn btn-outline btn-lg text-danger';
    }

    return U.createElement('div', { 
      className: 'table-empty', 
      style: { gridColumn: '1 / -1', padding: '100px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-primary)' } 
    }, [
      U.createElement('i', { className: iconClass, style: { color: 'var(--primary)', opacity: '0.6' } }),
      U.createElement('p', { style: { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' } }, ['Nothing here yet']),
      U.createElement('p', { style: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' } }, [subtitle]),
      U.createElement('button', { className: btnClass, onClick: function () { self.showForm(null, type); } }, [
        U.createElement('i', { className: 'fas fa-plus' }), btnText
      ])
    ]);
  };

  AccountsController.prototype.renderAccountCard = function (account, balance, txnCount) {
    var self = this;
    var type = account.accountType || 'bank';

    // A positive balance means opposite things per account type: money owed to
    // the user for a receivable, but money the user owes for a payable.
    var balanceLabel = 'Current Balance';
    var balanceClass = balance >= 0 ? 'text-success' : 'text-danger';
    if (type === 'receivable') {
      balanceLabel = balance >= 0 ? 'Owed to You' : 'You Owe (Overpaid)';
      balanceClass = balance >= 0 ? 'text-success' : 'text-danger';
    } else if (type === 'payable') {
      balanceLabel = balance >= 0 ? 'You Owe' : 'Owed to You (Overpaid)';
      balanceClass = balance >= 0 ? 'text-danger' : 'text-success';
    }

    return U.createElement('div', { className: 'account-card' }, [
      U.createElement('div', { className: 'account-card-header' }, [
        U.createElement('div', {}, [
          U.createElement('div', { className: 'account-card-name' }, [account.name]),
          U.createElement('div', { className: 'account-card-number' }, [account.accountNumber || 'N/A'])
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
      U.createElement('div', { className: 'account-card-label' }, [balanceLabel]),
      U.createElement('div', { className: 'account-card-balance ' + balanceClass }, [U.formatCurrency(balance)]),
      U.createElement('div', { className: 'account-card-footer' }, [
        U.createElement('span', { className: 'text-muted', style: { fontSize: '12px' } }, ['Opening: ' + U.formatCurrency(account.openingBalance)]),
        U.createElement('span', { className: 'account-card-txn-count' }, [
          U.createElement('i', { className: 'fas fa-exchange-alt', style: { fontSize: '10px' } }),
          (txnCount || 0) + ' transactions'
        ])
      ])
    ]);
  };

  AccountsController.prototype.showForm = function (account, prefillType) {
    this.editingId = account ? account.id : null;
    var title = document.getElementById('account-modal-title');
    var nameInput = document.getElementById('account-name');
    var numberInput = document.getElementById('account-number');
    var balanceInput = document.getElementById('account-opening-balance');
    var typeInput = document.getElementById('account-type');

    if (title) title.textContent = account ? 'Edit Account' : 'New Account';
    if (nameInput) nameInput.value = account ? account.name : '';
    if (numberInput) numberInput.value = account ? account.accountNumber : '';
    if (balanceInput) balanceInput.value = account ? account.openingBalance : '';
    if (typeInput) typeInput.value = account ? (account.accountType || 'bank') : (prefillType || 'bank');

    document.querySelectorAll('#account-form .form-group').forEach(function (g) { g.classList.remove('has-error'); });
    Modal.open('modal-account');
  };

  AccountsController.prototype.saveAccount = function () {
    var self = this;
    var nameInput = document.getElementById('account-name');
    var numberInput = document.getElementById('account-number');
    var balanceInput = document.getElementById('account-opening-balance');
    var typeInput = document.getElementById('account-type');

    var name = nameInput.value.trim();
    var accountNumber = numberInput.value.trim();
    var openingBalance = balanceInput.value.trim();
    var accountType = typeInput ? typeInput.value : 'bank';
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

    var data = { name: U.sanitize(name), accountNumber: U.sanitize(accountNumber), accountType: accountType, openingBalance: parseFloat(openingBalance) || 0 };

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
      
      var banks = U.createElement('optgroup', { label: 'Bank & Cash' });
      var recs = U.createElement('optgroup', { label: 'Receivables (Owed to Me)' });
      var pays = U.createElement('optgroup', { label: 'Payables (I Owe)' });

      accounts.forEach(function (acc) {
        var opt = U.createElement('option', { value: String(acc.id) }, [acc.name]);
        if (selectedId && acc.id === selectedId) opt.selected = true;
        
        if (acc.accountType === 'receivable') recs.appendChild(opt);
        else if (acc.accountType === 'payable') pays.appendChild(opt);
        else banks.appendChild(opt);
      });

      if (banks.children.length > 0) selectEl.appendChild(banks);
      if (recs.children.length > 0) selectEl.appendChild(recs);
      if (pays.children.length > 0) selectEl.appendChild(pays);
    });
  };

  BK.AccountsController = AccountsController;
})();
