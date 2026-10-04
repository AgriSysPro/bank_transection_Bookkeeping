"use strict";

/**
 * Charts Module
 * Manages Chart.js visualizations matching the Shopifi dual-canvas design language.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var TDB = BK.TransactionsDB;
  var CDB = BK.CategoriesDB;

  var balanceChart = null;
  var categoryChart = null;

  BK.Charts = {
    init: function () {
      this.renderAll();
    },

    renderAll: function () {
      var self = this;
      Promise.all([TDB.getAll(), CDB.getAll(), BK.AccountsDB.getAll()]).then(function (results) {
        var transactions = results[0];
        var categories = results[1];
        var accounts = results[2];
        self.renderBalanceTrend(transactions, accounts);
        self.renderCategoryExpenses(transactions, categories);
      });
    },

    renderBalanceTrend: function (transactions, accounts) {
      var ctx = document.getElementById('chart-balance-trend');
      if (!ctx) return;

      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

      // Liquid assets only. A credit raises and a debit lowers a bank balance,
      // but the same is not true of a payable, so mixing account types here
      // would plot a number that is not a balance of anything.
      var bankIds = {};
      var openingTotal = 0;
      accounts.forEach(function (a) {
        if (!a.accountType || a.accountType === 'bank') {
          bankIds[a.id] = true;
          openingTotal += (a.openingBalance || 0);
        }
      });

      // Balance is opening totals, then every movement in date order. The old
      // version started from zero inside the window, so it plotted 30 days of
      // cash flow and called it a balance.
      var chronological = transactions.filter(function (t) {
        return bankIds[t.accountId];
      }).sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return (a.id || 0) - (b.id || 0);
      });

      var dayMovement = {};
      var dayOrder = [];
      chronological.forEach(function (t) {
        if (!(t.date in dayMovement)) { dayMovement[t.date] = 0; dayOrder.push(t.date); }
        if (t.type === 'credit') dayMovement[t.date] += t.amount;
        else dayMovement[t.date] -= t.amount;
      });

      var windowStart = U.getDaysAgoStr(30);
      var running = openingTotal;
      var preWindowBalance = openingTotal;
      var visible = [];
      dayOrder.forEach(function (d) {
        running += dayMovement[d];
        if (d < windowStart) preWindowBalance = running;
        else visible.push({ date: d, balance: running });
      });

      var labels = [];
      var dataPoints = [];
      if (visible.length > 0) {
        // Anchor the line at the balance the window opened with.
        if (visible[0].date > windowStart) {
          labels.push(U.formatDate(windowStart));
          dataPoints.push(preWindowBalance);
        }
        visible.forEach(function (p) {
          labels.push(U.formatDate(p.date));
          dataPoints.push(p.balance);
        });
      }

      if (balanceChart) balanceChart.destroy();

      var lineColor = isDark ? '#ffffff' : '#000000';
      var areaColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(193, 251, 212, 0.45)'; /* Aloe-10 tint */
      var gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
      var tickColor = isDark ? '#71717a' : '#a1a1aa';

      balanceChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels.length > 0 ? labels : ['No Data'],
          datasets: [{
            label: 'Liquid Assets',
            data: dataPoints.length > 0 ? dataPoints : [0],
            borderColor: lineColor,
            borderWidth: 2,
            backgroundColor: areaColor,
            fill: true,
            tension: 0.35,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            pointBackgroundColor: lineColor,
            pointHitRadius: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: isDark ? '#1e2c31' : '#000000',
              titleFont: { family: 'Inter', size: 12 },
              bodyFont: { family: 'Inter', size: 12 },
              padding: 10,
              cornerRadius: 9999,
              displayColors: false
            }
          },
          scales: {
            y: {
              beginAtZero: false,
              grid: { color: gridColor, drawBorder: false },
              ticks: { font: { family: 'Inter', size: 10.5 }, color: tickColor }
            },
            x: {
              grid: { display: false },
              ticks: { font: { family: 'Inter', size: 10.5 }, color: tickColor }
            }
          }
        }
      });
    },

    renderCategoryExpenses: function (transactions, categories) {
      var ctx = document.getElementById('chart-category-expenses');
      if (!ctx) return;

      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

      var categoryMap = {};
      categories.forEach(function (c) { categoryMap[c.id] = c; });

      // Spending only: a debit tagged with an income category is not an expense,
      // and a transfer is a movement between the user's own accounts.
      var expenseTxns = transactions.filter(function (t) {
        if (t.isTransfer || t.type !== 'debit' || !t.categoryId) return false;
        var cat = categoryMap[t.categoryId];
        return !!cat && cat.type === 'expense';
      });

      var totals = {};
      expenseTxns.forEach(function (t) {
        var cat = categoryMap[t.categoryId];
        var name = cat ? cat.name : 'Other';
        if (!totals[name]) totals[name] = 0;
        totals[name] += t.amount;
      });

      var labels = Object.keys(totals);
      var dataPoints = Object.values(totals);

      var brandPalette = ['#c1fbd4', '#d4f9e0', '#000000', '#71717a', '#d4d4d8', '#99b3ad', '#3f3f46'];
      if (isDark) brandPalette = ['#ffffff', '#99b3ad', '#1e2c31', '#71717a', '#d4d4d8', '#52525b'];

      var colors = labels.map(function (name, idx) {
        var cat = categories.find(function (c) { return c.name === name; });
        return (cat && cat.color) ? cat.color : brandPalette[idx % brandPalette.length];
      });

      if (categoryChart) categoryChart.destroy();

      if (labels.length === 0) {
        return;
      }

      categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataPoints,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
                usePointStyle: true,
                pointStyle: 'circle',
                font: { family: 'Inter', size: 11 },
                color: isDark ? '#a1a1aa' : '#71717a'
              }
            },
            tooltip: {
              backgroundColor: isDark ? '#1e2c31' : '#000000',
              titleFont: { family: 'Inter', size: 12 },
              bodyFont: { family: 'Inter', size: 12 },
              padding: 10,
              cornerRadius: 9999,
              displayColors: true
            }
          },
          cutout: '74%'
        }
      });
    }
  };
})();
