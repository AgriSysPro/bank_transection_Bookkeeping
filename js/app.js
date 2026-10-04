"use strict";

/**
 * Main Application Entry Point
 * Initializes all modules and coordinates the application lifecycle.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Toast = BK.Toast;
  var Modal = BK.ModalManager;

  function App() {
    this.accountsCtrl = new BK.AccountsController();
    this.categoriesCtrl = new BK.CategoriesController();
    this.transactionsCtrl = new BK.TransactionsController(this.accountsCtrl, this);
    this.statementsCtrl = new BK.StatementsController(this.accountsCtrl, this);
    this.automation = new BK.Automation(this);
    this.navigation = null;
    this.themeManager = null;
  }

  App.prototype.init = function () {
    var self = this;
    try {
      this.auth = new BK.Auth();
      this.auth.init();

      Toast.init();
      Modal.initCloseButtons();
      this.themeManager = new BK.ThemeManager();

      this.navigation = new BK.Navigation(function (page) { self.onPageChange(page); });
      new BK.KeyboardShortcuts(this.navigation);

      this.accountsCtrl.init();
      this.categoriesCtrl.init();
      this.transactionsCtrl.init();
      this.statementsCtrl.init();
      this.automation.init();

      this.initBackupRestore();
      this.initSidebarToggle();
      this.initQuickActions();
      this.initDrillDown();
      this.initDatePresets();

      window.addEventListener('accounts-updated', function () { self.refreshAll(); });
      window.addEventListener('transactions-updated', function () { self.renderDashboard(); });

      this.renderDashboard();
      this.updateNavBadges();
      this.startClock();
      if (BK.Charts) BK.Charts.init();
      if (BK.CommandPalette) new BK.CommandPalette(this).init();
      this.initBusinessDetails();
      console.log('Bank Bookkeeping App initialized successfully.');
    } catch (err) {
      console.error('App initialization failed:', err);
      Toast.error('App failed to initialize. Please refresh.');
    }
  };

  App.prototype.onPageChange = function (page) {
    switch (page) {
      case 'dashboard': this.renderDashboard(); break;
      case 'accounts': 
      case 'payables':
      case 'receivables':
        this.accountsCtrl.render(); 
        break;
      case 'categories': this.categoriesCtrl.render(); break;
      case 'transactions': this.transactionsCtrl.render(); break;
      case 'statements': this.statementsCtrl.render(); break;
    }
  };

  App.prototype.renderDashboard = function () {
    var self = this;
    return Promise.all([
      BK.AccountsDB.count(), 
      BK.TransactionsDB.getStats(),
      BK.AccountsDB.getAll()
    ]).then(function (results) {
      var accountCount = results[0];
      var stats = results[1];
      var accounts = results[2];

      var balancePromises = accounts.map(function(acc) {
        return BK.calculateAccountBalance(acc.id);
      });

      return Promise.all(balancePromises).then(function(balances) {
        var totalAssets = 0;
        var totalLiabilities = 0;
        var totalReceivables = 0;
        var totalPayables = 0;

        balances.forEach(function(bal, idx) {
          var acc = accounts[idx];
          
          if (acc.accountType === 'receivable') {
            totalReceivables += bal; // Assuming positive balance means they owe us
          } else if (acc.accountType === 'payable') {
            totalPayables += Math.abs(bal); // Assuming negative balance means we owe them
          }

          if (bal >= 0) totalAssets += bal;
          else totalLiabilities += Math.abs(bal);
        });

        var netWorth = totalAssets - totalLiabilities;

        var elNetWorth = document.getElementById('stat-total-net-worth');
        var elAssets = document.getElementById('stat-total-assets');
        var elLiab = document.getElementById('stat-total-liabilities');
        var elRec = document.getElementById('stat-total-receivables');
        var elPay = document.getElementById('stat-total-payables');

        if (elNetWorth) {
          elNetWorth.textContent = U.formatCurrency(netWorth);
          elNetWorth.className = 'stat-value ' + (netWorth >= 0 ? 'text-success' : 'text-danger');
        }
        if (elAssets) elAssets.textContent = U.formatCurrency(totalAssets);
        if (elLiab) elLiab.textContent = U.formatCurrency(totalLiabilities);
        if (elRec) elRec.textContent = U.formatCurrency(totalReceivables);
        if (elPay) elPay.textContent = U.formatCurrency(totalPayables);

        var el1 = document.getElementById('stat-total-accounts');
        var el2 = document.getElementById('stat-total-credits');
        var el3 = document.getElementById('stat-total-debits');
        var el4 = document.getElementById('stat-net-balance');

        if (el1) el1.textContent = accountCount;
        if (el2) el2.textContent = U.formatCurrency(stats.totalCredits);
        if (el3) el3.textContent = U.formatCurrency(stats.totalDebits);
        if (el4) {
          el4.textContent = U.formatCurrency(stats.netBalance);
          el4.className = 'stat-value ' + (stats.netBalance >= 0 ? 'text-success' : 'text-danger');
        }

        // Update credit/debit ratio bar
        var total = stats.totalCredits + stats.totalDebits;
        var creditPct = total > 0 ? Math.round((stats.totalCredits / total) * 100) : 50;
        var debitPct = total > 0 ? 100 - creditPct : 50;
        var ratioCredit = document.getElementById('ratio-bar-credit');
        var ratioDebit = document.getElementById('ratio-bar-debit');
        var ratioLabel = document.getElementById('ratio-label');
        if (ratioCredit) ratioCredit.style.width = creditPct + '%';
        if (ratioDebit) ratioDebit.style.width = debitPct + '%';
        if (ratioLabel) ratioLabel.textContent = creditPct + '% Credits / ' + debitPct + '% Debits';

        // Update nav badges
        self.updateNavBadges();

        return self.renderRecentTransactions();
      });
    });
  };

  App.prototype.renderRecentTransactions = function () {
    var tbody = document.getElementById('recent-txn-tbody');
    if (!tbody) return Promise.resolve();

    return Promise.all([BK.TransactionsDB.getRecent(8), BK.AccountsDB.getAll()]).then(function (results) {
      var recent = results[0];
      var accounts = results[1];
      var accountMap = {};
      accounts.forEach(function (a) { accountMap[a.id] = a.name; });

      U.clearChildren(tbody);

      // Update count label
      var countLabel = document.getElementById('recent-txn-count');
      if (countLabel) countLabel.textContent = recent.length > 0 ? 'Showing latest ' + recent.length : '';

      if (recent.length === 0) {
        tbody.appendChild(U.createElement('tr', {}, [
          U.createElement('td', { colSpan: '5', className: 'table-empty' }, [
            U.createElement('i', { className: 'fas fa-chart-line' }),
            U.createElement('p', {}, ['No transactions yet. Start by adding an account.'])
          ])
        ]));
        return;
      }

      recent.forEach(function (txn) {
        var isCredit = txn.type === 'credit';
        tbody.appendChild(U.createElement('tr', {}, [
          U.createElement('td', {}, [U.formatDate(txn.date)]),
          U.createElement('td', {}, [U.escapeHtml(accountMap[txn.accountId] || 'Unknown')]),
          U.createElement('td', {}, [
            U.createElement('span', { className: 'badge ' + (isCredit ? 'badge-credit' : 'badge-debit') }, [isCredit ? 'Credit' : 'Debit'])
          ]),
          U.createElement('td', { className: isCredit ? 'text-success' : 'text-danger', style: { fontWeight: '600' } }, [
            (isCredit ? '+' : '\u2212') + U.formatCurrency(txn.amount)
          ]),
          U.createElement('td', {}, [U.escapeHtml(txn.description || '\u2014')])
        ]));
      });
    });
  };

  App.prototype.refreshAll = function () {
    var self = this;
    self.renderDashboard();
    self.renderConsolidatedStats();
    var page = self.navigation.getCurrentPage();
    if (page === 'accounts') self.accountsCtrl.render();
    if (page === 'categories') self.categoriesCtrl.render();
    if (page === 'transactions') self.transactionsCtrl.render();
    if (page === 'statements') self.statementsCtrl.render();
    if (BK.Charts) BK.Charts.renderAll();
  };

  App.prototype.renderConsolidatedStats = function () {
    Promise.all([BK.AccountsDB.getAll(), BK.TransactionsDB.getAll()]).then(function (results) {
      var accounts = results[0];
      var transactions = results[1];
      
      var totalOpening = 0;
      accounts.forEach(function (a) { totalOpening += (a.openingBalance || 0); });

      var totalCredits = 0, totalDebits = 0;
      transactions.forEach(function (t) {
        if (t.type === 'credit') totalCredits += t.amount;
        else totalDebits += t.amount;
      });

      var netWorth = totalOpening + totalCredits - totalDebits;
      
      var nwEl = document.getElementById('stat-total-net-worth');
      var asEl = document.getElementById('stat-total-assets');
      var liEl = document.getElementById('stat-total-liabilities');

      if (nwEl) nwEl.textContent = BK.Utils.formatCurrency(netWorth);
      if (asEl) asEl.textContent = BK.Utils.formatCurrency(totalOpening + totalCredits);
      if (liEl) liEl.textContent = BK.Utils.formatCurrency(totalDebits);
    });
  };

  App.prototype.startClock = function () {
    var clockEl = document.getElementById('status-clock');
    if (!clockEl) return;
    function update() {
      clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    update();
    setInterval(update, 1000);
  };

  App.prototype.initBackupRestore = function () {
    var self = this;
    var exportBtn = document.getElementById('btn-export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        BK.backupAllData().then(function (data) {
          var json = JSON.stringify(data, null, 2);
          var filename = 'bank_bookkeeping_backup_' + new Date().toISOString().split('T')[0] + '.json';
          U.downloadFile(json, filename, 'application/json');
          Toast.success('Backup exported successfully.');
        }).catch(function (err) { Toast.error('Export failed: ' + err.message); });
      });
    }

    var importBtn = document.getElementById('btn-import-data');
    var importInput = document.getElementById('import-file-input');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });
      importInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        Modal.confirm('Restore Backup', 'This will replace ALL existing data. Continue?', 'danger')
          .then(function (confirmed) {
            if (!confirmed) { importInput.value = ''; return; }
            return file.text().then(function (text) {
              var data = JSON.parse(text);
              return BK.restoreAllData(data);
            }).then(function () {
              Toast.success('Data restored successfully.');
              self.refreshAll();
            });
          }).catch(function (err) { Toast.error('Restore failed: ' + err.message); })
          .finally(function () { importInput.value = ''; });
      });
    }

    // Export All Accounts to Excel
    var excelAllBtn = document.getElementById('btn-export-all-excel');
    if (excelAllBtn) {
      excelAllBtn.addEventListener('click', function () {
        BK.exportAllAccountsExcel();
      });
    }
  };

  // ─── Sidebar Toggle ───
  App.prototype.initSidebarToggle = function () {
    var sidebar = document.getElementById('sidebar');
    var toggleBtn = document.getElementById('btn-sidebar-toggle');
    var menuBtn = document.getElementById('btn-mobile-menu');
    var collapsed = localStorage.getItem('bk-sidebar-collapsed') === 'true';

    if (collapsed && sidebar) sidebar.classList.add('collapsed');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('bk-sidebar-collapsed', sidebar.classList.contains('collapsed'));
      });
    }
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('bk-sidebar-collapsed', sidebar.classList.contains('collapsed'));
      });
    }
  };

  // ─── Quick Actions (Dashboard) ───
  App.prototype.initQuickActions = function () {
    var self = this;
    var quickAccount = document.getElementById('btn-quick-add-account');
    var quickTxn = document.getElementById('btn-quick-add-txn');

    if (quickAccount) {
      quickAccount.addEventListener('click', function () {
        self.accountsCtrl.showForm();
      });
    }
    if (quickTxn) {
      quickTxn.addEventListener('click', function () {
        self.transactionsCtrl.showForm();
      });
    }
  };

  // ─── Drill-down (Dashboard to Transactions) ───
  App.prototype.initDrillDown = function () {
    var self = this;
    var creditCard = document.querySelector('.stat-card.success');
    var debitCard = document.querySelector('.stat-card.danger');
    var accountCard = document.querySelector('.stat-card.primary');

    if (creditCard) {
      creditCard.style.cursor = 'pointer';
      creditCard.addEventListener('click', function () {
        self.navigation.navigateTo('transactions');
        self.transactionsCtrl.applyFilter({ type: 'credit' });
      });
    }
    if (debitCard) {
      debitCard.style.cursor = 'pointer';
      debitCard.addEventListener('click', function () {
        self.navigation.navigateTo('transactions');
        self.transactionsCtrl.applyFilter({ type: 'debit' });
      });
    }
    if (accountCard) {
      accountCard.style.cursor = 'pointer';
      accountCard.addEventListener('click', function () {
        self.navigation.navigateTo('accounts');
      });
    }
  };

  // ─── Date Presets (Statements) ───
  App.prototype.initDatePresets = function () {
    var presets = document.querySelectorAll('.date-preset');
    presets.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var days = btn.dataset.days;
        var startDate = document.getElementById('stmt-start-date');
        var endDate = document.getElementById('stmt-end-date');
        var today = new Date();

        // Clear active state from all
        presets.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        if (days === 'thismonth') {
          var first = new Date(today.getFullYear(), today.getMonth(), 1);
          startDate.value = first.toISOString().split('T')[0];
          endDate.value = today.toISOString().split('T')[0];
        } else {
          var daysAgo = new Date();
          daysAgo.setDate(daysAgo.getDate() - parseInt(days));
          startDate.value = daysAgo.toISOString().split('T')[0];
          endDate.value = today.toISOString().split('T')[0];
        }
      });
    });
  };

  // ─── Nav Badges ───
  App.prototype.updateNavBadges = function () {
    Promise.all([BK.AccountsDB.count(), BK.TransactionsDB.count()]).then(function (results) {
      var accBadge = document.getElementById('nav-badge-accounts');
      var txnBadge = document.getElementById('nav-badge-transactions');
      if (accBadge) accBadge.textContent = results[0] > 0 ? results[0] : '';
      if (txnBadge) txnBadge.textContent = results[1] > 0 ? results[1] : '';
    });
  };

  // ─── Business Details (Phase 5) ───
  App.prototype.initBusinessDetails = function () {
    var self = this;
    var inputs = document.querySelectorAll('.pref-input');
    var logoInput = document.getElementById('pref-biz-logo-input');
    var preview = document.getElementById('pref-biz-logo-preview');
    var saveBtn = document.getElementById('btn-save-biz-details');

    // Load existing
    BK.db.preferences.toArray().then(function(prefs) {
      prefs.forEach(function(p) {
        var el = document.querySelector('[data-key="' + p.key + '"]');
        if (el) el.value = p.value;
        if (p.key === 'biz_logo' && p.value) {
          preview.innerHTML = '<img src="' + p.value + '" style="max-width:100%; max-height:100%;">';
        }
      });
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var promises = [];
        inputs.forEach(function(i) {
          promises.push(BK.db.preferences.put({ key: i.dataset.key, value: i.value }));
        });
        Promise.all(promises).then(function() {
          BK.Toast.success('Business details saved.');
        });
      });
    }

    if (logoInput) {
      logoInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        BK.Utils.fileToBase64(file).then(function(base64) {
          preview.innerHTML = '<img src="' + base64 + '" style="max-width:100%; max-height:100%;">';
          BK.db.preferences.put({ key: 'biz_logo', value: base64 });
        });
      });
    }
  };

  // ─── Bootstrap ───
  document.addEventListener('DOMContentLoaded', function () {
    BK.app = new App();
    BK.app.init();
  });
})();
