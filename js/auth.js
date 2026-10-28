"use strict";

/**
 * Authentication Module
 * Handles login, session, guest access, and password management.
 */

var BK = window.BK || {};

(function () {
  var Toast = BK.Toast;

  function Auth() {
    this.overlay = document.getElementById('auth-overlay');
    this.loginForm = document.getElementById('auth-form');
    this.usernameInput = document.getElementById('auth-username');
    this.passwordInput = document.getElementById('auth-password');
    this.authTitle = document.getElementById('auth-title');
    this.authBtn = document.getElementById('btn-auth-submit');
  }

  Auth.prototype.init = function () {
    var self = this;
    if (!this.overlay) return;

    // Check live data count in IndexedDB immediately to inform the user
    this.checkDataStatus();

    // 1. Direct Access: Check if password protection is disabled
    if (localStorage.getItem('bk-auth-disabled') === 'true') {
      this.overlay.classList.add('hidden');
      this.initSettingsControls();
      return;
    }

    // 2. Check if persistent session or session storage is active
    if (localStorage.getItem('bk-remember-login') === 'true' || sessionStorage.getItem('bk-authenticated') === 'true') {
      this.overlay.classList.add('hidden');
      this.initSettingsControls();
      return;
    }

    var config = this.getConfig();
    
    // Autofill username if previously configured
    if (config.username) this.usernameInput.value = config.username;

    // Login form submission: Always accept credentials and unlock
    this.loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      self.handleAuth();
    });

    // 1-Click Skip / Direct Access without password
    var skipBtn = document.getElementById('btn-auth-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        self.skipLogin();
      });
    }

    // Forgot Password & Reset Buttons
    var forgotBtn = document.getElementById('btn-auth-forgot');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', function () {
        self.resetLock();
      });
    }

    var resetBtn = document.getElementById('btn-auth-reset-all');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        self.resetLock();
      });
    }

    // Backup restore directly from login screen
    var importBackupBtn = document.getElementById('btn-auth-import-backup');
    var importBackupFile = document.getElementById('auth-import-backup-file');
    if (importBackupBtn && importBackupFile) {
      importBackupBtn.addEventListener('click', function () {
        importBackupFile.click();
      });
      importBackupFile.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (event) {
          try {
            var backup = JSON.parse(event.target.result);
            BK.restoreAllData(backup).then(function () {
              Toast.success('Backup restored successfully! All data loaded.');
              self.skipLogin();
            });
          } catch (err) {
            Toast.error('Failed to read backup file: ' + err.message);
          } finally {
            importBackupFile.value = '';
          }
        };
        reader.readAsText(file);
      });
    }

    this.initSettingsControls();
  };

  Auth.prototype.checkDataStatus = function () {
    if (!BK.db || !BK.db.accounts || !BK.db.transactions) return;

    Promise.all([
      BK.db.accounts.count(),
      BK.db.transactions.count()
    ]).then(function (results) {
      var accCount = results[0];
      var txnCount = results[1];
      var statusEl = document.getElementById('auth-data-status');
      if (!statusEl) return;

      if (txnCount > 0 || accCount > 0) {
        statusEl.innerHTML = '<div style="background:rgba(34,197,94,0.12); border:1px solid #22c55e; color:#4ade80; border-radius:6px; padding:8px 12px; font-size:12px; text-align:left;">' +
          '<i class="fas fa-check-circle" style="margin-right:6px;"></i> <strong>Data Vault Detected:</strong> ' + accCount + ' Accounts and ' + txnCount + ' Transactions are ready in this browser.' +
        '</div>';
      } else {
        statusEl.innerHTML = '<div style="background:rgba(59,130,246,0.12); border:1px solid #3b82f6; color:#93c5fd; border-radius:6px; padding:8px 12px; font-size:11.5px; text-align:left; line-height:1.4;">' +
          '<i class="fas fa-info-circle" style="margin-right:6px;"></i> <strong>Storage Note:</strong> Data is saved locally in your browser. If you previously worked in Chrome, Edge, or via a local server URL (e.g. <code>localhost:5500</code>), open that same URL to view previous records, or click <em>"Restore Backup"</em> below.' +
        '</div>';
      }
    }).catch(function (e) {
      console.warn('Could not check database count:', e);
    });
  };

  Auth.prototype.getConfig = function () {
    var cfg = localStorage.getItem('bk-auth-config');
    return cfg ? JSON.parse(cfg) : { username: '', password: '' };
  };

  Auth.prototype.handleAuth = function () {
    var user = this.usernameInput.value.trim() || 'User';
    var pass = this.passwordInput.value.trim();

    // Save whichever credentials the user typed so they can use it
    localStorage.setItem('bk-auth-config', JSON.stringify({ username: user, password: pass }));
    localStorage.removeItem('bk-auth-disabled');
    this.checkRememberMe();

    Toast.success('Welcome back, ' + user + '! Loading your records...');
    this.success();
  };

  Auth.prototype.checkRememberMe = function () {
    var rememberMe = document.getElementById('auth-remember-me');
    if (rememberMe && rememberMe.checked) {
      localStorage.setItem('bk-remember-login', 'true');
    }
  };

  Auth.prototype.skipLogin = function () {
    sessionStorage.setItem('bk-authenticated', 'true');
    this.checkRememberMe();
    this.success();
    Toast.success('Welcome! Entered workspace.');
  };

  Auth.prototype.resetLock = function () {
    var confirmed = confirm('Reset login credentials? Your financial data, transactions, and accounts will NOT be deleted.');
    if (!confirmed) return;

    localStorage.removeItem('bk-auth-config');
    localStorage.removeItem('bk-remember-login');
    localStorage.setItem('bk-auth-disabled', 'true');
    sessionStorage.setItem('bk-authenticated', 'true');
    this.success();
    Toast.success('Password lock removed. Direct access enabled.');
  };

  Auth.prototype.success = function () {
    sessionStorage.setItem('bk-authenticated', 'true');
    if (this.overlay) this.overlay.classList.add('hidden');

    // Instantly refresh all views so all accounts & transactions list immediately
    if (BK.app) {
      BK.app.refreshAll();
      if (BK.app.transactionsCtrl) BK.app.transactionsCtrl.render();
      if (BK.app.accountsCtrl) BK.app.accountsCtrl.render();
      if (BK.app.statementsCtrl && BK.app.statementsCtrl.populateAccountDropdown) {
        BK.app.statementsCtrl.populateAccountDropdown();
      }
    }
  };

  Auth.prototype.logout = function () {
    sessionStorage.removeItem('bk-authenticated');
    localStorage.removeItem('bk-remember-login');
    localStorage.removeItem('bk-auth-disabled');
    window.location.reload();
  };

  Auth.prototype.initSettingsControls = function () {
    var self = this;
    var disableBtn = document.getElementById('btn-disable-auth-lock');
    if (disableBtn) {
      disableBtn.addEventListener('click', function () {
        if (confirm('Disable password lock? BookKeeper will open instantly without asking for a password.')) {
          localStorage.removeItem('bk-auth-config');
          localStorage.setItem('bk-auth-disabled', 'true');
          localStorage.setItem('bk-remember-login', 'true');
          Toast.success('Password lock disabled. App opens directly.');
        }
      });
    }

    var toggleBtn = document.getElementById('btn-toggle-auth-lock');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var newPass = prompt('Enter a new password for BookKeeper (leave blank to remove password):');
        if (newPass === null) return;
        if (newPass.trim() === '') {
          localStorage.removeItem('bk-auth-config');
          localStorage.setItem('bk-auth-disabled', 'true');
          Toast.success('Password removed. Direct access enabled.');
        } else {
          var newUsername = prompt('Enter a username:', 'admin') || 'admin';
          localStorage.setItem('bk-auth-config', JSON.stringify({ username: newUsername.trim(), password: newPass.trim() }));
          localStorage.removeItem('bk-auth-disabled');
          localStorage.setItem('bk-remember-login', 'true');
          Toast.success('New password saved successfully.');
        }
      });
    }
  };

  // Global emergency unlock helper
  BK.unlockApp = function () {
    localStorage.removeItem('bk-auth-config');
    localStorage.setItem('bk-auth-disabled', 'true');
    localStorage.setItem('bk-remember-login', 'true');
    sessionStorage.setItem('bk-authenticated', 'true');
    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (BK.app) {
      BK.app.refreshAll();
      if (BK.app.transactionsCtrl) BK.app.transactionsCtrl.render();
      if (BK.app.accountsCtrl) BK.app.accountsCtrl.render();
    }
    if (BK.Toast) BK.Toast.success('Direct access enabled. Loading records...');
  };

  BK.Auth = Auth;
})();
