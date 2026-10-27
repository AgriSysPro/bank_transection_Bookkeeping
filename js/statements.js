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

    BK.getBusinessDetails().then(function (biz) {
      // 1. Professional Printable Company Header (Visible on Screen & Print)
      var printHeader = U.createElement('div', { className: 'statement-print-header' }, [
        U.createElement('div', { className: 'd-flex justify-between align-center', style: { flexWrap: 'wrap', gap: '12px' } }, [
          U.createElement('div', {}, [
            U.createElement('div', { className: 'biz-name' }, [biz.name || 'Bank Bookkeeper']),
            biz.address ? U.createElement('div', { className: 'biz-subline' }, [biz.address]) : null,
            biz.phone ? U.createElement('div', { className: 'biz-subline' }, ['Phone: ' + biz.phone]) : null
          ].filter(Boolean)),
          biz.logo ? U.createElement('div', { style: { maxHeight: '60px', maxWidth: '120px' } }, [
            U.createElement('img', { src: biz.logo, style: { maxHeight: '50px', maxWidth: '100px', objectFit: 'contain' } })
          ]) : null
        ].filter(Boolean)),
        U.createElement('div', { className: 'doc-title-box mt-2' }, [
          U.createElement('div', { className: 'doc-title' }, ['OFFICIAL STATEMENT OF ACCOUNT']),
          U.createElement('div', { style: { fontSize: '11px', color: '#444' } }, [
            'Generated: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          ])
        ])
      ]);

      // 2. Account Metadata Info Grid
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
          U.createElement('div', { className: 'info-label' }, ['Statement Period']),
          U.createElement('div', { className: 'info-value' }, [U.formatDate(data.startDate) + ' \u2014 ' + U.formatDate(data.endDate)])
        ]),
        U.createElement('div', { className: 'info-item' }, [
          U.createElement('div', { className: 'info-label' }, ['Currency / Standard']),
          U.createElement('div', { className: 'info-value' }, ['PKR (Rs.) \u2022 Double-Entry'])
        ])
      ]);

      // 3. High-Contrast Monochrome Table (Separate DR/CR for B&W Clarity)
      var table = U.createElement('table', { className: 'statement-table' });
      var thead = U.createElement('thead', {}, [
        U.createElement('tr', {}, [
          U.createElement('th', { style: { width: '15%' } }, ['Date']),
          U.createElement('th', { style: { width: '35%' } }, ['Description / Details']),
          U.createElement('th', { style: { width: '10%', textAlign: 'center' } }, ['Type']),
          U.createElement('th', { className: 'text-right', style: { width: '13%' } }, ['Debit (DR)']),
          U.createElement('th', { className: 'text-right', style: { width: '13%' } }, ['Credit (CR)']),
          U.createElement('th', { className: 'text-right', style: { width: '14%' } }, ['Balance'])
        ])
      ]);

      var tbody = U.createElement('tbody');

      // Opening balance row
      tbody.appendChild(U.createElement('tr', { style: { fontWeight: '700', background: 'var(--hover-bg)' } }, [
        U.createElement('td', {}, [U.formatDate(data.startDate)]),
        U.createElement('td', { colSpan: '2' }, ['Opening Book Balance']),
        U.createElement('td', { className: 'text-right' }, ['\u2014']),
        U.createElement('td', { className: 'text-right' }, ['\u2014']),
        U.createElement('td', { className: 'text-right', style: { fontWeight: '700' } }, [U.formatCurrency(data.openingBalance)])
      ]));

      if (data.transactions.length === 0) {
        tbody.appendChild(U.createElement('tr', {}, [
          U.createElement('td', { colSpan: '6', className: 'text-center text-muted' }, ['No transactions found within this statement period.'])
        ]));
      } else {
        data.transactions.forEach(function (txn) {
          var isCredit = txn.type === 'credit';
          var descText = txn.description || '\u2014';
          if (txn.reason) descText = '[' + txn.reason + '] ' + descText;
          if (txn.personName) descText += ' (' + (isCredit ? 'From: ' : 'To: ') + txn.personName + ')';

          tbody.appendChild(U.createElement('tr', {}, [
            U.createElement('td', {}, [U.formatDate(txn.date)]),
            U.createElement('td', {}, [descText]),
            U.createElement('td', { style: { textAlign: 'center' } }, [
              U.createElement('span', { className: 'badge ' + (isCredit ? 'badge-credit' : 'badge-debit') }, [isCredit ? 'CR' : 'DR'])
            ]),
            U.createElement('td', { className: 'text-right', style: { fontWeight: isCredit ? 'normal' : '600' } }, [
              isCredit ? '\u2014' : U.formatCurrency(txn.amount)
            ]),
            U.createElement('td', { className: 'text-right', style: { fontWeight: isCredit ? '600' : 'normal' } }, [
              isCredit ? U.formatCurrency(txn.amount) : '\u2014'
            ]),
            U.createElement('td', { className: 'text-right', style: { fontWeight: '600' } }, [U.formatCurrency(txn.runningBalance)])
          ]));
        });
      }

      // Closing balance row
      tbody.appendChild(U.createElement('tr', { style: { fontWeight: '800', borderTop: '2px solid #000' } }, [
        U.createElement('td', {}, [U.formatDate(data.endDate)]),
        U.createElement('td', { colSpan: '2' }, ['Closing Book Balance']),
        U.createElement('td', { className: 'text-right' }, [U.formatCurrency(data.totalDebits)]),
        U.createElement('td', { className: 'text-right' }, [U.formatCurrency(data.totalCredits)]),
        U.createElement('td', { className: 'text-right', style: { fontWeight: '800' } }, [U.formatCurrency(data.closingBalance)])
      ]));

      table.appendChild(thead);
      table.appendChild(tbody);

      // 4. Financial Summary Grid
      var netChange = data.totalCredits - data.totalDebits;
      var summary = U.createElement('div', { className: 'statement-summary' }, [
        U.createElement('div', { className: 'summary-item' }, [
          U.createElement('div', { className: 'summary-label' }, ['Opening Balance']),
          U.createElement('div', { className: 'summary-value' }, [U.formatCurrency(data.openingBalance)])
        ]),
        U.createElement('div', { className: 'summary-item' }, [
          U.createElement('div', { className: 'summary-label' }, ['Total Debits (DR)']),
          U.createElement('div', { className: 'summary-value' }, [U.formatCurrency(data.totalDebits)])
        ]),
        U.createElement('div', { className: 'summary-item' }, [
          U.createElement('div', { className: 'summary-label' }, ['Total Credits (CR)']),
          U.createElement('div', { className: 'summary-value' }, [U.formatCurrency(data.totalCredits)])
        ]),
        U.createElement('div', { className: 'summary-item' }, [
          U.createElement('div', { className: 'summary-label' }, ['Net Movement / Change']),
          U.createElement('div', { className: 'summary-value' }, [(netChange >= 0 ? '+' : '') + U.formatCurrency(netChange)])
        ])
      ]);

      // 5. Official Printable Signatures & Footer (for Physical Paper & Print)
      var printFooter = U.createElement('div', { className: 'statement-print-footer' }, [
        U.createElement('div', { className: 'statement-print-signatures' }, [
          U.createElement('div', { className: 'signature-box' }, [
            U.createElement('div', { className: 'signature-title' }, ['Prepared By: ___________________________']),
            U.createElement('div', { className: 'signature-date' }, ['Accountant / Finance Officer'])
          ]),
          U.createElement('div', { className: 'signature-box', style: { textAlign: 'right' } }, [
            U.createElement('div', { className: 'signature-title' }, ['Authorized Signatory & Stamp: ___________________________']),
            U.createElement('div', { className: 'signature-date' }, ['Audited & Approved'])
          ])
        ]),
        U.createElement('div', { className: 'statement-print-disclaimer' }, [
          U.createElement('span', {}, ['Official Computer-Generated Financial Statement \u2022 BookKeeper Accounting System']),
          U.createElement('span', {}, ['Page 1 of 1 \u2022 Verified Double-Entry Ledger'])
        ])
      ]);

      container.appendChild(U.createElement('div', { className: 'statement-container' }, [
        printHeader, headerInfo, table, summary, printFooter
      ]));
    });
  };

  StatementsController.prototype.exportPDF = function () {
    if (!this.statementData) { Toast.warning('Generate a statement first.'); return; }
    var self = this;

    BK.getBusinessDetails().then(function (biz) {
      try {
        var JsPDF = jspdf.jsPDF;
        var doc = new JsPDF('p', 'mm', 'a4');
        var data = self.statementData;

        var pageWidth = 210;
        var pageHeight = 297;
        var margin = 14;
        var printableWidth = pageWidth - margin * 2;

        // ─── Header Block (Optimized for Black & White Printers) ───
        var textStartX = margin;
        if (biz.logo) {
          try {
            doc.addImage(biz.logo, 'PNG', margin, 12, 18, 18);
            textStartX = margin + 22;
          } catch(e) { console.error('Logo failed in statement PDF', e); }
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(0, 0, 0);
        doc.text(biz.name || 'Bank Bookkeeper', textStartX, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(50, 50, 50);
        var sublineY = 23;
        if (biz.address) {
          doc.text(biz.address, textStartX, sublineY);
          sublineY += 4.5;
        }
        if (biz.phone) {
          doc.text('Phone: ' + biz.phone, textStartX, sublineY);
        }

        // Title & Document Badge (Solid High-Contrast Monochrome)
        var lineY = Math.max(sublineY + 6, 32);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.line(margin, lineY, pageWidth - margin, lineY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('STATEMENT OF ACCOUNT', margin, lineY + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text('Generated: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), pageWidth - margin, lineY + 6, { align: 'right' });

        // Metadata Info Block
        var metaY = lineY + 11;
        doc.setFontSize(8.5);
        
        doc.setFont('helvetica', 'bold');
        doc.text('Account Name:', margin, metaY);
        doc.setFont('helvetica', 'normal');
        doc.text(data.account.name, margin + 26, metaY);

        doc.setFont('helvetica', 'bold');
        doc.text('Account Number:', margin + 90, metaY);
        doc.setFont('helvetica', 'normal');
        doc.text(data.account.accountNumber || 'N/A', margin + 118, metaY);

        metaY += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('Period:', margin, metaY);
        doc.setFont('helvetica', 'normal');
        doc.text(U.formatDate(data.startDate) + ' to ' + U.formatDate(data.endDate), margin + 26, metaY);

        doc.setFont('helvetica', 'bold');
        doc.text('Currency:', margin + 90, metaY);
        doc.setFont('helvetica', 'normal');
        doc.text('PKR (Rs.) \u2022 Double-Entry Ledger', margin + 118, metaY);

        // ─── Table Rows (Separate DR/CR for B&W Clarity) ───
        var tableData = [];

        // Opening balance
        tableData.push([
          U.formatDate(data.startDate),
          'Opening Book Balance',
          '--',
          '--',
          '--',
          U.formatCurrency(data.openingBalance)
        ]);

        data.transactions.forEach(function (txn) {
          var isCredit = txn.type === 'credit';
          var desc = txn.description || '\u2014';
          if (txn.reason) desc = '[' + txn.reason + '] ' + desc;
          if (txn.personName) desc += ' (' + (isCredit ? 'From: ' : 'To: ') + txn.personName + ')';

          tableData.push([
            U.formatDate(txn.date),
            desc,
            isCredit ? 'CR' : 'DR',
            isCredit ? '\u2014' : U.formatCurrency(txn.amount),
            isCredit ? U.formatCurrency(txn.amount) : '\u2014',
            U.formatCurrency(txn.runningBalance)
          ]);
        });

        // Closing balance row
        tableData.push([
          U.formatDate(data.endDate),
          'Closing Book Balance',
          '--',
          U.formatCurrency(data.totalDebits),
          U.formatCurrency(data.totalCredits),
          U.formatCurrency(data.closingBalance)
        ]);

        doc.autoTable({
          startY: metaY + 7,
          head: [['Date', 'Description / Details', 'Type', 'Debit (DR)', 'Credit (CR)', 'Balance']],
          body: tableData,
          theme: 'plain',
          styles: {
            font: 'helvetica',
            fontSize: 7.8,
            textColor: [0, 0, 0],
            cellPadding: 2,
            lineWidth: 0.15,
            lineColor: [160, 160, 160]
          },
          headStyles: {
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.5,
            lineColor: [0, 0, 0]
          },
          alternateRowStyles: {
            fillColor: [252, 252, 252]
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 20 },
            1: { halign: 'left' },
            2: { halign: 'center', cellWidth: 12 },
            3: { halign: 'right', cellWidth: 26 },
            4: { halign: 'right', cellWidth: 26 },
            5: { halign: 'right', cellWidth: 28 }
          },
          didDrawPage: function (hookData) {
            // Running Header on Page 2+
            if (hookData.pageNumber > 1) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7.5);
              doc.setTextColor(80, 80, 80);
              doc.text((biz.name || 'Bank Bookkeeper') + ' \u2022 Account Statement: ' + data.account.name + ' (' + U.formatDate(data.startDate) + ' to ' + U.formatDate(data.endDate) + ')', margin, 9);
              doc.setDrawColor(0, 0, 0);
              doc.setLineWidth(0.4);
              doc.line(margin, 10.5, pageWidth - margin, 10.5);
            }
          }
        });

        var finalY = doc.lastAutoTable.finalY + 8;
        // Check if summary and signatures fit on the current page; otherwise add new page
        if (finalY + 60 > pageHeight - 20) {
          doc.addPage();
          finalY = 20;
        }

        // ─── Financial Summary Table (High-Contrast B&W) ───
        var summaryBoxWidth = 95;
        var summaryBoxX = pageWidth - margin - summaryBoxWidth;
        var sHeight = 24;

        doc.setFillColor(248, 248, 248);
        doc.rect(summaryBoxX, finalY, summaryBoxWidth, sHeight, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.rect(summaryBoxX, finalY, summaryBoxWidth, sHeight, 'S');

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('FINANCIAL SUMMARY', summaryBoxX + 4, finalY + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.text('Opening Balance:', summaryBoxX + 4, finalY + 9);
        doc.text(U.formatCurrency(data.openingBalance), summaryBoxX + summaryBoxWidth - 4, finalY + 9, { align: 'right' });

        doc.text('Total Debits (DR):', summaryBoxX + 4, finalY + 13);
        doc.text(U.formatCurrency(data.totalDebits), summaryBoxX + summaryBoxWidth - 4, finalY + 13, { align: 'right' });

        doc.text('Total Credits (CR):', summaryBoxX + 4, finalY + 17);
        doc.text(U.formatCurrency(data.totalCredits), summaryBoxX + summaryBoxWidth - 4, finalY + 17, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text('Closing Book Balance:', summaryBoxX + 4, finalY + 21.5);
        doc.text(U.formatCurrency(data.closingBalance), summaryBoxX + summaryBoxWidth - 4, finalY + 21.5, { align: 'right' });

        // ─── Dual Official Signatures (For Official Audits) ───
        var sigY = Math.max(finalY + sHeight + 18, finalY + 32);
        var sigWidth = 60;

        // Left Signature: Prepared By
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.6);
        doc.line(margin, sigY, margin + sigWidth, sigY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Prepared By: ___________________', margin, sigY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('Accounts Officer / Date', margin, sigY + 8.5);

        // Right Signature: Authorized Signatory
        var rightSigX = pageWidth - margin - sigWidth;
        doc.line(rightSigX, sigY, pageWidth - margin, sigY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Authorized Signatory & Stamp', rightSigX, sigY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('Audited & Verified Record', rightSigX, sigY + 8.5);

        // ─── Running Footer across all pages ───
        var totalPages = doc.internal.getNumberOfPages();
        for (var p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.4);
          doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(70, 70, 70);
          doc.text('Official Customer Statement \u2022 Computer-Generated Record \u2022 BookKeeper Financial System', margin, pageHeight - 9.5);
          doc.text('Page ' + p + ' of ' + totalPages + ' \u2022 Generated: ' + new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 9.5, { align: 'right' });
        }

        var filename = 'statement_' + data.account.name.replace(/\s+/g, '_') + '_' + data.startDate + '_to_' + data.endDate + '.pdf';
        doc.save(filename);
        Toast.success('High-contrast PDF statement exported successfully.');
      } catch (err) {
        Toast.error('Failed to export PDF: ' + err.message);
      }
    });
  };

  BK.StatementsController = StatementsController;

  // ─── Excel Export for Single Statement (Optimized for B&W Printing) ───
  StatementsController.prototype.exportExcel = function () {
    if (!this.statementData) { Toast.warning('Generate a statement first.'); return; }
    var self = this;

    BK.getBusinessDetails().then(function (biz) {
      try {
        var data = self.statementData;
        var rows = [];

        // Header info rows (Formal Accounting Layout)
        rows.push([biz.name || 'Bank Bookkeeper']);
        if (biz.address) rows.push([biz.address]);
        if (biz.phone) rows.push(['Phone: ' + biz.phone]);
        rows.push(['OFFICIAL STATEMENT OF ACCOUNT']);
        rows.push(['Account Name:', data.account.name, '', 'Account Number:', data.account.accountNumber || 'N/A']);
        rows.push(['Period:', U.formatDate(data.startDate) + ' to ' + U.formatDate(data.endDate), '', 'Generated:', new Date().toLocaleString()]);
        rows.push(['Currency:', 'PKR (Rs.)', '', 'Statement Status:', 'Audited & Reconciled']);
        rows.push([]);

        // Column headers with separate Debit/Credit for Black & White printing clarity
        rows.push(['Date', 'Description / Narration', 'Type', 'Debit (DR)', 'Credit (CR)', 'Running Balance']);

        // Opening balance
        rows.push([U.formatDate(data.startDate), 'Opening Book Balance', '', '', '', data.openingBalance]);

        // Transaction rows
        data.transactions.forEach(function (txn) {
          var isCredit = txn.type === 'credit';
          var desc = txn.description || '';
          if (txn.reason) desc = '[' + txn.reason + '] ' + desc;
          if (txn.personName) desc += ' (' + (isCredit ? 'From: ' : 'To: ') + txn.personName + ')';

          rows.push([
            U.formatDate(txn.date),
            desc,
            isCredit ? 'Credit' : 'Debit',
            isCredit ? '' : txn.amount,
            isCredit ? txn.amount : '',
            txn.runningBalance
          ]);
        });

        // Closing balance
        rows.push([U.formatDate(data.endDate), 'Closing Book Balance', '', data.totalDebits, data.totalCredits, data.closingBalance]);
        rows.push([]);

        // Financial Summary Block
        rows.push(['FINANCIAL SUMMARY', '', '', '', '', '']);
        rows.push(['Opening Balance', '', '', '', '', data.openingBalance]);
        rows.push(['Total Debits (Withdrawals / Outflows)', '', '', data.totalDebits, '', '']);
        rows.push(['Total Credits (Deposits / Inflows)', '', '', '', data.totalCredits, '']);
        rows.push(['Net Account Movement', '', '', '', '', data.totalCredits - data.totalDebits]);
        rows.push(['Closing Book Balance', '', '', '', '', data.closingBalance]);
        rows.push([]);
        rows.push(['Prepared By: __________________________', '', '', 'Authorized Signatory: __________________________', '', '']);
        rows.push(['Date: __________________________', '', '', 'Official Stamp & Audit Approval', '', '']);

        var ws = XLSX.utils.aoa_to_sheet(rows);
        // Column widths
        ws['!cols'] = [{wch:14},{wch:44},{wch:10},{wch:16},{wch:16},{wch:18}];
        
        // Print setup for Black and White printer in Excel
        ws['!pageSetup'] = { orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };

        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Statement');

        var filename = 'statement_' + data.account.name.replace(/\s+/g, '_') + '_' + data.startDate + '_to_' + data.endDate + '.xlsx';
        XLSX.writeFile(wb, filename);
        Toast.success('Excel statement exported successfully.');
      } catch (err) {
        Toast.error('Failed to export Excel: ' + err.message);
      }
    });
  };

  // ─── Export All Accounts to Excel (Master Ledger) ───
  BK.exportAllAccountsExcel = function () {
    return Promise.all([ADB.getAll(), TDB.getAll(), BK.getBusinessDetails()]).then(function (results) {
      var accounts = results[0];
      var allTxns = results[1];
      var biz = results[2];
      if (accounts.length === 0) { Toast.warning('No accounts to export.'); return; }

      var wb = XLSX.utils.book_new();

      // Summary sheet
      var summaryRows = [
        [biz.name || 'Bank Bookkeeper'],
        [biz.address ? biz.address + (biz.phone ? ' | Phone: ' + biz.phone : '') : ''],
        ['EXECUTIVE ACCOUNTS MASTER SUMMARY'],
        ['Generated:', new Date().toLocaleString(), '', 'Total Accounts:', accounts.length],
        []
      ];
      summaryRows.push(['Account Name', 'Account Type', 'Account Number', 'Opening Balance', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance']);

      var grandOpening = 0, grandDebits = 0, grandCredits = 0, grandBalance = 0;

      accounts.forEach(function (acc) {
        var txns = allTxns.filter(function (t) { return t.accountId === acc.id; });
        var credits = 0, debits = 0;
        txns.forEach(function (t) {
          if (t.type === 'credit') credits += t.amount;
          else debits += t.amount;
        });
        var balance = (acc.openingBalance || 0) + credits - debits;
        grandOpening += (acc.openingBalance || 0);
        grandDebits += debits;
        grandCredits += credits;
        grandBalance += balance;

        summaryRows.push([
          acc.name,
          (acc.accountType || 'bank').toUpperCase(),
          acc.accountNumber || 'N/A',
          acc.openingBalance || 0,
          debits,
          credits,
          balance
        ]);
      });

      summaryRows.push([]);
      summaryRows.push(['TOTAL / GRAND AGGREGATE', '', '', grandOpening, grandDebits, grandCredits, grandBalance]);
      summaryRows.push([]);
      summaryRows.push(['Audited By: __________________________', '', '', '', 'Approved By: __________________________']);

      var summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
      summaryWs['!cols'] = [{wch:26},{wch:16},{wch:20},{wch:16},{wch:18},{wch:18},{wch:18}];
      summaryWs['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      // Per-account sheet
      accounts.forEach(function (acc) {
        var txns = allTxns.filter(function (t) { return t.accountId === acc.id; })
          .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

        var rows = [
          [biz.name || 'Bank Bookkeeper'],
          ['ACCOUNT LEDGER: ' + acc.name.toUpperCase()],
          ['Account No:', acc.accountNumber || 'N/A', '', 'Type:', (acc.accountType || 'bank').toUpperCase()],
          ['Generated:', new Date().toLocaleString()],
          []
        ];
        rows.push(['Date', 'Description / Narration', 'Type', 'Debit (DR)', 'Credit (CR)', 'Running Balance']);

        var bal = acc.openingBalance || 0;
        rows.push([U.toDateStr(new Date()), 'Opening Book Balance', '', '', '', bal]);

        var totalD = 0, totalC = 0;
        txns.forEach(function (txn) {
          var isCredit = txn.type === 'credit';
          if (isCredit) { bal += txn.amount; totalC += txn.amount; }
          else { bal -= txn.amount; totalD += txn.amount; }

          var desc = txn.description || '';
          if (txn.reason) desc = '[' + txn.reason + '] ' + desc;
          if (txn.personName) desc += ' (' + (isCredit ? 'From: ' : 'To: ') + txn.personName + ')';

          rows.push([
            U.formatDate(txn.date),
            desc,
            isCredit ? 'Credit' : 'Debit',
            isCredit ? '' : txn.amount,
            isCredit ? txn.amount : '',
            bal
          ]);
        });

        rows.push(['', 'Closing Current Balance', '', totalD, totalC, bal]);
        rows.push([]);
        rows.push(['Prepared By: __________________________', '', '', 'Authorized Signatory: __________________________']);

        var ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{wch:14},{wch:42},{wch:10},{wch:16},{wch:16},{wch:18}];
        ws['!pageSetup'] = { orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 };
        var sheetName = acc.name.substring(0, 28);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      XLSX.writeFile(wb, 'all_accounts_master_' + new Date().toISOString().split('T')[0] + '.xlsx');
      Toast.success('All accounts exported to Excel master workbook.');
    }).catch(function (err) {
      Toast.error('Excel export failed: ' + err.message);
    });
  };
})();
