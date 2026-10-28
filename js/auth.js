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

    if (!config.password) {
      // First run or reset: Setup
      this.authTitle.textContent = 'Welcome to BookKeeper';
      this.authBtn.textContent = 'Set Password & Enter';
    } else {
      // Login mode
      this.authTitle.textContent = 'Welcome Back';
      this.authBtn.textContent = 'Login';
    }

    // Form submission
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

    this.initSettingsControls();
  };

  Auth.prototype.getConfig = function () {
    var cfg = localStorage.getItem('bk-auth-config');
    return cfg ? JSON.parse(cfg) : { username: '', password: '' };
  };

  Auth.prototype.handleAuth = function () {
    var user = this.usernameInput.value.trim();
    var pass = this.passwordInput.value.trim();
    var config = this.getConfig();

    // If both empty, allow instant entry
    if (!user && !pass) {
      this.skipLogin();
      return;
    }

    if (!config.password) {
      // Setting up initial password
      if (!pass) {
        Toast.warning('Please enter a password or click "Enter Without Password".');
        return;
      }
      localStorage.setItem('bk-auth-config', JSON.stringify({ username: user || 'admin', password: pass }));
      localStorage.removeItem('bk-auth-disabled');
      this.checkRememberMe();
      Toast.success('Password set! Welcome to your workspace.');
      this.success();
    } else {
      // Verifying login - case-insensitive on username
      var userMatches = !config.username || (user.toLowerCase() === config.username.toLowerCase());
      var passMatches = pass === config.password;

      if (userMatches && passMatches) {
        this.checkRememberMe();
        Toast.success('Login successful. Welcome back!');
        this.success();
      } else {
        Toast.error('Incorrect credentials. Click "Enter Without Password" or "Forgot Password" to access your data.');
        this.passwordInput.value = '';
        this.passwordInput.focus();
      }
    }
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
    this.overlay.classList.add('hidden');
    Toast.success('Welcome! Entered workspace without password.');
  };

  Auth.prototype.resetLock = function () {
    var confirmed = confirm('Reset your login password? All your accounts, transactions, and settings remain 100% safe in your browser.');
    if (!confirmed) return;

    localStorage.removeItem('bk-auth-config');
    localStorage.removeItem('bk-remember-login');
    localStorage.setItem('bk-auth-disabled', 'true');
    sessionStorage.setItem('bk-authenticated', 'true');
    this.overlay.classList.add('hidden');
    Toast.success('Password lock removed. Direct access enabled.');
  };

  Auth.prototype.success = function () {
    sessionStorage.setItem('bk-authenticated', 'true');
    this.overlay.classList.add('hidden');
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
    if (BK.Toast) BK.Toast.success('Direct access enabled. Password lock disabled.');
  };

  BK.Auth = Auth;
})();
