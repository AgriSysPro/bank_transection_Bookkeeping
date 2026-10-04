"use strict";

/**
 * Automation Module
 * Handles CSV Import, Recurring Transactions, and OCR.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Toast = BK.Toast;
  var Modal = BK.ModalManager;
  var TDB = BK.TransactionsDB;
  var ADB = BK.AccountsDB;

  function Automation(app) {
    this.app = app;
    this.csvData = null;
    this.csvHeaders = [];
  }

  Automation.prototype.init = function () {
    var self = this;
    
    // CSV Import
    var importCsvBtn = document.getElementById('btn-import-csv');
    if (importCsvBtn) importCsvBtn.addEventListener('click', function () { self.showCsvModal(); });

    var csvFileInput = document.getElementById('csv-file-input');
    if (csvFileInput) csvFileInput.addEventListener('change', function (e) { self.handleCsvUpload(e); });

    var importNowBtn = document.getElementById('btn-csv-import-now');
    if (importNowBtn) importNowBtn.addEventListener('click', function () { self.importCsv(); });

    // Recurring check (could be called on app start)
    this.checkRecurring();
  };

  // ─── CSV Import ───
  Automation.prototype.showCsvModal = function () {
    var accountSelect = document.getElementById('csv-target-account');
    this.app.accountsCtrl.renderAccountOptions(accountSelect);
    
    document.getElementById('csv-upload-step').classList.remove('hidden');
    document.getElementById('csv-mapping-step').classList.add('hidden');
    document.getElementById('btn-csv-import-now').classList.add('hidden');
    document.getElementById('csv-file-input').value = '';
    
    Modal.open('modal-import-csv');
  };

  Automation.prototype.handleCsvUpload = function (e) {
    var self = this;
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (event) {
      var text = event.target.result;
      self.processCsvText(text);
    };
    reader.readAsText(file);
  };

  Automation.prototype.processCsvText = function (text) {
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
    if (lines.length < 2) {
      Toast.error('CSV file is empty or invalid.');
      return;
    }

    this.csvHeaders = lines[0].split(',').map(function(h) { return h.trim().replace(/"/g, ''); });
    this.csvData = lines.slice(1).map(function(line) {
      return line.split(',').map(function(val) { return val.trim().replace(/"/g, ''); });
    });

    this.showMappingStep();
  };

  Automation.prototype.showMappingStep = function () {
    var self = this;
    document.getElementById('csv-upload-step').classList.add('hidden');
    document.getElementById('csv-mapping-step').classList.remove('hidden');
    document.getElementById('btn-csv-import-now').classList.remove('hidden');

    var selects = document.querySelectorAll('.csv-col-select');
    selects.forEach(function (sel) {
      U.clearChildren(sel);
      sel.appendChild(U.createElement('option', { value: '' }, ['-- Select Column --']));
      self.csvHeaders.forEach(function (h, i) {
        sel.appendChild(U.createElement('option', { value: i }, [h]));
      });
      
      // Auto-map based on name
      var field = sel.dataset.field;
      var foundIdx = self.csvHeaders.findIndex(function(h) { 
        var hl = h.toLowerCase();
        return hl.includes(field) || hl.includes('narration') && field === 'description';
      });
      if (foundIdx !== -1) sel.value = foundIdx;
    });

    this.renderCsvPreview();
  };

  Automation.prototype.renderCsvPreview = function () {
    var container = document.getElementById('csv-preview-container');
    U.clearChildren(container);
    
    var table = U.createElement('table', { className: 'table-sm' }, [
      U.createElement('thead', {}, [
        U.createElement('tr', {}, this.csvHeaders.slice(0, 5).map(function(h) { return U.createElement('th', {}, [h]); }))
      ]),
      U.createElement('tbody', {}, this.csvData.slice(0, 5).map(function(row) {
        return U.createElement('tr', {}, row.slice(0, 5).map(function(cell) { return U.createElement('td', {}, [cell]); }));
      }))
    ]);
    container.appendChild(table);
  };

  Automation.prototype.importCsv = function () {
    var self = this;
    var accountId = parseInt(document.getElementById('csv-target-account').value);
    if (!accountId) { Toast.warning('Please select a target account.'); return; }

    var mappings = {};
    document.querySelectorAll('.csv-col-select').forEach(function (sel) {
      if (sel.value !== '') mappings[sel.dataset.field] = parseInt(sel.value);
    });

    if (mappings.date === undefined || mappings.amount === undefined) {
      Toast.warning('Date and Amount mapping is mandatory.');
      return;
    }

    var skipped = 0;

    var importPromises = this.csvData.map(function (row) {
      var rawAmount = (row[mappings.amount] || '').replace(/[^0-9.-]/g, '');
      var signedAmount = parseFloat(rawAmount);
      var description = mappings.description !== undefined ? row[mappings.description] : 'CSV Import';

      // Dates must land as zero-padded YYYY-MM-DD: the statement range filters
      // compare them as strings, and unpadded values silently fall outside.
      var date = U.normaliseDate(row[mappings.date]);
      if (isNaN(signedAmount) || !date) { skipped++; return Promise.resolve(); }

      var type;
      if (mappings.type !== undefined) {
        var t = (row[mappings.type] || '').toLowerCase();
        type = (t.indexOf('cr') !== -1 || t.indexOf('credit') !== -1 || t.indexOf('in') !== -1) ? 'credit' : 'debit';
      } else {
        type = signedAmount > 0 ? 'credit' : 'debit';
      }

      return TDB.add({
        date: date,
        accountId: accountId,
        // Stored unsigned: direction lives in the type, so keeping a negative
        // sign here would make a credit subtract from the balance.
        type: type,
        amount: Math.abs(signedAmount),
        description: U.sanitize(description)
      });
    });

    Promise.all(importPromises).then(function () {
      var imported = self.csvData.length - skipped;
      Toast.success('Imported ' + imported + ' transaction' + (imported === 1 ? '' : 's') + '.'
        + (skipped > 0 ? ' Skipped ' + skipped + ' row' + (skipped === 1 ? '' : 's') + ' with an unreadable date or amount.' : ''));
      Modal.close('modal-import-csv');
      self.app.refreshAll();
    }).catch(function (err) {
      Toast.error('Import failed: ' + err.message);
    });
  };

  // ─── OCR ───
  Automation.prototype.performOCR = function (file) {
    if (!window.Tesseract) { Toast.error('OCR Library not loaded.'); return; }
    Toast.info('Starting OCR processing...');
    
    return Tesseract.recognize(file, 'eng', { logger: function(m) { console.log(m); } })
      .then(function(result) {
        var text = result.data.text;
        // Basic extraction logic
        var amountMatch = text.match(/Total[:\s]*([\d,]+\.?\d*)/i) || text.match(/Amount[:\s]*([\d,]+\.?\d*)/i);
        var dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        
        return {
          amount: amountMatch ? amountMatch[1].replace(/,/g, '') : null,
          date: dateMatch ? dateMatch[1] : null,
          text: text
        };
      });
  };

  // ─── Recurring ───
  Automation.prototype.checkRecurring = function () {
    // Placeholder for Version 2: Scan for templates and auto-add
    console.log('Automation: Checking for recurring transactions...');
  };

  BK.Automation = Automation;
})();
