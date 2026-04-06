"use strict";

/**
 * UI Framework Module
 * Toast notifications, navigation, theme, modals, keyboard shortcuts.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;

  // ─── Toast Notifications ───
  var Toast = {
    container: null,
    init: function () {
      this.container = document.getElementById('toast-container');
    },
    show: function (message, type, duration) {
      if (!this.container) this.init();
      type = type || 'info';
      duration = duration || 4000;
      var iconMap = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
      var self = this;
      var toast = U.createElement('div', { className: 'toast ' + type }, [
        U.createElement('i', { className: 'fas ' + (iconMap[type] || iconMap.info) }),
        U.createElement('span', { className: 'toast-msg' }, [message]),
        U.createElement('button', { className: 'toast-close', onClick: function () { self.dismiss(toast); } }, [
          U.createElement('i', { className: 'fas fa-times' })
        ])
      ]);
      this.container.appendChild(toast);
      setTimeout(function () { self.dismiss(toast); }, duration);
    },
    dismiss: function (toast) {
      if (!toast || !toast.parentNode) return;
      toast.classList.add('removing');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    },
    success: function (msg) { this.show(msg, 'success'); },
    error: function (msg) { this.show(msg, 'error', 6000); },
    warning: function (msg) { this.show(msg, 'warning', 5000); },
    info: function (msg) { this.show(msg, 'info'); }
  };

  // ─── Navigation ───
  function Navigation(onNavigate) {
    this.currentPage = 'dashboard';
    this.onNavigate = onNavigate;
    this.navItems = document.querySelectorAll('.nav-item[data-page]');
    this.pages = document.querySelectorAll('.page');
    this.toolbarTitle = document.getElementById('toolbar-title');
    var self = this;
    this.navItems.forEach(function (item) {
      item.addEventListener('click', function () { self.navigateTo(item.dataset.page); });
    });
  }
  Navigation.prototype.navigateTo = function (pageName) {
    this.navItems.forEach(function (item) {
      item.classList.toggle('active', item.dataset.page === pageName);
    });
    this.pages.forEach(function (page) {
      page.classList.remove('active');
      // Trigger animation restart
      page.style.animation = 'none';
      page.offsetHeight; /* trigger reflow */
      page.style.animation = '';
      
      if (page.id === 'page-' + pageName) {
        page.classList.add('active');
      }
    });
    var titles = { dashboard: 'Dashboard', accounts: 'Accounts', categories: 'Categories', transactions: 'Transactions', statements: 'Statements', settings: 'Settings & Backup' };
    if (this.toolbarTitle) this.toolbarTitle.textContent = titles[pageName] || pageName;
    this.currentPage = pageName;
    if (this.onNavigate) this.onNavigate(pageName);
  };
  Navigation.prototype.getCurrentPage = function () { return this.currentPage; };

  // ─── Theme Manager ───
  function ThemeManager() {
    this.theme = localStorage.getItem('bk-theme') || 'dark';
    this.accent = localStorage.getItem('bk-accent') || 'indigo';
    this.applyTheme();
    var self = this;
    var btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.addEventListener('click', function () { self.toggle(); });
    
    // Accent listeners
    document.querySelectorAll('.accent-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self.setAccent(btn.dataset.accent);
      });
    });
  }
  ThemeManager.prototype.applyTheme = function () {
    document.documentElement.setAttribute('data-theme', this.theme);
    document.documentElement.setAttribute('data-accent', this.accent);
    var icon = document.getElementById('theme-icon');
    if (icon) icon.className = this.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  };
  ThemeManager.prototype.toggle = function () {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('bk-theme', this.theme);
    this.applyTheme();
  };
  ThemeManager.prototype.setAccent = function (accent) {
    this.accent = accent;
    localStorage.setItem('bk-accent', accent);
    this.applyTheme();
  };

  // ─── Modal Manager ───
  var ModalManager = {
    open: function (modalId) {
      var overlay = document.getElementById(modalId);
      if (overlay) {
        overlay.classList.add('active');
        setTimeout(function () {
          var input = overlay.querySelector('input:not([type=hidden]):not([type=file]), select, textarea');
          if (input) input.focus();
        }, 100);
      }
    },
    close: function (modalId) {
      var overlay = document.getElementById(modalId);
      if (overlay) overlay.classList.remove('active');
    },
    confirm: function (title, message, type) {
      type = type || 'danger';
      return new Promise(function (resolve) {
        var overlay = document.getElementById('modal-confirm');
        var iconEl = overlay.querySelector('.confirm-content i');
        var titleEl = overlay.querySelector('.confirm-content h4');
        var msgEl = overlay.querySelector('.confirm-content p');
        var confirmBtn = document.getElementById('btn-confirm-yes');
        var cancelBtn = document.getElementById('btn-confirm-no');
        var content = overlay.querySelector('.confirm-content');

        content.className = 'confirm-content ' + type;
        iconEl.className = type === 'danger' ? 'fas fa-exclamation-triangle' : 'fas fa-question-circle';
        titleEl.textContent = title;
        msgEl.textContent = message;

        function cleanup(result) {
          ModalManager.close('modal-confirm');
          confirmBtn.removeEventListener('click', onConfirm);
          cancelBtn.removeEventListener('click', onCancel);
          resolve(result);
        }
        function onConfirm() { cleanup(true); }
        function onCancel() { cleanup(false); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        ModalManager.open('modal-confirm');
      });
    },
    initCloseButtons: function () {
      document.querySelectorAll('.modal-close').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var overlay = btn.closest('.modal-overlay');
          if (overlay) overlay.classList.remove('active');
        });
      });
      document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) overlay.classList.remove('active');
        });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal-overlay.active').forEach(function (o) { o.classList.remove('active'); });
        }
      });
    }
  };

  // ─── Keyboard Shortcuts ───
  function KeyboardShortcuts(navigation) {
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      if (e.altKey) {
        switch (e.key) {
          case '1': e.preventDefault(); navigation.navigateTo('dashboard'); break;
          case '2': e.preventDefault(); navigation.navigateTo('accounts'); break;
          case '3': e.preventDefault(); navigation.navigateTo('categories'); break;
          case '4': e.preventDefault(); navigation.navigateTo('transactions'); break;
          case '5': e.preventDefault(); navigation.navigateTo('statements'); break;
          case '6': e.preventDefault(); navigation.navigateTo('settings'); break;
        }
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        BK.ModalManager.open('modal-command-palette');
      }
      if (e.ctrlKey && e.key === 'f') {
        var si = document.getElementById('global-search');
        if (si) { e.preventDefault(); si.focus(); }
      }
    });
  }

  BK.Toast = Toast;
  BK.Navigation = Navigation;
  BK.ThemeManager = ThemeManager;
  BK.ModalManager = ModalManager;
  BK.KeyboardShortcuts = KeyboardShortcuts;
})();
