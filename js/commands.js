"use strict";

/**
 * Command Palette Module
 * Handles searching and executing commands/actions.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Modal = BK.ModalManager;

  function CommandPalette(app) {
    this.app = app;
    this.input = document.getElementById('command-search');
    this.resultsContainer = document.getElementById('command-results');
    this.selectedIndex = 0;
    this.commands = [
      { id: 'new-txn', title: 'New Transaction', icon: 'fa-plus', action: function() { app.transactionsCtrl.showForm(); } },
      { id: 'new-acc', title: 'New Account', icon: 'fa-university', action: function() { app.accountsCtrl.showForm(); } },
      { id: 'new-cat', title: 'New Category', icon: 'fa-tag', action: function() { app.categoriesCtrl.showForm(); } },
      { id: 'go-dash', title: 'Go to Dashboard', icon: 'fa-th-large', action: function() { app.navigation.navigateTo('dashboard'); } },
      { id: 'go-acc', title: 'Go to Accounts', icon: 'fa-university', action: function() { app.navigation.navigateTo('accounts'); } },
      { id: 'go-txn', title: 'Go to Transactions', icon: 'fa-exchange-alt', action: function() { app.navigation.navigateTo('transactions'); } },
      { id: 'go-cat', title: 'Go to Categories', icon: 'fa-tags', action: function() { app.navigation.navigateTo('categories'); } },
      { id: 'go-stmt', title: 'Go to Statements', icon: 'fa-file-invoice-dollar', action: function() { app.navigation.navigateTo('statements'); } },
      { id: 'toggle-theme', title: 'Toggle Light/Dark Theme', icon: 'fa-adjust', action: function() { app.themeManager.toggle(); } },
      { id: 'export-json', title: 'Export Backup (JSON)', icon: 'fa-download', action: function() { document.getElementById('btn-export-data').click(); } }
    ];
  }

  CommandPalette.prototype.init = function () {
    var self = this;
    if (!this.input) return;

    this.input.addEventListener('input', function () { self.renderResults(); });
    this.input.addEventListener('keydown', function (e) { self.handleKeyDown(e); });

    // Focus on open
    window.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'k') {
        setTimeout(function() { self.input.focus(); }, 150);
      }
    });

    this.renderResults();
  };

  CommandPalette.prototype.renderResults = function () {
    var self = this;
    var query = this.input.value.toLowerCase().trim();
    U.clearChildren(this.resultsContainer);

    var filtered = this.commands.filter(function (cmd) {
      return cmd.title.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      this.resultsContainer.appendChild(U.createElement('div', { className: 'command-palette-empty' }, ['No commands found.']));
      return;
    }

    filtered.forEach(function (cmd, index) {
      var item = U.createElement('div', { 
        className: 'command-item ' + (index === self.selectedIndex ? 'selected' : ''),
        onClick: function() { self.executeCommand(cmd); }
      }, [
        U.createElement('i', { className: 'fas ' + cmd.icon }),
        U.createElement('span', { className: 'command-title' }, [cmd.title])
      ]);
      self.resultsContainer.appendChild(item);
    });
  };

  CommandPalette.prototype.handleKeyDown = function (e) {
    var items = this.resultsContainer.querySelectorAll('.command-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % items.length;
      this.renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
      this.renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var filtered = this.commands.filter(function (cmd) {
        return cmd.title.toLowerCase().includes(this.input.value.toLowerCase().trim());
      }.bind(this));
      if (filtered[this.selectedIndex]) {
        this.executeCommand(filtered[this.selectedIndex]);
      }
    }
  };

  CommandPalette.prototype.executeCommand = function (cmd) {
    cmd.action();
    Modal.close('modal-command-palette');
    this.input.value = '';
    this.selectedIndex = 0;
  };

  BK.CommandPalette = CommandPalette;
})();
