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

    var importPromises = this.csvData.map(function (row) {
      var dateStr = row[mappings.date];
      var amountStr = row[mappings.amount].replace(/[^0-9.-]/g, '');
      var amount = parseFloat(amountStr);
      var description = mappings.description !== undefined ? row[mappings.description] : 'CSV Import';
      var type = 'debit';
      
      if (mappings.type !== undefined) {
        var t = row[mappings.type].toLowerCase();
        if (t.includes('cr') || t.includes('credit') || t.includes('in')) type = 'credit';
      } else {
        if (amount > 0) type = 'credit';
        else { type = 'debit'; amount = Math.abs(amount); }
      }

      if (!isNaN(amount) && dateStr) {
        // Try to normalize date (Basic)
        var dParts = dateStr.split(/[-/]/);
        if (dParts.length === 3) {
          // Detect YYYY-MM-DD or DD-MM-YYYY
          if (dParts[0].length === 4) dateStr = dParts.join('-');
          else dateStr = dParts[2] + '-' + dParts[1] + '-' + dParts[0];
        }

        return TDB.add({
          date: dateStr,
          accountId: accountId,
          type: type,
          amount: amount,
          description: description
        });
      }
      return Promise.resolve();
    });

    Promise.all(importPromises).then(function () {
      Toast.success('Imported ' + self.csvData.length + ' transactions.');
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
