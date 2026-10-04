"use strict";

/**
 * Statements Controller
 * Generates account statements with running balance, PDF export, and print.
 */

/* global jspdf, XLSX */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Toast = BK.Toast;
  var TDB = BK.TransactionsDB;
  var ADB = BK.AccountsDB;

  function StatementsController(accountsCtrl) {
    this.accountsCtrl = accountsCtrl;
    this.statementData = null;
  }

  StatementsController.prototype.init = function () {
    var self = this;
    var genBtn = document.getElementById('btn-generate-statement');
    if (genBtn) genBtn.addEventListener('click', function () { self.generate(); });

    var pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) pdfBtn.addEventListener('click', function () { self.exportPDF(); });

    var excelBtn = document.getElementById('btn-export-excel');
    if (excelBtn) excelBtn.addEventListener('click', function () { self.exportExcel(); });

    var printBtn = document.getElementById('btn-print-statement');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    var startDate = document.getElementById('stmt-start-date');
    var endDate = document.getElementById('stmt-end-date');
    if (startDate) startDate.value = U.getDaysAgoStr(30);
    if (endDate) endDate.value = U.getTodayStr();
  };

  StatementsController.prototype.render = function () {
    var select = document.getElementById('stmt-account');
    if (select) return this.accountsCtrl.renderAccountOptions(select);
    return Promise.resolve();
  };

  StatementsController.prototype.generate = function () {
    var self = this;
    var accountId = parseInt(document.getElementById('stmt-account').value);
    var startDate = document.getElementById('stmt-start-date').value;
    var endDate = document.getElementById('stmt-end-date').value;

    if (!accountId) { Toast.warning('Please select an account.'); return; }
    if (!U.validateDate(startDate) || !U.validateDate(endDate)) { Toast.warning('Please enter valid dates.'); return; }
    if (startDate > endDate) { Toast.warning('Start date must be before end date.'); return; }

    return ADB.getById(accountId).then(function (account) {
      if (!account) { Toast.error('Account not found.'); return; }

      return TDB.getByAccountBeforeDate(accountId, startDate).then(function (priorTxns) {
        var openingBalance = account.openingBalance || 0;
        priorTxns.forEach(function (t) {
          if (t.type === 'credit') openingBalance += t.amount;
          else openingBalance -= t.amount;
        });

        return TDB.getByAccountAndDateRange(accountId, startDate, endDate).then(function (transactions) {
          var runningBalance = openingBalance;
          var totalCredits = 0, totalDebits = 0;
          var rows = [];

          transactions.forEach(function (txn) {
            if (txn.type === 'credit') { runningBalance += txn.amount; totalCredits += txn.amount; }
            else { runningBalance -= txn.amount; totalDebits += txn.amount; }
            rows.push(Object.assign({}, txn, { runningBalance: runningBalance }));
          });

          self.statementData = {
            account: account, startDate: startDate, endDate: endDate,
            openingBalance: openingBalance, closingBalance: runningBalance,
            totalCredits: totalCredits, totalDebits: totalDebits, transactions: rows
          };

          self.renderStatement();
          Toast.success('Statement generated successfully.');
        });
      });
    }).catch(function (err) { Toast.error('Failed to generate statement: ' + err.message); });
  };

  StatementsController.prototype.renderStatement = function () {
    var container = document.getElementById('statement-output');
    var actions = document.getElementById('statement-actions');
    if (!container || !this.statementData) return;
    U.clearChildren(container);
    container.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');

    var data = this.statementData;

    // Header info
    var headerInfo = U.createElement('div', { className: 'statement-header-info' }, [
      U.createElement('div', { className: 'info-item' }, [
        U.createElement('div', { className: 'info-label' }, ['Account Name']),
        U.createElement('div', { className: 'info-value' }, [data.account.name])
      ]),
      U.createElement('div', { className: 'info-item' }, [
        U.createElement('div', { className: 'info-label' }, ['Account Number']),
        U.createElement('div', { className: 'info-value' }, [data.account.accountNumber || 'N/A'])
      ]),
      U.createElement('div', { className: 'info-item' }, [
        U.createElement('div', { className: 'info-label' }, ['Period Start']),
        U.createElement('div', { className: 'info-value' }, [U.formatDate(data.startDate)])
      ]),
      U.createElement('div', { className: 'info-item' }, [
        U.createElement('div', { className: 'info-label' }, ['Period End']),
        U.createElement('div', { className: 'info-value' }, [U.formatDate(data.endDate)])
      ])
    ]);

    // Table
    var table = U.createElement('table');
    var thead = U.createElement('thead', {}, [
      U.createElement('tr', {}, [
        U.createElement('th', {}, ['Date']),
        U.createElement('th', {}, ['Description']),
        U.createElement('th', {}, ['Type']),
        U.createElement('th', { className: 'text-right' }, ['Amount']),
        U.createElement('th', { className: 'text-right' }, ['Balance'])
      ])
    ]);

    var tbody = U.createElement('tbody');

    // Opening balance
    tbody.appendChild(U.createElement('tr', { style: { fontWeight: '600', background: 'var(--hover-bg)' } }, [
      U.createElement('td', {}, [U.formatDate(data.startDate)]),
      U.createElement('td', { colSpan: '2' }, ['Opening Balance']),
      U.createElement('td', {}),
      U.createElement('td', { className: 'text-right' }, [U.formatCurrency(data.openingBalance)])
    ]));

    if (data.transactions.length === 0) {
      tbody.appendChild(U.createElement('tr', {}, [
        U.createElement('td', { colSpan: '5', className: 'text-center text-muted' }, ['No transactions in this period.'])
      ]));
    } else {
      data.transactions.forEach(function (txn) {
        var isCredit = txn.type === 'credit';
        tbody.appendChild(U.createElement('tr', {}, [
          U.createElement('td', {}, [U.formatDate(txn.date)]),
          U.createElement('td', {}, [txn.description || '\u2014']),
          U.createElement('td', {}, [
            U.createElement('span', { className: 'badge ' + (isCredit ? 'badge-credit' : 'badge-debit') }, [isCredit ? 'Credit' : 'Debit'])
          ]),
          U.createElement('td', { className: 'text-right ' + (isCredit ? 'text-success' : 'text-danger'), style: { fontWeight: '600' } }, [
            (isCredit ? '+' : '\u2212') + U.formatCurrency(txn.amount)
          ]),
          U.createElement('td', { className: 'text-right', style: { fontWeight: '500' } }, [U.formatCurrency(txn.runningBalance)])
        ]));
      });
    }

    // Closing balance
    tbody.appendChild(U.createElement('tr', { style: { fontWeight: '700', background: 'var(--hover-bg)' } }, [
      U.createElement('td', {}, [U.formatDate(data.endDate)]),
      U.createElement('td', { colSpan: '2' }, ['Closing Balance']),
      U.createElement('td', {}),
      U.createElement('td', { className: 'text-right ' + (data.closingBalance >= 0 ? 'text-success' : 'text-danger') }, [U.formatCurrency(data.closingBalance)])
    ]));

    table.appendChild(thead);
    table.appendChild(tbody);

    // Summary
    var netChange = data.totalCredits - data.totalDebits;
    var summary = U.createElement('div', { className: 'statement-summary' }, [
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label' }, ['Total Credits']),
        U.createElement('div', { className: 'summary-value credit' }, [U.formatCurrency(data.totalCredits)])
      ]),
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label' }, ['Total Debits']),
        U.createElement('div', { className: 'summary-value debit' }, [U.formatCurrency(data.totalDebits)])
      ]),
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label' }, ['Net Change']),
        U.createElement('div', { className: 'summary-value ' + (netChange >= 0 ? 'credit' : 'debit') }, [U.formatCurrency(netChange)])
      ])
    ]);

    container.appendChild(U.createElement('div', { className: 'statement-container' }, [headerInfo, table, summary]));
  };

  StatementsController.prototype.exportPDF = function () {
    if (!this.statementData) { Toast.warning('Generate a statement first.'); return; }

    try {
      var JsPDF = jspdf.jsPDF;
      var doc = new JsPDF();
      var data = this.statementData;

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Account Statement', 14, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Account: ' + data.account.name, 14, 32);
      doc.text('Account No: ' + (data.account.accountNumber || 'N/A'), 14, 38);
      doc.text('Period: ' + U.formatDate(data.startDate) + ' - ' + U.formatDate(data.endDate), 14, 44);
      doc.text('Generated: ' + new Date().toLocaleString(), 14, 50);

      doc.setDrawColor(200);
      doc.line(14, 54, 196, 54);

      doc.setFont('helvetica', 'bold');
      doc.text('Opening Balance: ' + U.formatCurrency(data.openingBalance), 14, 62);

      var tableData = data.transactions.map(function (txn) {
        return [
          U.formatDate(txn.date), txn.description || '\u2014',
          txn.type === 'credit' ? 'Credit' : 'Debit',
          (txn.type === 'credit' ? '+' : '-') + U.formatCurrency(txn.amount),
          U.formatCurrency(txn.runningBalance)
        ];
      });

      doc.autoTable({
        startY: 68,
        head: [['Date', 'Description', 'Type', 'Amount', 'Balance']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }
      });

      var finalY = doc.lastAutoTable.finalY + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Closing Balance: ' + U.formatCurrency(data.closingBalance), 14, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text('Total Credits: ' + U.formatCurrency(data.totalCredits), 14, finalY + 7);
      doc.text('Total Debits: ' + U.formatCurrency(data.totalDebits), 14, finalY + 14);

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('Generated by Bank Transaction Bookkeeping', 14, 285);

      var filename = 'statement_' + data.account.name.replace(/\s+/g, '_') + '_' + data.startDate + '_to_' + data.endDate + '.pdf';
      doc.save(filename);
      Toast.success('PDF exported successfully.');
    } catch (err) {
      Toast.error('Failed to export PDF: ' + err.message);
    }
  };

  BK.StatementsController = StatementsController;

  // ─── Excel Export for Single Statement ───
  StatementsController.prototype.exportExcel = function () {
    if (!this.statementData) { Toast.warning('Generate a statement first.'); return; }
    try {
      var data = this.statementData;
      var rows = [];

      // Header info rows
      rows.push(['Account Statement']);
      rows.push(['Account', data.account.name]);
      rows.push(['Account No', data.account.accountNumber || 'N/A']);
      rows.push(['Period', U.formatDate(data.startDate) + ' to ' + U.formatDate(data.endDate)]);
      rows.push(['Generated', new Date().toLocaleString()]);
      rows.push([]);

      // Column headers
      rows.push(['Date', 'Description', 'Type', 'Credit', 'Debit', 'Balance']);

      // Opening balance
      rows.push([U.formatDate(data.startDate), 'Opening Balance', '', '', '', data.openingBalance]);

      // Transaction rows
      data.transactions.forEach(function (txn) {
        rows.push([
          U.formatDate(txn.date),
          txn.description || '',
          txn.type === 'credit' ? 'Credit' : 'Debit',
          txn.type === 'credit' ? txn.amount : '',
          txn.type === 'debit' ? txn.amount : '',
          txn.runningBalance
        ]);
      });

      // Closing balance
      rows.push([U.formatDate(data.endDate), 'Closing Balance', '', '', '', data.closingBalance]);
      rows.push([]);
      rows.push(['', 'Total Credits', '', data.totalCredits, '', '']);
      rows.push(['', 'Total Debits', '', '', data.totalDebits, '']);
      rows.push(['', 'Net Change', '', '', '', data.totalCredits - data.totalDebits]);

      var ws = XLSX.utils.aoa_to_sheet(rows);
      // Set column widths
      ws['!cols'] = [{wch:14},{wch:30},{wch:10},{wch:16},{wch:16},{wch:16}];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Statement');

      var filename = 'statement_' + data.account.name.replace(/\s+/g, '_') + '_' + data.startDate + '_to_' + data.endDate + '.xlsx';
      XLSX.writeFile(wb, filename);
      Toast.success('Excel file exported successfully.');
    } catch (err) {
      Toast.error('Failed to export Excel: ' + err.message);
    }
  };

  // ─── Export All Accounts to Excel ───
  BK.exportAllAccountsExcel = function () {
    return Promise.all([ADB.getAll(), TDB.getAll()]).then(function (results) {
      var accounts = results[0];
      var allTxns = results[1];
      if (accounts.length === 0) { Toast.warning('No accounts to export.'); return; }

      var wb = XLSX.utils.book_new();

      // Summary sheet
      var summaryRows = [['All Accounts Summary'], ['Generated', new Date().toLocaleString()], []];
      summaryRows.push(['Account Name', 'Account Number', 'Opening Balance', 'Total Credits', 'Total Debits', 'Current Balance']);

      accounts.forEach(function (acc) {
        var txns = allTxns.filter(function (t) { return t.accountId === acc.id; });
        var credits = 0, debits = 0;
        txns.forEach(function (t) {
          if (t.type === 'credit') credits += t.amount;
          else debits += t.amount;
        });
        var balance = (acc.openingBalance || 0) + credits - debits;
        summaryRows.push([acc.name, acc.accountNumber || 'N/A', acc.openingBalance || 0, credits, debits, balance]);
      });

      var summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
      summaryWs['!cols'] = [{wch:24},{wch:20},{wch:16},{wch:16},{wch:16},{wch:16}];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      // Per-account sheet
      accounts.forEach(function (acc) {
        var txns = allTxns.filter(function (t) { return t.accountId === acc.id; })
          .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

        var rows = [['Account: ' + acc.name], ['Account No: ' + (acc.accountNumber || 'N/A')], []];
        rows.push(['Date', 'Description', 'Type', 'Credit', 'Debit', 'Balance']);

        var bal = acc.openingBalance || 0;
        rows.push(['', 'Opening Balance', '', '', '', bal]);

        txns.forEach(function (txn) {
          if (txn.type === 'credit') bal += txn.amount;
          else bal -= txn.amount;
          rows.push([
            U.formatDate(txn.date),
            txn.description || '',
            txn.type === 'credit' ? 'Credit' : 'Debit',
            txn.type === 'credit' ? txn.amount : '',
            txn.type === 'debit' ? txn.amount : '',
            bal
          ]);
        });

        rows.push(['', 'Current Balance', '', '', '', bal]);

        var ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{wch:14},{wch:30},{wch:10},{wch:16},{wch:16},{wch:16}];
        // Sheet name max 31 chars
        var sheetName = acc.name.substring(0, 28);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      XLSX.writeFile(wb, 'all_accounts_' + new Date().toISOString().split('T')[0] + '.xlsx');
      Toast.success('All accounts exported to Excel.');
    }).catch(function (err) {
      Toast.error('Excel export failed: ' + err.message);
    });
  };
})();
