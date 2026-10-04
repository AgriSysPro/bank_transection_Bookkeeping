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

  // Stored text stays raw. Values are only ever inserted via createTextNode,
  // which escapes on its own, so escaping here would corrupt the data at rest.
  Utils.sanitize = function (str) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/\s+/g, ' ');
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

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Local calendar date. toISOString() reports UTC, which lands on the previous
  // day for every timezone ahead of UTC during the first hours after midnight.
  Utils.toDateStr = function (date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  };

  Utils.getTodayStr = function () {
    return Utils.toDateStr(new Date());
  };

  Utils.getDaysAgoStr = function (days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return Utils.toDateStr(d);
  };

  // Accepts the layouts banks export: YYYY-MM-DD, D/M/YYYY, D-M-YY, D.M.YYYY.
  // Anything not year-first is read day-first, matching the CSV importer's
  // original assumption. Returns a zero-padded YYYY-MM-DD, or null if unusable.
  Utils.normaliseDate = function (input) {
    if (input === null || input === undefined) return null;
    var parts = String(input).trim().split(/[\/\-.]/);
    if (parts.length !== 3) return null;
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return null;
    }

    var y, m, d;
    if (parts[0].length === 4) {
      y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
    } else {
      d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
      if (parts[2].length === 2) y += (y < 70 ? 2000 : 1900);
    }

    if (!y || !m || !d || y < 1000 || y > 9999 || m > 12 || d > 31) return null;

    // Reject days the calendar does not have, e.g. 31/02 rolling into March.
    var probe = new Date(y, m - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;

    return y + '-' + pad2(m) + '-' + pad2(d);
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

  Utils.parseEml = function (rawText) {
    var lines = rawText.split(/\r?\n/);
    var headers = {};
    var bodyRaw = [];
    var isHeader = true;

    // Helper for Quoted-Printable decoding
    function decodeQP(str) {
      return str.replace(/=([\r\n]{1,2})/g, '').replace(/=([0-9A-F]{2})/gi, function (match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
      });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isHeader) {
        if (line.trim() === '') { isHeader = false; } 
        else {
          var match = line.match(/^([a-zA-Z0-9-]+):\s*(.*)$/i);
          if (match) {
            headers[match[1].toLowerCase()] = match[2];
          }
        }
      } else {
        bodyRaw.push(line);
      }
    }

    var contentType = headers['content-type'] || '';
    var bodyStr = bodyRaw.join('\n');
    var finalBody = '';
    var isHtml = false;

    if (contentType.toLowerCase().includes('multipart/')) {
      var boundaryMatch = contentType.match(/boundary="?([^"; ]+)"?/i);
      if (boundaryMatch) {
        var boundary = boundaryMatch[1];
        var parts = bodyStr.split('--' + boundary);
        
        // Try to find HTML part first, then plain text
        var htmlPart = '', textPart = '';

        for (var j = 0; j < parts.length; j++) {
          var part = parts[j];
          if (!part || part.trim() === '--' || part.trim() === '') continue;

          // Split headers and body of the part (separated by double newline)
          var partSplit = part.split(/\r?\n\r?\n/);
          if (partSplit.length < 2) {
             // Try single newline fallback if double failed (unlikely for valid MIME)
             partSplit = part.split(/\n\s*\n/);
          }
          
          var pHeadersRaw = partSplit[0];
          var pBody = partSplit.slice(1).join('\n\n').trim();

          var pHeaders = {};
          pHeadersRaw.split(/\r?\n/).forEach(function(hLine) {
            var hMatch = hLine.match(/^([a-zA-Z0-9-]+):\s*(.*)$/i);
            if (hMatch) pHeaders[hMatch[1].toLowerCase()] = hMatch[2];
          });

          var pType = pHeaders['content-type'] || '';
          var pEnc = pHeaders['content-transfer-encoding'] || '';
          
          var decodedPart = pEnc.toLowerCase().includes('quoted-printable') ? decodeQP(pBody) : pBody;

          if (pType.includes('text/html')) htmlPart = decodedPart;
          else if (pType.includes('text/plain')) textPart = decodedPart;
        }
        
        if (htmlPart) { finalBody = htmlPart; isHtml = true; }
        else { finalBody = textPart; }
      }
    }

    if (!finalBody) {
      // Fallback for non-multipart
      var enc = headers['content-transfer-encoding'] || '';
      finalBody = enc.toLowerCase().includes('quoted-printable') ? decodeQP(bodyStr) : bodyStr;
      if (contentType.includes('text/html')) isHtml = true;
    }

    return {
      subject: headers['subject'] || '(No Subject)',
      from: headers['from'] || '(Unknown Sender)',
      date: headers['date'] || '',
      body: finalBody.trim(),
      isHtml: isHtml
    };
  };

  BK.Utils = Utils;
})();
