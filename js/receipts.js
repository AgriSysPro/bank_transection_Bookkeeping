"use strict";

/**
 * Receipts Module (Phase 5)
 * Handles professional A4 PDF receipt generation.
 */

/* global jspdf */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;

  BK.Receipts = {
    generateA4: function (txn) {
      if (!txn) return;
      
      var self = this;
      Promise.all([
        BK.getBusinessDetails(),
        BK.AccountsDB.get(txn.accountId),
        txn.categoryId ? BK.CategoriesDB.get(txn.categoryId) : Promise.resolve(null)
      ]).then(function(results) {
        var biz = results[0];
        var account = results[1];
        var category = results[2];
        self.renderPDF(txn, biz, account, category);
      }).catch(function(err) {
        BK.Toast.error('Failed to generate receipt: ' + err.message);
      });
    },

    getBusinessDetails: function() {
      return BK.getBusinessDetails();
    },

    renderPDF: function (txn, biz, account, category) {
      var JsPDF = jspdf.jsPDF;
      var doc = new JsPDF('p', 'pt', 'a4');
      
      var margin = 40;
      var pageWidth = doc.internal.pageSize.getWidth();
      var pageHeight = doc.internal.pageSize.getHeight();
      
      // ─── Header ───
      var headerTextX = margin;
      if (biz.logo) {
        try {
          doc.addImage(biz.logo, 'PNG', margin, margin, 55, 55);
          headerTextX = margin + 65;
        } catch(e) { console.error('Logo failed to render', e); }
      }

      // Business Info (Crisp Black for Monochrome Printers)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(0, 0, 0);
      doc.text(biz.name || 'Bank Bookkeeper', headerTextX, margin + 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      var sublineY = margin + 32;
      if (biz.address) {
        doc.text(biz.address, headerTextX, sublineY);
        sublineY += 13;
      }
      if (biz.phone) {
        doc.text('Phone / Mobile: ' + biz.phone, headerTextX, sublineY);
      }

      // Document Title & Voucher Badge
      var dividerY = 112;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.5);
      doc.line(margin, dividerY, pageWidth - margin, dividerY);

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      var isCredit = txn.type === 'credit';
      var titleText = isCredit ? 'PAYMENT RECEIPT / CASH INFLOW VOUCHER' : 'PAYMENT VOUCHER / CASH OUTFLOW';
      doc.text(titleText, margin, dividerY + 22);
      
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text('Voucher No: #VCH-' + (txn.id + 1000), pageWidth - margin, dividerY + 16, { align: 'right' });
      doc.text('Date: ' + U.formatDate(txn.date), pageWidth - margin, dividerY + 28, { align: 'right' });

      // ─── Voucher Details Table (High-Contrast B&W Table) ───
      var startY = dividerY + 42;
      var labelWidth = 140;
      var valWidth = pageWidth - margin * 2 - labelWidth;
      var rowHeight = 24;

      var rows = [
        { label: 'Transaction Date', value: U.formatDate(txn.date) },
        { label: 'Voucher Type', value: (txn.type === 'credit' ? 'CREDIT / INFLOW (Money Received)' : 'DEBIT / OUTFLOW (Money Paid Out)') },
        { label: 'Account / Channel', value: (account ? account.name + (account.accountNumber ? ' (' + account.accountNumber + ')' : '') : 'Primary Account') },
        { label: 'Category', value: (category ? category.name : 'General') },
        { label: 'Reason / Purpose', value: (txn.reason || 'General Ledger Entry'), isBold: true }
      ];

      if (txn.personName) {
        var personLabel = isCredit ? 'Received From (Payer)' : 'Paid To (Beneficiary)';
        var personVal = txn.personName + (txn.personPhone ? ' | Tel: ' + txn.personPhone : '') + (txn.personRole ? ' [' + txn.personRole.toUpperCase() + ']' : '');
        rows.push({ label: personLabel, value: personVal, isBold: true });
      }

      rows.push({ label: 'Memo / Reference', value: (txn.description || '\u2014') });

      var curY = startY;
      rows.forEach(function (r) {
        // Label Box (Subtle 3% neutral tint for B&W laser printers)
        doc.setFillColor(242, 242, 242);
        doc.rect(margin, curY, labelWidth, rowHeight, 'F');
        
        // Borders (Crisp dark lines)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.rect(margin, curY, labelWidth, rowHeight, 'S');
        doc.rect(margin + labelWidth, curY, valWidth, rowHeight, 'S');

        // Label Text
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(r.label, margin + 8, curY + 15);

        // Value Text
        doc.setFont('helvetica', r.isBold ? 'bold' : 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        
        // Truncate if too long for one line
        var maxChars = 68;
        var displayVal = r.value || '\u2014';
        if (displayVal.length > maxChars) displayVal = displayVal.substring(0, maxChars) + '...';
        doc.text(displayVal, margin + labelWidth + 8, curY + 15);

        curY += rowHeight;
      });

      // ─── Total Amount Box (High-Contrast Monochrome Highlight) ───
      var totalBoxY = curY + 18;
      var totalBoxHeight = 58;

      // Outer heavy border
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, totalBoxY, pageWidth - margin * 2, totalBoxHeight, 'F');
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.5);
      doc.rect(margin, totalBoxY, pageWidth - margin * 2, totalBoxHeight, 'S');
      
      // Inner decorative hairline border for banknote / voucher style
      doc.setLineWidth(0.5);
      doc.rect(margin + 3, totalBoxY + 3, pageWidth - margin * 2 - 6, totalBoxHeight - 6, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text('TOTAL AMOUNT RECORDED', margin + 18, totalBoxY + 34);

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(U.formatCurrency(txn.amount), pageWidth - margin - 18, totalBoxY + 35, { align: 'right' });

      // ─── Official Signatures Section (For Paper Audits & Filing) ───
      var sigY = totalBoxY + totalBoxHeight + 85;
      var sigLineWidth = 200;

      // Left Signature: Payer / Beneficiary
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(margin, sigY, margin + sigLineWidth, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      var leftSigTitle = isCredit ? 'Payer / Depositor Signature' : 'Beneficiary / Receiver Signature';
      doc.text(leftSigTitle, margin, sigY + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Date: ________________________', margin, sigY + 28);

      // Right Signature: Authorized Official
      var rightSigX = pageWidth - margin - sigLineWidth;
      doc.line(rightSigX, sigY, pageWidth - margin, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Authorized Signatory & Stamp', rightSigX, sigY + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Audited & Entered into BookKeeper', rightSigX, sigY + 28);

      // ─── Running Footer ───
      var footerY = pageHeight - 38;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(margin, footerY, pageWidth - margin, footerY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(70, 70, 70);
      doc.text('Official Customer Copy \u2022 Verified Double-Entry Ledger Record \u2022 BookKeeper Financial System', margin, footerY + 14);
      doc.text('Printed: ' + new Date().toLocaleString() + ' \u2022 Page 1 of 1', pageWidth - margin, footerY + 14, { align: 'right' });

      doc.save('Receipt_' + txn.id + '_' + txn.date + '.pdf');
      BK.Toast.success('High-contrast A4 Receipt generated.');
    }
  };

  /**
   * Receipts Vault Controller
   * Renders the gallery of attached receipts
   */
  function ReceiptsVaultController() {}

  ReceiptsVaultController.prototype.render = function () {
    var gallery = document.getElementById('receipts-gallery');
    if (!gallery) return;

    U.clearChildren(gallery);

    BK.TransactionsDB.getAll().then(function (txns) {
      var receiptTxns = txns.filter(function (t) { return t.receiptData; });

      if (receiptTxns.length === 0) {
        gallery.style.display = 'block';
        gallery.appendChild(U.createElement('div', { 
          className: 'table-empty', 
          style: { padding: '60px 20px' } 
        }, [
          U.createElement('i', { className: 'fas fa-image', style: { fontSize: '48px', color: 'var(--primary)', opacity: '0.4' } }),
          U.createElement('p', { style: { fontWeight: '600', fontSize: '18px', marginTop: '16px' } }, ['No Receipts Found']),
          U.createElement('p', { style: { color: 'var(--text-secondary)' } }, ['Attach images or PDFs to your transactions to see them here.'])
        ]));
        return;
      }

      gallery.style.display = 'grid';

      receiptTxns.forEach(function (txn) {
        var isImg = txn.receiptType && txn.receiptType.startsWith('image/');
        
        var preview = isImg ? U.createElement('img', { 
          src: txn.receiptData, 
          style: { width: '100%', height: '160px', objectFit: 'cover', borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' } 
        }) : U.createElement('div', { 
          style: { width: '100%', height: '160px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' } 
        }, [
          U.createElement('i', { className: 'fas fa-file-pdf', style: { fontSize: '48px', color: 'var(--danger)' } })
        ]);

        var card = U.createElement('div', { 
          className: 'card', 
          style: { padding: '0', cursor: 'pointer', transition: 'transform 0.2s', overflow: 'hidden' },
          onClick: function () {
            if (isImg) {
              var w = window.open("");
              w.document.write('<img src="' + txn.receiptData + '" style="max-width:100%;">');
            } else {
              var pdfWindow = window.open("");
              pdfWindow.document.write('<iframe width="100%" height="100%" src="' + txn.receiptData + '"></iframe>');
            }
          }
        }, [
          preview,
          U.createElement('div', { style: { padding: '16px' } }, [
            U.createElement('div', { style: { fontWeight: '600', fontSize: '16px', marginBottom: '4px' } }, [U.formatCurrency(txn.amount)]),
            U.createElement('div', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' } }, [U.formatDate(txn.date)]),
            U.createElement('div', { style: { fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, [txn.description || 'No Description'])
          ])
        ]);
        
        card.onmouseover = function() { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = 'var(--shadow-md)'; };
        card.onmouseout = function() { card.style.transform = 'none'; card.style.boxShadow = 'var(--shadow-sm)'; };
        
        gallery.appendChild(card);
      });
    });
  };

  BK.ReceiptsVaultController = ReceiptsVaultController;
})();
