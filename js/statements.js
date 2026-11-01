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
    if (select) {
      return this.accountsCtrl.renderAccountOptions(select).then(function () {
        var opt = U.createElement('option', { value: 'all-net-balance', style: { fontWeight: '700', color: 'var(--primary)' } }, [
          '★ Balance Sheet & Net Financial Position (All Accounts)'
        ]);
        if (select.children.length > 1) {
          select.insertBefore(opt, select.children[1]);
        } else {
          select.appendChild(opt);
        }
      });
    }
    return Promise.resolve();
  };

  StatementsController.prototype.generate = function () {
    var self = this;
    var accountVal = document.getElementById('stmt-account').value;
    if (accountVal === 'all-net-balance') {
      return self.generateNetBalanceStatement();
    }

    var accountId = parseInt(accountVal, 10);
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
    if (this.statementData.isNetBalance) {
      return BK.FinancialReports.exportNetBalancePDF();
    }
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

  // ─── Generate & Render Consolidated Net Balance Statement ───
  StatementsController.prototype.generateNetBalanceStatement = function () {
    var self = this;
    return BK.FinancialReports.getData().then(function (data) {
      if (!data.accounts || data.accounts.length === 0) {
        Toast.warning('No accounts found.');
        return;
      }
      self.statementData = {
        isNetBalance: true,
        financialData: data
      };
      self.renderNetBalanceStatement(data);
      Toast.success('Net Balance & Financial Position statement generated.');
    }).catch(function (err) {
      Toast.error('Failed to generate net balance statement: ' + err.message);
    });
  };

  StatementsController.prototype.renderNetBalanceStatement = function (data) {
    var container = document.getElementById('statement-output');
    var actions = document.getElementById('statement-actions');
    if (!container) return;
    U.clearChildren(container);
    container.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');

    var biz = data.biz;
    var t = data.totals;

    var wrapper = U.createElement('div', { className: 'statement-container' });

    // 1. Company Header (Crisp B&W Printable)
    var header = U.createElement('div', { className: 'statement-print-header' }, [
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
        U.createElement('div', { className: 'doc-title' }, ['STATEMENT OF FINANCIAL POSITION & NET BALANCE']),
        U.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, [
          'As of: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '  |  Currency: PKR (Rs.)'
        ])
      ])
    ]);
    wrapper.appendChild(header);

    // 2. Executive 4-Card Summary Bar
    var summaryCards = U.createElement('div', { 
      className: 'statement-summary',
      style: { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }
    }, [
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label' }, ['Liquid Cash & Bank']),
        U.createElement('div', { className: 'summary-value' }, [U.formatCurrency(t.bank.balance)])
      ]),
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label' }, ['Accounts Receivable']),
        U.createElement('div', { className: 'summary-value credit' }, [U.formatCurrency(t.receivable.balance)])
      ]),
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label' }, ['Payables (Liabilities)']),
        U.createElement('div', { className: 'summary-value debit' }, [U.formatCurrency(t.payable.balance)])
      ]),
      U.createElement('div', { className: 'summary-item' }, [
        U.createElement('div', { className: 'summary-label', style: { fontWeight: '700' } }, ['Total Net Balance']),
        U.createElement('div', { className: 'summary-value ' + (t.totalNetBalance >= 0 ? 'credit' : 'debit') }, [U.formatCurrency(t.totalNetBalance)])
      ])
    ]);
    wrapper.appendChild(summaryCards);

    // Section Table Builder Helper
    function createSection(title, headers, rows, subtotalRow) {
      var sectionBox = U.createElement('div', { style: { padding: '20px 28px', borderBottom: '1px solid var(--border-primary)' } });
      sectionBox.appendChild(U.createElement('h4', { style: { fontSize: '13px', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' } }, [title]));
      
      var tbl = U.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } });
      var thElements = headers.map(function(h, idx) {
        return U.createElement('th', { className: (idx >= 3 ? 'text-right' : 'text-left') }, [h]);
      });
      tbl.appendChild(U.createElement('thead', {}, [U.createElement('tr', {}, thElements)]));
      
      var tb = U.createElement('tbody');
      rows.forEach(function(r) {
        var tds = r.map(function(c, idx) {
          return U.createElement('td', { className: (idx >= 3 ? 'text-right' : 'text-left') }, [String(c)]);
        });
        tb.appendChild(U.createElement('tr', {}, tds));
      });

      if (subtotalRow) {
        var subTds = subtotalRow.map(function(c, idx) {
          return U.createElement('td', { 
            className: (idx >= 3 ? 'text-right' : 'text-left'),
            style: { fontWeight: '700', borderTop: '2px solid var(--border-primary)', background: 'var(--hover-bg)' }
          }, [String(c)]);
        });
        tb.appendChild(U.createElement('tr', {}, subTds));
      }

      tbl.appendChild(tb);
      sectionBox.appendChild(tbl);
      return sectionBox;
    }

    // 3. Bank Section
    var bankRows = data.bankAccounts.map(function(a) {
      return [a.name, a.accountNumber || 'N/A', 'BANK', U.formatCurrency(a.openingBalance), U.formatCurrency(a.totalDebits), U.formatCurrency(a.totalCredits), U.formatCurrency(a.currentBalance)];
    });
    var bankSub = ['SUBTOTAL: LIQUID ASSETS (CASH & BANK)', data.bankAccounts.length + ' Account(s)', '', U.formatCurrency(t.bank.opening), U.formatCurrency(t.bank.debits), U.formatCurrency(t.bank.credits), U.formatCurrency(t.bank.balance)];
    wrapper.appendChild(createSection('I. Liquid Assets (Cash & Bank Accounts)', ['Account Name', 'Account / IBAN #', 'Type', 'Opening Bal', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance'], bankRows, bankSub));

    // 4. Receivables Section
    var recRows = data.receivableAccounts.map(function(a) {
      return [a.name, a.phone || 'N/A', a.notes || 'Receivable', U.formatCurrency(a.openingBalance), U.formatCurrency(a.totalDebits), U.formatCurrency(a.totalCredits), U.formatCurrency(a.currentBalance)];
    });
    var recSub = ['SUBTOTAL: ACCOUNTS RECEIVABLE (OWED TO ME)', data.receivableAccounts.length + ' Debtor(s)', '', U.formatCurrency(t.receivable.opening), U.formatCurrency(t.receivable.debits), U.formatCurrency(t.receivable.credits), U.formatCurrency(t.receivable.balance)];
    wrapper.appendChild(createSection('II. Accounts Receivable (Money Owed to Me / Debtors)', ['Debtor / Client Name', 'Phone', 'Notes / Purpose', 'Opening Debt', 'Received (DR)', 'Lent (CR)', 'Net Receivable'], recRows, recSub));

    // 5. Payables Section
    var payRows = data.payableAccounts.map(function(a) {
      return [a.name, a.phone || 'N/A', a.notes || 'Payable', U.formatCurrency(a.openingBalance), U.formatCurrency(a.totalDebits), U.formatCurrency(a.totalCredits), U.formatCurrency(a.currentBalance)];
    });
    var paySub = ['SUBTOTAL: ACCOUNTS PAYABLE & LIABILITIES (I OWE)', data.payableAccounts.length + ' Creditor(s)', '', U.formatCurrency(t.payable.opening), U.formatCurrency(t.payable.debits), U.formatCurrency(t.payable.credits), U.formatCurrency(t.payable.balance)];
    wrapper.appendChild(createSection('III. Accounts Payable & Liabilities (Money I Owe / Creditors)', ['Creditor / Supplier Name', 'Phone', 'Notes / Purpose', 'Initial Debt', 'Repaid (DR)', 'Borrowed (CR)', 'Net Payable'], payRows, paySub));

    // 6. Reconciliation Card
    var reconCard = U.createElement('div', { style: { padding: '24px 28px', background: 'var(--hover-bg)', borderBottom: '1px solid var(--border-primary)' } }, [
      U.createElement('h4', { style: { fontSize: '13px', fontWeight: '700', marginBottom: '12px', textTransform: 'uppercase' } }, ['Financial Position & Net Balance Reconciliation']),
      U.createElement('table', { style: { width: '100%', maxWidth: '640px', fontSize: '13px' } }, [
        U.createElement('tbody', {}, [
          U.createElement('tr', {}, [U.createElement('td', { style: { padding: '5px 0' } }, ['(+) Total Liquid Cash & Bank Assets']), U.createElement('td', { className: 'text-right', style: { fontWeight: '600' } }, [U.formatCurrency(t.bank.balance)])]),
          U.createElement('tr', {}, [U.createElement('td', { style: { padding: '5px 0' } }, ['(+) Total Accounts Receivable (Owed to Me)']), U.createElement('td', { className: 'text-right', style: { fontWeight: '600', color: 'var(--success)' } }, ['+ ' + U.formatCurrency(t.receivable.balance)])]),
          U.createElement('tr', { style: { borderTop: '1px solid var(--border-primary)', fontWeight: '700' } }, [U.createElement('td', { style: { padding: '6px 0' } }, ['(=) TOTAL GROSS ASSETS']), U.createElement('td', { className: 'text-right' }, [U.formatCurrency(t.totalGrossAssets)])]),
          U.createElement('tr', {}, [U.createElement('td', { style: { padding: '5px 0' } }, ['(-) Total Accounts Payable & Liabilities (I Owe)']), U.createElement('td', { className: 'text-right', style: { fontWeight: '600', color: 'var(--danger)' } }, ['- ' + U.formatCurrency(t.totalLiabilities)])]),
          U.createElement('tr', { style: { borderTop: '2px solid var(--text-primary)', borderBottom: '2px solid var(--text-primary)', fontWeight: '800', fontSize: '15px' } }, [
            U.createElement('td', { style: { padding: '10px 0' } }, ['(★) TOTAL NET BALANCE (NET WORTH)']),
            U.createElement('td', { className: 'text-right ' + (t.totalNetBalance >= 0 ? 'text-success' : 'text-danger') }, [U.formatCurrency(t.totalNetBalance)])
          ]),
          U.createElement('tr', {}, [U.createElement('td', { style: { padding: '6px 0', fontSize: '11px', color: 'var(--text-muted)' } }, ['(i) Immediate Net Liquidity Margin (Bank Cash minus Payables)']), U.createElement('td', { className: 'text-right', style: { fontSize: '12px', fontWeight: '600' } }, [U.formatCurrency(t.immediateNetLiquidity)])])
        ])
      ])
    ]);
    wrapper.appendChild(reconCard);

    // 7. Signature Footer
    var sigFooter = U.createElement('div', { className: 'statement-print-footer' }, [
      U.createElement('div', { className: 'statement-print-signatures', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' } }, [
        U.createElement('div', { className: 'sig-block', style: { textAlign: 'center' } }, [
          U.createElement('div', { className: 'sig-line', style: { borderTop: '1px solid #000', margin: '40px 10px 6px' } }),
          U.createElement('div', { className: 'sig-title', style: { fontSize: '11px', fontWeight: '600' } }, ['Prepared By']),
          U.createElement('div', { className: 'sig-sub', style: { fontSize: '10px', color: 'var(--text-muted)' } }, ['Accountant / Operator'])
        ]),
        U.createElement('div', { className: 'sig-block', style: { textAlign: 'center' } }, [
          U.createElement('div', { className: 'sig-line', style: { borderTop: '1px solid #000', margin: '40px 10px 6px' } }),
          U.createElement('div', { className: 'sig-title', style: { fontSize: '11px', fontWeight: '600' } }, ['Audited & Verified By']),
          U.createElement('div', { className: 'sig-sub', style: { fontSize: '10px', color: 'var(--text-muted)' } }, ['Financial Controller'])
        ]),
        U.createElement('div', { className: 'sig-block', style: { textAlign: 'center' } }, [
          U.createElement('div', { className: 'sig-line', style: { borderTop: '1px solid #000', margin: '40px 10px 6px' } }),
          U.createElement('div', { className: 'sig-title', style: { fontSize: '11px', fontWeight: '600' } }, ['Authorized Signatory']),
          U.createElement('div', { className: 'sig-sub', style: { fontSize: '10px', color: 'var(--text-muted)' } }, ['Official Stamp & Seal'])
        ])
      ])
    ]);
    wrapper.appendChild(sigFooter);

    container.appendChild(wrapper);
  };

  BK.StatementsController = StatementsController;

  // ─── Excel Export for Single Statement (Optimized for B&W Printing) ───
  StatementsController.prototype.exportExcel = function () {
    if (!this.statementData) { Toast.warning('Generate a statement first.'); return; }
    if (this.statementData.isNetBalance) {
      return BK.FinancialReports.exportNetBalanceExcel();
    }
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

  // ─── Financial Reports Service (Net Balance & Balance Sheet) ───
  BK.FinancialReports = {
    getData: function () {
      return Promise.all([
        ADB.getAll(),
        TDB.getAll(),
        BK.getBusinessDetails()
      ]).then(function (results) {
        var accounts = results[0];
        var allTxns = results[1];
        var biz = results[2];

        var bankAccounts = [];
        var receivableAccounts = [];
        var payableAccounts = [];
        var otherAccounts = [];

        var grandBankOpening = 0, grandBankDebits = 0, grandBankCredits = 0, grandBankBalance = 0;
        var grandRecOpening = 0, grandRecDebits = 0, grandRecCredits = 0, grandRecBalance = 0;
        var grandPayOpening = 0, grandPayDebits = 0, grandPayCredits = 0, grandPayBalance = 0;
        var grandOtherOpening = 0, grandOtherDebits = 0, grandOtherCredits = 0, grandOtherBalance = 0;

        accounts.forEach(function (acc) {
          var txns = allTxns.filter(function (t) { return t.accountId === acc.id; });
          var credits = 0, debits = 0;
          txns.forEach(function (t) {
            if (t.type === 'credit') credits += t.amount;
            else debits += t.amount;
          });
          var opening = parseFloat(acc.openingBalance) || 0;
          var balance = opening + credits - debits;

          var item = {
            id: acc.id,
            name: acc.name,
            accountNumber: acc.accountNumber || '',
            accountType: (acc.accountType || 'bank').toLowerCase(),
            phone: acc.phone || '',
            notes: acc.notes || '',
            openingBalance: opening,
            totalDebits: debits,
            totalCredits: credits,
            currentBalance: balance,
            txnCount: txns.length,
            txns: txns
          };

          if (item.accountType === 'bank') {
            bankAccounts.push(item);
            grandBankOpening += opening;
            grandBankDebits += debits;
            grandBankCredits += credits;
            grandBankBalance += balance;
          } else if (item.accountType === 'receivable') {
            receivableAccounts.push(item);
            grandRecOpening += opening;
            grandRecDebits += debits;
            grandRecCredits += credits;
            grandRecBalance += balance;
          } else if (item.accountType === 'payable') {
            payableAccounts.push(item);
            grandPayOpening += opening;
            grandPayDebits += debits;
            grandPayCredits += credits;
            grandPayBalance += balance;
          } else {
            otherAccounts.push(item);
            grandOtherOpening += opening;
            grandOtherDebits += debits;
            grandOtherCredits += credits;
            grandOtherBalance += balance;
          }
        });

        var totalGrossAssets = grandBankBalance + grandRecBalance + grandOtherBalance;
        var totalLiabilities = grandPayBalance;
        var totalNetBalance = totalGrossAssets - totalLiabilities;
        var immediateNetLiquidity = grandBankBalance - grandPayBalance;

        return {
          biz: biz,
          accounts: accounts,
          allTxns: allTxns,
          bankAccounts: bankAccounts,
          receivableAccounts: receivableAccounts,
          payableAccounts: payableAccounts,
          otherAccounts: otherAccounts,
          totals: {
            bank: { opening: grandBankOpening, debits: grandBankDebits, credits: grandBankCredits, balance: grandBankBalance },
            receivable: { opening: grandRecOpening, debits: grandRecDebits, credits: grandRecCredits, balance: grandRecBalance },
            payable: { opening: grandPayOpening, debits: grandPayDebits, credits: grandPayCredits, balance: grandPayBalance },
            other: { opening: grandOtherOpening, debits: grandOtherDebits, credits: grandOtherCredits, balance: grandOtherBalance },
            totalGrossAssets: totalGrossAssets,
            totalLiabilities: totalLiabilities,
            totalNetBalance: totalNetBalance,
            immediateNetLiquidity: immediateNetLiquidity
          }
        };
      });
    },

    exportNetBalancePDF: function () {
      return this.getData().then(function (data) {
        if (!data.accounts || data.accounts.length === 0) {
          Toast.warning('No accounts found to export.');
          return;
        }

        var JsPDF = jspdf.jsPDF;
        var doc = new JsPDF('p', 'mm', 'a4');
        var pageWidth = 210;
        var pageHeight = 297;
        var margin = 14;
        var printableWidth = pageWidth - margin * 2;
        var biz = data.biz;
        var t = data.totals;

        // ─── Header Block ───
        var textStartX = margin;
        if (biz.logo) {
          try {
            doc.addImage(biz.logo, 'PNG', margin, 12, 18, 18);
            textStartX = margin + 22;
          } catch (e) { console.error('Logo render error', e); }
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(0, 0, 0);
        doc.text(biz.name || 'Bank Bookkeeper', textStartX, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(60, 60, 60);
        var sublineY = 23;
        if (biz.address) {
          doc.text(biz.address, textStartX, sublineY);
          sublineY += 4.5;
        }
        if (biz.phone) {
          doc.text('Phone: ' + biz.phone, textStartX, sublineY);
        }

        var lineY = Math.max(sublineY + 6, 32);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.line(margin, lineY, pageWidth - margin, lineY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(0, 0, 0);
        doc.text('STATEMENT OF FINANCIAL POSITION & NET BALANCE', margin, lineY + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(70, 70, 70);
        var genDateStr = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        doc.text('As of: ' + genDateStr + '  |  Currency: PKR (Rs.)', pageWidth - margin, lineY + 6, { align: 'right' });

        // ─── Executive KPI Cards ───
        var kpiY = lineY + 10;
        var cardW = printableWidth / 4;
        var cardH = 14;

        var kpis = [
          { label: 'LIQUID CASH & BANK', value: U.formatCurrency(t.bank.balance) },
          { label: 'ACCOUNTS RECEIVABLE', value: U.formatCurrency(t.receivable.balance) },
          { label: 'PAYABLES (LIABILITIES)', value: U.formatCurrency(t.payable.balance) },
          { label: 'TOTAL NET BALANCE', value: U.formatCurrency(t.totalNetBalance), highlight: true }
        ];

        kpis.forEach(function (kpi, i) {
          var kX = margin + (i * cardW);
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(kpi.highlight ? 0.6 : 0.2);
          if (kpi.highlight) {
            doc.setFillColor(242, 242, 242);
            doc.rect(kX, kpiY, cardW - 2, cardH, 'FD');
          } else {
            doc.setFillColor(255, 255, 255);
            doc.rect(kX, kpiY, cardW - 2, cardH, 'S');
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.8);
          doc.setTextColor(60, 60, 60);
          doc.text(kpi.label, kX + 3, kpiY + 4.5);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.8);
          doc.setTextColor(0, 0, 0);
          doc.text(kpi.value, kX + 3, kpiY + 10.5);
        });

        var currentY = kpiY + cardH + 6;

        var tableTheme = {
          theme: 'plain',
          styles: {
            font: 'helvetica',
            fontSize: 7.5,
            textColor: [0, 0, 0],
            cellPadding: 2,
            lineWidth: 0.15,
            lineColor: [160, 160, 160]
          },
          headStyles: {
            fillColor: [238, 238, 238],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.4,
            lineColor: [0, 0, 0]
          },
          alternateRowStyles: {
            fillColor: [253, 253, 253]
          }
        };

        // 1. Bank Accounts Table
        var bankRows = [];
        data.bankAccounts.forEach(function (acc) {
          bankRows.push([
            acc.name,
            acc.accountNumber || 'N/A',
            U.formatCurrency(acc.openingBalance),
            U.formatCurrency(acc.totalDebits),
            U.formatCurrency(acc.totalCredits),
            U.formatCurrency(acc.currentBalance)
          ]);
        });
        if (bankRows.length === 0) {
          bankRows.push(['No bank accounts recorded.', '', '', '', '', 'Rs. 0.00']);
        }
        bankRows.push([
          'SUBTOTAL: LIQUID CASH & BANK ACCOUNTS',
          data.bankAccounts.length + ' Account(s)',
          U.formatCurrency(t.bank.opening),
          U.formatCurrency(t.bank.debits),
          U.formatCurrency(t.bank.credits),
          U.formatCurrency(t.bank.balance)
        ]);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text('I. LIQUID ASSETS (CASH & BANK ACCOUNTS)', margin, currentY);

        doc.autoTable(Object.assign({}, tableTheme, {
          startY: currentY + 2.5,
          head: [['Account Name', 'Account / IBAN #', 'Opening Balance', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance']],
          body: bankRows,
          columnStyles: {
            0: { halign: 'left', cellWidth: 50 },
            1: { halign: 'left', cellWidth: 35 },
            2: { halign: 'right', cellWidth: 24 },
            3: { halign: 'right', cellWidth: 24 },
            4: { halign: 'right', cellWidth: 24 },
            5: { halign: 'right', cellWidth: 25 }
          },
          didParseCell: function (cellData) {
            if (cellData.row.index === bankRows.length - 1) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fillColor = [242, 242, 242];
              cellData.cell.styles.lineWidth = 0.3;
              cellData.cell.styles.lineColor = [0, 0, 0];
            }
          }
        }));

        currentY = doc.lastAutoTable.finalY + 7;

        // 2. Receivables Table
        var recRows = [];
        data.receivableAccounts.forEach(function (acc) {
          recRows.push([
            acc.name,
            acc.phone || 'N/A',
            acc.notes || 'Receivable / Loan',
            U.formatCurrency(acc.openingBalance),
            U.formatCurrency(acc.totalDebits),
            U.formatCurrency(acc.totalCredits),
            U.formatCurrency(acc.currentBalance)
          ]);
        });
        if (recRows.length === 0) {
          recRows.push(['No active receivables recorded.', '', '', '', '', 'Rs. 0.00']);
        }
        recRows.push([
          'SUBTOTAL: ACCOUNTS RECEIVABLE (OWED TO ME)',
          data.receivableAccounts.length + ' Person(s)',
          '',
          U.formatCurrency(t.receivable.debits),
          U.formatCurrency(t.receivable.credits),
          U.formatCurrency(t.receivable.balance)
        ]);

        if (currentY + 30 > pageHeight - 25) { doc.addPage(); currentY = 16; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text('II. ACCOUNTS RECEIVABLE (CURRENT ASSETS - OWED TO ME)', margin, currentY);

        doc.autoTable(Object.assign({}, tableTheme, {
          startY: currentY + 2.5,
          head: [['Debtor / Client Name', 'Contact / Phone', 'Notes / Terms', 'Opening Debt', 'Received (DR)', 'Given (CR)', 'Net Receivable']],
          body: recRows,
          columnStyles: {
            0: { halign: 'left', cellWidth: 46 },
            1: { halign: 'left', cellWidth: 28 },
            2: { halign: 'left', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 22 },
            4: { halign: 'right', cellWidth: 24 },
            5: { halign: 'right', cellWidth: 24 },
            6: { halign: 'right', cellWidth: 23 }
          },
          didParseCell: function (cellData) {
            if (cellData.row.index === recRows.length - 1) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fillColor = [242, 242, 242];
              cellData.cell.styles.lineWidth = 0.3;
              cellData.cell.styles.lineColor = [0, 0, 0];
            }
          }
        }));

        currentY = doc.lastAutoTable.finalY + 7;

        // 3. Payables Table
        var payRows = [];
        data.payableAccounts.forEach(function (acc) {
          payRows.push([
            acc.name,
            acc.phone || 'N/A',
            acc.notes || 'Payable / Loan Owed',
            U.formatCurrency(acc.openingBalance),
            U.formatCurrency(acc.totalDebits),
            U.formatCurrency(acc.totalCredits),
            U.formatCurrency(acc.currentBalance)
          ]);
        });
        if (payRows.length === 0) {
          payRows.push(['No active liabilities/payables recorded.', '', '', '', '', 'Rs. 0.00']);
        }
        payRows.push([
          'SUBTOTAL: ACCOUNTS PAYABLE & LIABILITIES (I OWE)',
          data.payableAccounts.length + ' Person(s)',
          '',
          U.formatCurrency(t.payable.debits),
          U.formatCurrency(t.payable.credits),
          U.formatCurrency(t.payable.balance)
        ]);

        if (currentY + 30 > pageHeight - 25) { doc.addPage(); currentY = 16; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text('III. ACCOUNTS PAYABLE & LIABILITIES (CURRENT LIABILITIES - I OWE)', margin, currentY);

        doc.autoTable(Object.assign({}, tableTheme, {
          startY: currentY + 2.5,
          head: [['Creditor / Supplier Name', 'Contact / Phone', 'Notes / Terms', 'Opening Debt', 'Repaid (DR)', 'Borrowed (CR)', 'Net Payable']],
          body: payRows,
          columnStyles: {
            0: { halign: 'left', cellWidth: 46 },
            1: { halign: 'left', cellWidth: 28 },
            2: { halign: 'left', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 22 },
            4: { halign: 'right', cellWidth: 24 },
            5: { halign: 'right', cellWidth: 24 },
            6: { halign: 'right', cellWidth: 23 }
          },
          didParseCell: function (cellData) {
            if (cellData.row.index === payRows.length - 1) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fillColor = [242, 242, 242];
              cellData.cell.styles.lineWidth = 0.3;
              cellData.cell.styles.lineColor = [0, 0, 0];
            }
          }
        }));

        currentY = doc.lastAutoTable.finalY + 8;

        // 4. Other Accounts (if any)
        if (data.otherAccounts.length > 0) {
          var otherRows = [];
          data.otherAccounts.forEach(function (acc) {
            otherRows.push([
              acc.name,
              acc.accountType.toUpperCase(),
              U.formatCurrency(acc.openingBalance),
              U.formatCurrency(acc.totalDebits),
              U.formatCurrency(acc.totalCredits),
              U.formatCurrency(acc.currentBalance)
            ]);
          });
          otherRows.push([
            'SUBTOTAL: OTHER ACCOUNTS',
            '',
            U.formatCurrency(t.other.opening),
            U.formatCurrency(t.other.debits),
            U.formatCurrency(t.other.credits),
            U.formatCurrency(t.other.balance)
          ]);

          if (currentY + 28 > pageHeight - 25) { doc.addPage(); currentY = 16; }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);
          doc.text('IV. OTHER ACCOUNTS & HOLDINGS', margin, currentY);

          doc.autoTable(Object.assign({}, tableTheme, {
            startY: currentY + 2.5,
            head: [['Account Name', 'Type', 'Opening Balance', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance']],
            body: otherRows,
            columnStyles: {
              0: { halign: 'left', cellWidth: 50 },
              1: { halign: 'left', cellWidth: 35 },
              2: { halign: 'right', cellWidth: 24 },
              3: { halign: 'right', cellWidth: 24 },
              4: { halign: 'right', cellWidth: 24 },
              5: { halign: 'right', cellWidth: 25 }
            },
            didParseCell: function (cellData) {
              if (cellData.row.index === otherRows.length - 1) {
                cellData.cell.styles.fontStyle = 'bold';
                cellData.cell.styles.fillColor = [242, 242, 242];
              }
            }
          }));

          currentY = doc.lastAutoTable.finalY + 8;
        }

        // 5. Consolidated Reconciliation Summary Box
        if (currentY + 68 > pageHeight - 20) {
          doc.addPage();
          currentY = 18;
        }

        var reconRows = [
          ['(+) Total Liquid Assets (Cash & Bank Accounts)', U.formatCurrency(t.bank.balance)],
          ['(+) Total Accounts Receivable (Owed to Me / Debtors)', '+ ' + U.formatCurrency(t.receivable.balance)],
          ['(=) TOTAL GROSS ASSETS (Liquid + Receivables)', U.formatCurrency(t.totalGrossAssets)],
          ['(-) Total Accounts Payable & Liabilities (I Owe / Creditors)', '- ' + U.formatCurrency(t.totalLiabilities)],
          ['(★) TOTAL NET BALANCE / NET WORTH AFTER LIABILITIES', U.formatCurrency(t.totalNetBalance)],
          ['(i) Immediate Net Liquidity Margin (Bank Cash minus Payables)', U.formatCurrency(t.immediateNetLiquidity)]
        ];

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        doc.text('FINANCIAL POSITION & NET BALANCE RECONCILIATION', margin, currentY);

        doc.autoTable({
          startY: currentY + 2.5,
          head: [['Item / Classification', 'Net Amount (PKR)']],
          body: reconRows,
          theme: 'plain',
          styles: {
            font: 'helvetica',
            fontSize: 8.2,
            textColor: [0, 0, 0],
            cellPadding: 2.5,
            lineWidth: 0.2,
            lineColor: [120, 120, 120]
          },
          headStyles: {
            fillColor: [230, 230, 230],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.5,
            lineColor: [0, 0, 0]
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 125 },
            1: { halign: 'right', cellWidth: 57 }
          },
          didParseCell: function (cellData) {
            if (cellData.row.index === 2) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fillColor = [248, 248, 248];
            }
            if (cellData.row.index === 4) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fontSize = 9.2;
              cellData.cell.styles.fillColor = [235, 235, 235];
              cellData.cell.styles.lineWidth = 0.5;
              cellData.cell.styles.lineColor = [0, 0, 0];
            }
          }
        });

        currentY = doc.lastAutoTable.finalY + 12;

        // 6. Signatures Block
        if (currentY + 28 > pageHeight - 15) {
          doc.addPage();
          currentY = 20;
        }

        var colWidth = (printableWidth - 10) / 3;
        var sig1X = margin;
        var sig2X = margin + colWidth + 5;
        var sig3X = margin + (colWidth + 5) * 2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);

        doc.line(sig1X, currentY + 10, sig1X + colWidth, currentY + 10);
        doc.text('Prepared By (Accountant / Data Entry)', sig1X, currentY + 14);

        doc.line(sig2X, currentY + 10, sig2X + colWidth, currentY + 10);
        doc.text('Audited & Reconciled By', sig2X, currentY + 14);

        doc.line(sig3X, currentY + 10, sig3X + colWidth, currentY + 10);
        doc.text('Authorized Signatory & Stamp', sig3X, currentY + 14);

        // Page Numbering
        var totalPages = doc.internal.getNumberOfPages();
        for (var p = 1; p <= totalPages; p++) {
          doc.setPage(p);

          if (p > 1) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(80, 80, 80);
            doc.text((biz.name || 'Bank Bookkeeper') + '  •  Statement of Financial Position & Net Balance', margin, 9);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            doc.line(margin, 10.5, pageWidth - margin, 10.5);
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(90, 90, 90);
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.3);
          doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
          doc.text('Generated by BookKeeper  •  Confidential Financial Record', margin, pageHeight - 6.5);
          doc.text('Page ' + p + ' of ' + totalPages, pageWidth - margin, pageHeight - 6.5, { align: 'right' });
        }

        var fileName = 'financial_position_net_balance_' + new Date().toISOString().split('T')[0] + '.pdf';
        doc.save(fileName);
        Toast.success('Net Balance Sheet PDF exported successfully.');
      }).catch(function (err) {
        console.error('PDF export failed:', err);
        Toast.error('Failed to export Net Balance PDF: ' + err.message);
      });
    },

    exportNetBalanceExcel: function () {
      return this.getData().then(function (data) {
        if (!data.accounts || data.accounts.length === 0) {
          Toast.warning('No accounts found to export.');
          return;
        }

        var biz = data.biz;
        var t = data.totals;
        var wb = XLSX.utils.book_new();

        // ─── Sheet 1: Net Financial Position (Balance Sheet) ───
        var rows = [
          [biz.name || 'Bank Bookkeeper'],
          [biz.address ? biz.address + (biz.phone ? ' | Phone: ' + biz.phone : '') : ''],
          ['STATEMENT OF FINANCIAL POSITION & NET WORTH'],
          ['As of Date:', new Date().toLocaleString(), '', 'Currency:', 'PKR (Rs.)', '', 'Scope:', 'All Accounts & Balances'],
          []
        ];

        // 1. Bank Accounts
        rows.push(['I. LIQUID ASSETS (CASH & BANK ACCOUNTS)']);
        rows.push(['Account Name', 'Account / IBAN Number', 'Account Type', 'Opening Balance', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance']);

        data.bankAccounts.forEach(function (acc) {
          rows.push([
            acc.name,
            acc.accountNumber || 'N/A',
            'BANK / CASH',
            acc.openingBalance,
            acc.totalDebits,
            acc.totalCredits,
            acc.currentBalance
          ]);
        });
        if (data.bankAccounts.length === 0) {
          rows.push(['No bank accounts recorded.', '', '', 0, 0, 0, 0]);
        }
        rows.push([
          'SUBTOTAL: LIQUID ASSETS (CASH & BANK)',
          data.bankAccounts.length + ' Account(s)',
          '',
          t.bank.opening,
          t.bank.debits,
          t.bank.credits,
          t.bank.balance
        ]);
        rows.push([]);

        // 2. Receivables
        rows.push(['II. ACCOUNTS RECEIVABLE (MONEY OWED TO ME / DEBTORS)']);
        rows.push(['Debtor / Client Name', 'Contact / Phone', 'Notes / Purpose', 'Initial Debt', 'Received Back (DR)', 'Given / Lent (CR)', 'Outstanding Balance']);

        data.receivableAccounts.forEach(function (acc) {
          rows.push([
            acc.name,
            acc.phone || 'N/A',
            acc.notes || 'Receivable / Loan',
            acc.openingBalance,
            acc.totalDebits,
            acc.totalCredits,
            acc.currentBalance
          ]);
        });
        if (data.receivableAccounts.length === 0) {
          rows.push(['No active receivables recorded.', '', '', 0, 0, 0, 0]);
        }
        rows.push([
          'SUBTOTAL: ACCOUNTS RECEIVABLE (OWED TO ME)',
          data.receivableAccounts.length + ' Person(s)',
          '',
          t.receivable.opening,
          t.receivable.debits,
          t.receivable.credits,
          t.receivable.balance
        ]);
        rows.push([]);

        // Summary: Total Gross Assets
        rows.push(['TOTAL GROSS ASSETS (Liquid Cash + Receivables)', '', '', '', '', '', t.totalGrossAssets]);
        rows.push([]);

        // 3. Payables & Liabilities
        rows.push(['III. ACCOUNTS PAYABLE & LIABILITIES (MONEY I OWE / CREDITORS)']);
        rows.push(['Creditor / Supplier Name', 'Contact / Phone', 'Notes / Purpose', 'Initial Balance', 'Repayments Made (DR)', 'Borrowed / Incurred (CR)', 'Outstanding Liability']);

        data.payableAccounts.forEach(function (acc) {
          rows.push([
            acc.name,
            acc.phone || 'N/A',
            acc.notes || 'Payable / Debt',
            acc.openingBalance,
            acc.totalDebits,
            acc.totalCredits,
            acc.currentBalance
          ]);
        });
        if (data.payableAccounts.length === 0) {
          rows.push(['No active liabilities/payables recorded.', '', '', 0, 0, 0, 0]);
        }
        rows.push([
          'SUBTOTAL: LIABILITIES & PAYABLES (I OWE)',
          data.payableAccounts.length + ' Person(s)',
          '',
          t.payable.opening,
          t.payable.debits,
          t.payable.credits,
          t.payable.balance
        ]);
        rows.push([]);

        // 4. Other Accounts (if any)
        if (data.otherAccounts.length > 0) {
          rows.push(['IV. OTHER ACCOUNTS & ASSETS']);
          rows.push(['Account Name', 'Type', 'Notes', 'Opening Balance', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance']);
          data.otherAccounts.forEach(function (acc) {
            rows.push([
              acc.name,
              acc.accountType.toUpperCase(),
              acc.notes || '',
              acc.openingBalance,
              acc.totalDebits,
              acc.totalCredits,
              acc.currentBalance
            ]);
          });
          rows.push([
            'SUBTOTAL: OTHER ACCOUNTS',
            '',
            '',
            t.other.opening,
            t.other.debits,
            t.other.credits,
            t.other.balance
          ]);
          rows.push([]);
        }

        // 5. Executive Reconciliation & Net Balance
        rows.push(['FINANCIAL POSITION & NET BALANCE RECONCILIATION']);
        rows.push(['(+) Total Liquid Assets (Bank & Cash Accounts)', '', '', '', '', '', t.bank.balance]);
        rows.push(['(+) Total Accounts Receivable (Owed to Me / Debtors)', '', '', '', '', '', t.receivable.balance]);
        if (t.other.balance !== 0) {
          rows.push(['(+) Total Other Assets & Accounts', '', '', '', '', '', t.other.balance]);
        }
        rows.push(['(=) TOTAL GROSS ASSETS', '', '', '', '', '', t.totalGrossAssets]);
        rows.push(['(-) Total Accounts Payable & Liabilities (I Owe / Creditors)', '', '', '', '', '', t.totalLiabilities]);
        rows.push(['----------------------------------------------------------------------------------------------------']);
        rows.push(['(★) TOTAL NET BALANCE / NET WORTH AFTER LIABILITIES', '', '', '', '', '', t.totalNetBalance]);
        rows.push(['(i) Immediate Net Liquidity Margin (Bank Cash minus Payables)', '', '', '', '', '', t.immediateNetLiquidity]);
        rows.push([]);

        // Signatures
        rows.push(['Prepared By: __________________________', '', 'Audited & Verified By: __________________________', '', 'Authorized Signatory & Stamp: __________________________']);
        rows.push(['Date: __________________________', '', 'Official Audit & Balance Sheet Approval', '', 'BookKeeper Automated Financial System']);

        var ws1 = XLSX.utils.aoa_to_sheet(rows);
        ws1['!cols'] = [
          { wch: 32 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }
        ];
        ws1['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
        XLSX.utils.book_append_sheet(wb, ws1, 'Balance Sheet & Net Worth');

        // ─── Sheet 2: All Accounts Summary Directory ───
        var summaryRows = [
          [biz.name || 'Bank Bookkeeper'],
          ['ALL ACCOUNTS SUMMARY DIRECTORY'],
          ['Generated:', new Date().toLocaleString()],
          []
        ];
        summaryRows.push(['Account Name', 'Classification', 'Account Number / Contact', 'Opening Balance', 'Total Debits (DR)', 'Total Credits (CR)', 'Current Balance']);
        
        var allCombined = data.bankAccounts.concat(data.receivableAccounts, data.payableAccounts, data.otherAccounts);
        allCombined.forEach(function (item) {
          summaryRows.push([
            item.name,
            item.accountType.toUpperCase(),
            item.accountNumber || item.phone || 'N/A',
            item.openingBalance,
            item.totalDebits,
            item.totalCredits,
            item.currentBalance
          ]);
        });
        summaryRows.push([]);
        summaryRows.push(['TOTAL NET BALANCE AFTER LIABILITIES', '', '', '', '', '', t.totalNetBalance]);

        var ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
        ws2['!cols'] = [
          { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 20 }
        ];
        ws2['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
        XLSX.utils.book_append_sheet(wb, ws2, 'Accounts Directory');

        var filename = 'financial_position_net_balance_' + new Date().toISOString().split('T')[0] + '.xlsx';
        XLSX.writeFile(wb, filename);
        Toast.success('Net Balance Sheet Excel exported successfully.');
      }).catch(function (err) {
        console.error('Excel export failed:', err);
        Toast.error('Failed to export Net Balance Excel: ' + err.message);
      });
    }
  };

  // Global helper exports
  BK.exportNetBalancePDF = function () {
    return BK.FinancialReports.exportNetBalancePDF();
  };

  BK.exportNetBalanceExcel = function () {
    return BK.FinancialReports.exportNetBalanceExcel();
  };

  BK.exportAllAccountsExcel = function () {
    return BK.FinancialReports.exportNetBalanceExcel();
  };
})();
