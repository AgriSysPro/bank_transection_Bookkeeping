"use strict";

/**
 * Utility Functions
 * Sanitization, formatting, validation, and DOM helpers.
 */

var BK = window.BK || {};

(function () {
  var Utils = {};

  // ─── Sanitization ───
  Utils.escapeHtml = function (str) {
    if (typeof str !== 'string') return '';
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, function (c) { return map[c]; });
  };

  Utils.sanitize = function (str) {
    if (typeof str !== 'string') return '';
    return Utils.escapeHtml(str.trim());
  };

  // ─── Formatting ───
  Utils.formatCurrency = function (amount) {
    var num = parseFloat(amount);
    if (isNaN(num)) return 'Rs. 0.00';
    return 'Rs. ' + new Intl.NumberFormat('en-PK', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(num);
  };

  Utils.formatDate = function (dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    }).format(date);
  };

  Utils.getTodayStr = function () {
    return new Date().toISOString().split('T')[0];
  };

  Utils.getDaysAgoStr = function (days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };

  // ─── Validation ───
  Utils.validateRequired = function (value) {
    return typeof value === 'string' && value.trim().length > 0;
  };

  Utils.validateAmount = function (value) {
    var num = parseFloat(value);
    return !isNaN(num) && num > 0 && isFinite(num);
  };

  Utils.validateDate = function (value) {
    if (!value) return false;
    var date = new Date(value + 'T00:00:00');
    return !isNaN(date.getTime());
  };

  // ─── DOM Helpers ───
  Utils.createElement = function (tag, attrs, children) {
    attrs = attrs || {};
    children = children || [];
    var el = document.createElement(tag);

    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === 'className') {
        el.className = value;
      } else if (key === 'dataset') {
        Object.keys(value).forEach(function (dk) { el.dataset[dk] = value[dk]; });
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else {
        el.setAttribute(key, value);
      }
    });

    children.forEach(function (child) {
      if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });

    return el;
  };

  Utils.clearChildren = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  };

  Utils.debounce = function (fn, delay) {
    var timer;
    return function () {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, delay || 300);
    };
  };

  Utils.fileToBase64 = function (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  };

  Utils.sortData = function (data, key, direction) {
    direction = direction || 'asc';
    return data.slice().sort(function (a, b) {
      var v1 = a[key], v2 = b[key];
      if (v1 === undefined || v1 === null) v1 = '';
      if (v2 === undefined || v2 === null) v2 = '';
      if (typeof v1 === 'string') v1 = v1.toLowerCase();
      if (typeof v2 === 'string') v2 = v2.toLowerCase();
      if (v1 < v2) return direction === 'asc' ? -1 : 1;
      if (v1 > v2) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  Utils.downloadFile = function (data, filename, mimeType) {
    var blob = new Blob([data], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  BK.Utils = Utils;
})();
