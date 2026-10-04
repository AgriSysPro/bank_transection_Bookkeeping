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
      Promise.all([TDB.getAll(), CDB.getAll()]).then(function (results) {
        var transactions = results[0];
        var categories = results[1];
        self.renderBalanceTrend(transactions);
        self.renderCategoryExpenses(transactions, categories);
      });
    },

    renderBalanceTrend: function (transactions) {
      var ctx = document.getElementById('chart-balance-trend');
      if (!ctx) return;

      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

      // Filter last 30 days
      var today = new Date();
      var thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      var sorted = transactions
        .filter(function (t) { return new Date(t.date) >= thirtyDaysAgo; })
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

      var labels = [];
      var dataPoints = [];

      // Group by day
      var dayBalances = {};
      sorted.forEach(function (t) {
        var d = t.date;
        if (!dayBalances[d]) dayBalances[d] = 0;
        if (t.type === 'credit') dayBalances[d] += t.amount;
        else dayBalances[d] -= t.amount;
      });

      var dates = Object.keys(dayBalances).sort();
      var runningTotal = 0;
      dates.forEach(function (d) {
        labels.push(U.formatDate(d));
        runningTotal += dayBalances[d];
        dataPoints.push(runningTotal);
      });

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
            label: 'Net Balance',
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

      var expenseTxns = transactions.filter(function (t) { return t.type === 'debit' && t.categoryId; });
      var categoryMap = {};
      categories.forEach(function (c) { categoryMap[c.id] = c; });

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
