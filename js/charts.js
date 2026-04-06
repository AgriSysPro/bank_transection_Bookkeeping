"use strict";

/**
 * Charts Module
 * Manages Chart.js visualizations for the dashboard.
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

      // Filter last 30 days
      var today = new Date();
      var thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      var sorted = transactions
        .filter(function (t) { return new Date(t.date) >= thirtyDaysAgo; })
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

      var labels = [];
      var dataPoints = [];
      var currentBalance = 0; // Simplified trend, would be better with starting balance

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

      balanceChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Net Balance Change',
            data: dataPoints,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHitRadius: 10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { 
              beginAtZero: false,
              grid: { color: 'rgba(128,128,128,0.1)' },
              ticks: { font: { size: 10 } }
            },
            x: { 
              grid: { display: false },
              ticks: { font: { size: 10 } }
            }
          }
        }
      });
    },

    renderCategoryExpenses: function (transactions, categories) {
      var ctx = document.getElementById('chart-category-expenses');
      if (!ctx) return;

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
      var colors = labels.map(function (name) {
        var cat = categories.find(function (c) { return c.name === name; });
        return cat ? cat.color : '#94a3b8';
      });

      if (categoryChart) categoryChart.destroy();

      if (labels.length === 0) {
        // Show empty state if no data
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
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 15,
                usePointStyle: true,
                font: { size: 11 }
              }
            }
          },
          cutout: '70%'
        }
      });
    }
  };
})();
