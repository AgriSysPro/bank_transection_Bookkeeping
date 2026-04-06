"use strict";

/**
 * Authentication Module
 * Handles login, session, and password management.
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

    var config = this.getConfig();
    
    // Autofill username
    if (config.username) this.usernameInput.value = config.username;

    if (!config.password) {
      // First run: Setup
      this.authTitle.textContent = 'Setup BookKeeper';
      this.authBtn.textContent = 'Create Account';
    } else {
      // Login mode
      this.authTitle.textContent = 'Welcome Back';
      this.authBtn.textContent = 'Login';
    }

    this.loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      self.handleAuth();
    });

    // Check if session is already active (could use sessionStorage)
    if (sessionStorage.getItem('bk-authenticated') === 'true') {
      this.overlay.classList.add('hidden');
    }
  };

  Auth.prototype.getConfig = function () {
    var cfg = localStorage.getItem('bk-auth-config');
    return cfg ? JSON.parse(cfg) : { username: '', password: '' };
  };

  Auth.prototype.handleAuth = function () {
    var user = this.usernameInput.value.trim();
    var pass = this.passwordInput.value.trim();
    var config = this.getConfig();

    if (!user || !pass) {
      Toast.warning('Username and password are required.');
      return;
    }

    if (!config.password) {
      // Setup
      localStorage.setItem('bk-auth-config', JSON.stringify({ username: user, password: pass }));
      Toast.success('Account created successfully!');
      this.success();
    } else {
      // Login
      if (user === config.username && pass === config.password) {
        Toast.success('Login successful.');
        this.success();
      } else {
        Toast.error('Invalid username or password.');
        this.passwordInput.value = '';
        this.passwordInput.focus();
      }
    }
  };

  Auth.prototype.success = function () {
    sessionStorage.setItem('bk-authenticated', 'true');
    this.overlay.classList.add('hidden');
  };

  Auth.prototype.logout = function () {
    sessionStorage.removeItem('bk-authenticated');
    window.location.reload();
  };

  BK.Auth = Auth;
})();
