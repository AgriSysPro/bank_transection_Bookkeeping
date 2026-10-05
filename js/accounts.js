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

  function AccountsController(app) {
    this.app = app;
    this.editingId = null;
    this.currentTxnPerson = null;
  }

  AccountsController.prototype.init = function () {
    var self = this;
    var form = document.getElementById('account-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); self.saveAccount(); });

    var personTxnForm = document.getElementById('person-txn-form');
    if (personTxnForm) personTxnForm.addEventListener('submit', function (e) { e.preventDefault(); self.savePersonTransaction(); });

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
    var isPerson = (type === 'receivable' || type === 'payable');

    if (!isPerson) {
      // Standard Bank / Cash Account Card
      return U.createElement('div', { className: 'account-card' }, [
        U.createElement('div', { className: 'account-card-header' }, [
          U.createElement('div', {}, [
            U.createElement('div', { className: 'account-card-name' }, [account.name]),
            U.createElement('div', { className: 'account-card-number' }, [account.accountNumber ? 'Acc: ' + account.accountNumber : 'Cash / Wallet'])
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
            (txnCount || 0) + ' txns'
          ])
        ])
      ]);
    }

    // ─── Person Profile Card (Receivable / Payable) ───
    var nameParts = (account.name || '').trim().split(/\s+/);
    var initials = nameParts.length > 1 
      ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
      : (nameParts[0] ? nameParts[0].substring(0, 2).toUpperCase() : 'P');

    var isRec = (type === 'receivable');
    var balanceStatusLabel = '';
    var balanceStatusClass = '';
    var balanceAmountStr = '';
    var statusTagText = '';
    var statusTagClass = '';

    if (isRec) {
      if (balance > 0) {
        balanceStatusLabel = 'OWED TO YOU';
        balanceStatusClass = 'text-success';
        balanceAmountStr = U.formatCurrency(balance);
        statusTagText = 'Pending Collection';
        statusTagClass = 'badge-credit';
      } else if (balance === 0) {
        balanceStatusLabel = 'STATUS: SETTLED';
        balanceStatusClass = 'text-muted';
        balanceAmountStr = U.formatCurrency(0);
        statusTagText = 'Fully Settled';
        statusTagClass = 'badge';
      } else {
        balanceStatusLabel = 'OVERPAID BY PERSON';
        balanceStatusClass = 'text-danger';
        balanceAmountStr = U.formatCurrency(Math.abs(balance));
        statusTagText = 'Overpaid';
        statusTagClass = 'badge-debit';
      }
    } else {
      if (balance > 0) {
        balanceStatusLabel = 'YOU OWE PERSON';
        balanceStatusClass = 'text-danger';
        balanceAmountStr = U.formatCurrency(balance);
        statusTagText = 'Pending Payment';
        statusTagClass = 'badge-debit';
      } else if (balance === 0) {
        balanceStatusLabel = 'STATUS: SETTLED';
        balanceStatusClass = 'text-muted';
        balanceAmountStr = U.formatCurrency(0);
        statusTagText = 'Fully Settled';
        statusTagClass = 'badge';
      } else {
        balanceStatusLabel = 'YOU OVERPAID';
        balanceStatusClass = 'text-success';
        balanceAmountStr = U.formatCurrency(Math.abs(balance));
        statusTagText = 'Overpaid';
        statusTagClass = 'badge-credit';
      }
    }

    // Contact and Relationship Chips
    var chips = [];
    if (account.phone) {
      chips.push(U.createElement('a', { 
        className: 'person-chip', 
        href: 'tel:' + account.phone,
        title: 'Call or Message' 
      }, [
        U.createElement('i', { className: 'fas fa-phone' }),
        account.phone
      ]));
    }
    if (account.accountNumber) {
      chips.push(U.createElement('span', { className: 'person-chip', title: 'CNIC / National ID' }, [
        U.createElement('i', { className: 'fas fa-id-card' }),
        account.accountNumber
      ]));
    }
    if (account.notes) {
      chips.push(U.createElement('span', { className: 'person-chip', title: account.notes }, [
        U.createElement('i', { className: 'fas fa-tag' }),
        account.notes
      ]));
    }

    // Inflow & Outflow Action buttons
    var actionBtn1, actionBtn2;
    if (isRec) {
      actionBtn1 = U.createElement('button', {
        className: 'btn btn-aloe btn-sm',
        title: 'Record payment received from this person (Inflow)',
        onClick: function () { self.showPersonTxnModal(account, 'rec_payment'); }
      }, [
        U.createElement('i', { className: 'fas fa-arrow-down' }), ' Receive Payment'
      ]);
      actionBtn2 = U.createElement('button', {
        className: 'btn btn-outline btn-sm',
        title: 'Give more money / loan to this person (Outflow)',
        onClick: function () { self.showPersonTxnModal(account, 'rec_give'); }
      }, [
        U.createElement('i', { className: 'fas fa-arrow-up' }), ' Give Money'
      ]);
    } else {
      actionBtn1 = U.createElement('button', {
        className: 'btn btn-outline btn-sm text-danger',
        title: 'Pay this person to settle debt (Outflow)',
        onClick: function () { self.showPersonTxnModal(account, 'pay_payment'); }
      }, [
        U.createElement('i', { className: 'fas fa-arrow-up' }), ' Pay Person'
      ]);
      actionBtn2 = U.createElement('button', {
        className: 'btn btn-aloe btn-sm',
        title: 'Borrow more money from this person (Inflow)',
        onClick: function () { self.showPersonTxnModal(account, 'pay_borrow'); }
      }, [
        U.createElement('i', { className: 'fas fa-arrow-down' }), ' Borrow More'
      ]);
    }

    var historyBtn = U.createElement('button', {
      className: 'btn btn-ghost btn-sm',
      style: { width: '100%', marginTop: '8px', fontSize: '12px' },
      title: 'View transaction history with this person',
      onClick: function () { self.viewPersonLedger(account); }
    }, [
      U.createElement('i', { className: 'fas fa-history' }), ' View Ledger History'
    ]);

    var content = [
      U.createElement('div', { className: 'person-profile-header' }, [
        U.createElement('div', { className: 'person-avatar ' + type }, [initials]),
        U.createElement('div', { className: 'person-meta' }, [
          U.createElement('div', { className: 'account-card-name', style: { fontSize: '18px', fontWeight: '500' } }, [account.name]),
          chips.length > 0 ? U.createElement('div', { className: 'person-chips' }, chips) : null
        ].filter(Boolean)),
        U.createElement('div', { className: 'action-btns' }, [
          U.createElement('button', { className: 'btn btn-icon btn-ghost', title: 'Edit Person Profile', onClick: function () { self.showForm(account); } }, [
            U.createElement('i', { className: 'fas fa-pen' })
          ]),
          U.createElement('button', { className: 'btn btn-icon btn-ghost text-danger', title: 'Delete Person Profile', onClick: function () { self.deleteAccount(account.id, account.name); } }, [
            U.createElement('i', { className: 'fas fa-trash-alt' })
          ])
        ])
      ]),

      U.createElement('div', { className: 'person-status-banner' }, [
        U.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          U.createElement('span', { className: 'account-card-label' }, [balanceStatusLabel]),
          U.createElement('span', { className: 'badge ' + statusTagClass, style: { fontSize: '11px' } }, [statusTagText])
        ]),
        U.createElement('div', { className: 'account-card-balance ' + balanceStatusClass, style: { fontSize: '26px', marginTop: '4px' } }, [
          balanceAmountStr
        ])
      ])
    ];

    var target = account.targetAmount || 0;
    if (target > 0) {
      var currentVal = Math.max(0, balance);
      var settled = Math.max(0, target - currentVal);
      var percent = Math.min(100, Math.round((settled / target) * 100));

      content.push(U.createElement('div', { style: { marginBottom: '12px' } }, [
        U.createElement('div', { style: { fontSize: '11px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } }, [
          U.createElement('span', { className: 'text-success', style: { fontWeight: '600' } }, [U.formatCurrency(settled) + ' Settled']),
          U.createElement('span', { className: 'text-muted' }, ['of ' + U.formatCurrency(target)])
        ]),
        U.createElement('div', { style: { height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' } }, [
          U.createElement('div', { style: { width: percent + '%', height: '100%', background: 'var(--success)', borderRadius: '3px' } })
        ])
      ]));
    }

    content.push(U.createElement('div', { className: 'person-actions-grid' }, [
      actionBtn1,
      actionBtn2
    ]));
    content.push(historyBtn);

    content.push(U.createElement('div', { className: 'account-card-footer' }, [
      U.createElement('span', { className: 'text-muted', style: { fontSize: '12px' } }, ['Initial: ' + U.formatCurrency(account.openingBalance)]),
      U.createElement('span', { className: 'account-card-txn-count' }, [
        U.createElement('i', { className: 'fas fa-exchange-alt', style: { fontSize: '10px' } }),
        (txnCount || 0) + ' txns'
      ])
    ]));

    return U.createElement('div', { className: 'account-card' }, content);
  };

  AccountsController.prototype.showForm = function (account, prefillType) {
    this.editingId = account ? account.id : null;
    var title = document.getElementById('account-modal-title');
    var nameInput = document.getElementById('account-name');
    var numberInput = document.getElementById('account-number');
    var phoneInput = document.getElementById('account-phone');
    var notesInput = document.getElementById('account-notes');
    var balanceInput = document.getElementById('account-opening-balance');
    var typeSelect = document.getElementById('account-type');
    var targetInput = document.getElementById('account-target-amount');
    var targetGroup = document.getElementById('target-amount-group');
    var phoneGroup = document.getElementById('person-phone-group');
    var notesGroup = document.getElementById('person-notes-group');
    var lblName = document.getElementById('lbl-account-name');
    var lblNumber = document.getElementById('lbl-account-number');
    var lblOpening = document.getElementById('lbl-opening-balance');

    var initType = account ? (account.accountType || 'bank') : (prefillType || 'bank');
    if (typeSelect) typeSelect.value = initType;

    function applyTypeUI(t) {
      var isPerson = (t === 'receivable' || t === 'payable');
      if (targetGroup) targetGroup.style.display = isPerson ? 'block' : 'none';
      if (phoneGroup) phoneGroup.style.display = isPerson ? 'block' : 'none';
      if (notesGroup) notesGroup.style.display = isPerson ? 'block' : 'none';

      if (title) {
        if (account) {
          title.textContent = isPerson ? (t === 'receivable' ? 'Edit Person (Receivable)' : 'Edit Person (Payable)') : 'Edit Bank Account';
        } else {
          title.textContent = isPerson ? (t === 'receivable' ? 'New Person (Receivable)' : 'New Person (Payable)') : 'New Bank Account';
        }
      }

      if (lblName) {
        lblName.textContent = isPerson ? 'Person / Business Name *' : 'Account Name *';
      }
      if (nameInput) {
        nameInput.placeholder = isPerson ? 'e.g. John Doe, ABC Traders' : 'e.g. Business Checking, Cash';
      }
      if (lblNumber) {
        lblNumber.textContent = isPerson ? 'CNIC / National ID / Identifier (Optional)' : 'Account Number / Identifier';
      }
      if (lblOpening) {
        if (t === 'receivable') {
          lblOpening.textContent = 'Initial Amount Owed to You (Receivable)';
        } else if (t === 'payable') {
          lblOpening.textContent = 'Initial Amount You Owe (Payable)';
        } else {
          lblOpening.textContent = 'Opening Balance';
        }
      }
    }

    if (typeSelect) {
      typeSelect.onchange = function () { applyTypeUI(this.value); };
    }
    applyTypeUI(initType);

    if (nameInput) nameInput.value = account ? account.name : '';
    if (numberInput) numberInput.value = account ? account.accountNumber : '';
    if (phoneInput) phoneInput.value = account ? (account.phone || '') : '';
    if (notesInput) notesInput.value = account ? (account.notes || '') : '';
    if (balanceInput) balanceInput.value = account ? account.openingBalance : '';
    if (targetInput) targetInput.value = account && account.targetAmount ? account.targetAmount : '';

    document.querySelectorAll('#account-form .form-group').forEach(function (g) { g.classList.remove('has-error'); });
    Modal.open('modal-account');
  };

  AccountsController.prototype.saveAccount = function () {
    var self = this;
    var nameInput = document.getElementById('account-name');
    var numberInput = document.getElementById('account-number');
    var phoneInput = document.getElementById('account-phone');
    var notesInput = document.getElementById('account-notes');
    var balanceInput = document.getElementById('account-opening-balance');
    var typeInput = document.getElementById('account-type');
    var targetInput = document.getElementById('account-target-amount');

    var name = nameInput.value.trim();
    var accountNumber = numberInput.value.trim();
    var phone = phoneInput ? phoneInput.value.trim() : '';
    var notes = notesInput ? notesInput.value.trim() : '';
    var openingBalance = balanceInput.value.trim();
    var accountType = typeInput ? typeInput.value : 'bank';
    var targetAmount = targetInput ? targetInput.value.trim() : 0;
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

    var data = { 
      name: U.sanitize(name), 
      accountNumber: U.sanitize(accountNumber), 
      phone: U.sanitize(phone),
      notes: U.sanitize(notes),
      accountType: accountType, 
      openingBalance: parseFloat(openingBalance) || 0,
      targetAmount: parseFloat(targetAmount) || 0
    };

    var action = self.editingId ? DB.update(self.editingId, data) : DB.add(data);
    return action.then(function () {
      Toast.success(self.editingId ? 'Profile updated successfully.' : 'Profile created successfully.');
      Modal.close('modal-account');
      return self.render();
    }).then(function () {
      window.dispatchEvent(new CustomEvent('accounts-updated'));
    }).catch(function (err) {
      Toast.error('Failed to save: ' + err.message);
    });
  };

  AccountsController.prototype.showPersonTxnModal = function (account, defaultAction) {
    var self = this;
    var personIdInput = document.getElementById('ptxn-person-id');
    var personSelectGroup = document.getElementById('ptxn-person-select-group');
    var personSelect = document.getElementById('ptxn-person-select');
    var personBanner = document.getElementById('ptxn-person-banner');
    var personNameEl = document.getElementById('ptxn-person-name');
    var personTypeEl = document.getElementById('ptxn-person-type');
    var personBalanceEl = document.getElementById('ptxn-person-balance');
    var avatarEl = document.getElementById('ptxn-avatar');
    var actionSelect = document.getElementById('ptxn-action');
    var bankSelect = document.getElementById('ptxn-bank-account');
    var amountInput = document.getElementById('ptxn-amount');
    var dateInput = document.getElementById('ptxn-date');
    var descInput = document.getElementById('ptxn-description');

    if (amountInput) amountInput.value = '';
    if (dateInput) dateInput.value = U.getTodayStr();
    if (descInput) descInput.value = '';

    DB.getAll().then(function (allAccounts) {
      var bankAccounts = allAccounts.filter(function (a) { return !a.accountType || a.accountType === 'bank'; });
      var peopleAccounts = allAccounts.filter(function (a) { return a.accountType === 'receivable' || a.accountType === 'payable'; });

      U.clearChildren(bankSelect);
      bankSelect.appendChild(U.createElement('option', { value: '' }, ['-- Select Bank / Cash Wallet --']));
      bankAccounts.forEach(function (b) {
        bankSelect.appendChild(U.createElement('option', { value: String(b.id) }, [b.name]));
      });

      function updateForPerson(targetAcc) {
        if (!targetAcc) return;
        self.currentTxnPerson = targetAcc;
        if (personIdInput) personIdInput.value = targetAcc.id;
        if (personNameEl) personNameEl.textContent = targetAcc.name;
        
        var isRec = targetAcc.accountType === 'receivable';
        if (personTypeEl) personTypeEl.textContent = isRec ? 'Receivable (Owes you money)' : 'Payable (You owe this person)';
        if (avatarEl) {
          var pParts = (targetAcc.name || '').trim().split(/\s+/);
          avatarEl.textContent = pParts.length > 1 ? (pParts[0].charAt(0) + pParts[pParts.length - 1].charAt(0)).toUpperCase() : (pParts[0] ? pParts[0].substring(0, 2).toUpperCase() : 'P');
          avatarEl.style.background = isRec ? 'var(--aloe-10, #c1fbd4)' : '#fee2e2';
          avatarEl.style.color = isRec ? '#0d4722' : '#991b1b';
        }

        BK.calculateAccountBalance(targetAcc.id).then(function (bal) {
          if (personBalanceEl) {
            personBalanceEl.textContent = U.formatCurrency(Math.abs(bal));
            personBalanceEl.className = bal >= 0 ? (isRec ? 'text-success' : 'text-danger') : (isRec ? 'text-danger' : 'text-success');
          }
        });

        U.clearChildren(actionSelect);
        if (isRec) {
          actionSelect.appendChild(U.createElement('option', { value: 'rec_payment' }, ['+ Receive Payment from Person (Inflow to Bank / Settles Debt)']));
          actionSelect.appendChild(U.createElement('option', { value: 'rec_give' }, ['− Give Money to Person (Outflow from Bank / Increases Debt)']));
        } else {
          actionSelect.appendChild(U.createElement('option', { value: 'pay_payment' }, ['− Pay Person (Outflow from Bank / Settles Debt)']));
          actionSelect.appendChild(U.createElement('option', { value: 'pay_borrow' }, ['+ Borrow More from Person (Inflow to Bank / Increases Debt)']));
        }

        if (defaultAction) {
          actionSelect.value = defaultAction;
        }
      }

      if (account) {
        if (personSelectGroup) personSelectGroup.style.display = 'none';
        if (personBanner) personBanner.style.display = 'flex';
        updateForPerson(account);
      } else {
        if (personSelectGroup) personSelectGroup.style.display = 'block';
        if (personBanner) personBanner.style.display = 'flex';

        U.clearChildren(personSelect);
        personSelect.appendChild(U.createElement('option', { value: '' }, ['-- Choose Person Profile --']));
        
        var recGroup = U.createElement('optgroup', { label: 'Receivables (People Who Owe You)' });
        var payGroup = U.createElement('optgroup', { label: 'Payables (People You Owe)' });

        peopleAccounts.forEach(function (p) {
          var opt = U.createElement('option', { value: String(p.id) }, [p.name]);
          if (p.accountType === 'receivable') recGroup.appendChild(opt);
          else payGroup.appendChild(opt);
        });

        if (recGroup.children.length > 0) personSelect.appendChild(recGroup);
        if (payGroup.children.length > 0) personSelect.appendChild(payGroup);

        personSelect.onchange = function () {
          var pId = parseInt(this.value, 10);
          var found = peopleAccounts.find(function (a) { return a.id === pId; });
          if (found) updateForPerson(found);
        };

        if (peopleAccounts.length > 0) {
          personSelect.value = String(peopleAccounts[0].id);
          updateForPerson(peopleAccounts[0]);
        }
      }

      document.querySelectorAll('#person-txn-form .form-group').forEach(function (g) { g.classList.remove('has-error'); });
      Modal.open('modal-person-txn');
    });
  };

  AccountsController.prototype.savePersonTransaction = function () {
    var self = this;
    var personIdInput = document.getElementById('ptxn-person-id');
    var actionSelect = document.getElementById('ptxn-action');
    var bankSelect = document.getElementById('ptxn-bank-account');
    var amountInput = document.getElementById('ptxn-amount');
    var dateInput = document.getElementById('ptxn-date');
    var descInput = document.getElementById('ptxn-description');

    var personId = parseInt(personIdInput.value, 10);
    var action = actionSelect.value;
    var bankId = parseInt(bankSelect.value, 10);
    var amountStr = amountInput.value.trim();
    var date = dateInput.value;
    var userDesc = descInput.value.trim();

    var valid = true;
    if (!personId) { Toast.warning('Please select a valid person.'); valid = false; }
    if (!bankId) { bankSelect.closest('.form-group').classList.add('has-error'); valid = false; }
    else { bankSelect.closest('.form-group').classList.remove('has-error'); }

    if (!U.validateAmount(amountStr)) { amountInput.closest('.form-group').classList.add('has-error'); valid = false; }
    else { amountInput.closest('.form-group').classList.remove('has-error'); }

    if (!U.validateDate(date)) { dateInput.closest('.form-group').classList.add('has-error'); valid = false; }
    else { dateInput.closest('.form-group').classList.remove('has-error'); }

    if (!valid) { Toast.warning('Please fix the highlighted fields.'); return; }

    var amount = parseFloat(amountStr);

    Promise.all([
      DB.getById(personId),
      DB.getById(bankId)
    ]).then(function (results) {
      var person = results[0];
      var bank = results[1];
      if (!person || !bank) {
        Toast.error('Account not found.');
        return;
      }

      var personType, bankType;
      var personDesc, bankDesc;

      if (action === 'rec_payment') {
        personType = 'debit';
        bankType = 'credit';
        personDesc = 'Payment received: ' + (userDesc || 'Cash / Transfer');
        bankDesc = 'Received from ' + person.name + ': ' + (userDesc || 'Payment received');
      } else if (action === 'rec_give') {
        personType = 'credit';
        bankType = 'debit';
        personDesc = 'Amount received / loan: ' + (userDesc || 'Cash / Transfer');
        bankDesc = 'Loan / money given to ' + person.name + ': ' + (userDesc || 'Given to person');
      } else if (action === 'pay_payment') {
        personType = 'debit';
        bankType = 'debit';
        personDesc = 'Payment made to person: ' + (userDesc || 'Cash / Transfer');
        bankDesc = 'Payment to ' + person.name + ': ' + (userDesc || 'Debt settlement');
      } else if (action === 'pay_borrow') {
        personType = 'credit';
        bankType = 'credit';
        personDesc = 'Amount borrowed: ' + (userDesc || 'Cash / Transfer');
        bankDesc = 'Borrowed from ' + person.name + ': ' + (userDesc || 'Loan received');
      }

      var TDB = BK.TransactionsDB;
      var txn1 = {
        date: date,
        accountId: bankId,
        type: bankType,
        amount: amount,
        description: U.sanitize(bankDesc),
        categoryId: null,
        isTransfer: true,
        isVerified: true
      };

      return TDB.add(txn1).then(function (id1) {
        var txn2 = {
          date: date,
          accountId: personId,
          type: personType,
          amount: amount,
          description: U.sanitize(personDesc),
          categoryId: null,
          isTransfer: true,
          relatedId: id1,
          isVerified: true
        };
        return TDB.add(txn2).then(function (id2) {
          return TDB.update(id1, Object.assign({}, txn1, { relatedId: id2 }));
        });
      });
    }).then(function () {
      Toast.success('Transaction recorded successfully.');
      Modal.close('modal-person-txn');
      self.render();
      window.dispatchEvent(new CustomEvent('transactions-updated'));
      window.dispatchEvent(new CustomEvent('accounts-updated'));
    }).catch(function (err) {
      Toast.error('Failed to save transaction: ' + err.message);
    });
  };

  AccountsController.prototype.viewPersonLedger = function (account) {
    if (this.app && this.app.navigation && this.app.transactionsCtrl) {
      this.app.navigation.navigateTo('transactions');
      this.app.transactionsCtrl.applyFilter({ accountId: String(account.id) });
    }
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
