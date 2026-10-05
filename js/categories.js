"use strict";

/**
 * Categories Controller
 * Handles logic for managing custom transaction categories.
 */

var BK = window.BK || {};

(function () {
  var U = BK.Utils;
  var Toast = BK.Toast;
  var Modal = BK.ModalManager;
  var CDB = BK.CategoriesDB;

  function CategoriesController() {
    this.editingId = null;
  }

  CategoriesController.prototype.init = function () {
    var self = this;
    var form = document.getElementById('category-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        self.saveCategory();
      });
    }

    var addBtn = document.getElementById('btn-add-category');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        self.showForm();
      });
    }
  };

  CategoriesController.prototype.render = function () {
    var self = this;
    return CDB.getAll().then(function (categories) {
      var tbody = document.getElementById('categories-tbody');
      if (!tbody) return;
      U.clearChildren(tbody);

      if (categories.length === 0) {
        tbody.appendChild(U.createElement('tr', {}, [
          U.createElement('td', { colSpan: '4' }, [
            U.createElement('div', { className: 'table-empty', style: { padding: '40px 20px' } }, [
              U.createElement('i', { className: 'fas fa-tags', style: { fontSize: '40px', color: 'var(--primary)', opacity: '0.4' } }),
              U.createElement('p', { style: { fontWeight: '600' } }, ['No categories created yet']),
              U.createElement('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' } }, ['Custom categories help you understand your spending habits.']),
              U.createElement('button', { className: 'btn btn-primary btn-sm', onClick: function() { self.showForm(); } }, [
                U.createElement('i', { className: 'fas fa-plus' }), ' Add First Category'
              ])
            ])
          ])
        ]));
        return;
      }

      var now = new Date();
      var firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      
      return BK.TransactionsDB.getAll().then(function(txns) {
        var spentByCat = {};
        txns.forEach(function(t) {
          if (t.type === 'debit' && t.date >= firstDay && t.categoryId) {
            spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount;
          }
        });

        categories.forEach(function (cat) {
          var spent = spentByCat[cat.id] || 0;
          var budgetCol = U.createElement('td', {});
          
          if (cat.type === 'expense' && cat.monthlyBudget > 0) {
            var percent = Math.min(100, Math.round((spent / cat.monthlyBudget) * 100));
            var barColor = percent > 90 ? 'var(--danger)' : (percent > 75 ? 'var(--warning)' : 'var(--primary)');
            budgetCol.appendChild(U.createElement('div', { style: { fontSize: '11px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' } }, [
              U.createElement('span', {}, [U.formatCurrency(spent) + ' spent']),
              U.createElement('span', { className: 'text-muted' }, ['of ' + U.formatCurrency(cat.monthlyBudget)])
            ]));
            budgetCol.appendChild(U.createElement('div', { style: { height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' } }, [
              U.createElement('div', { style: { width: percent + '%', height: '100%', background: barColor, borderRadius: '3px' } })
            ]));
          } else {
            budgetCol.appendChild(U.createElement('span', { className: 'text-muted', style: { fontSize: '12px' } }, ['No limit set']));
          }

          var row = U.createElement('tr', {}, [
            U.createElement('td', { style: { fontWeight: '600' } }, [cat.name]),
            U.createElement('td', {}, [
              U.createElement('span', { className: 'badge ' + (cat.type === 'income' ? 'badge-credit' : 'badge-debit') }, [
                cat.type.charAt(0).toUpperCase() + cat.type.slice(1)
              ])
            ]),
            U.createElement('td', {}, [
              U.createElement('div', { 
                style: { 
                  width: '24px', 
                  height: '24px', 
                  borderRadius: 'var(--radius-sm)', 
                  backgroundColor: cat.color,
                  border: '1px solid var(--border-color)'
                } 
              })
            ]),
            budgetCol,
            U.createElement('td', {}, [
              U.createElement('div', { className: 'action-btns' }, [
                U.createElement('button', { 
                  className: 'btn btn-icon btn-ghost', 
                  title: 'Edit', 
                  onClick: function () { self.showForm(cat); } 
                }, [U.createElement('i', { className: 'fas fa-pen' })]),
                U.createElement('button', { 
                  className: 'btn btn-icon btn-ghost text-danger', 
                  title: 'Delete', 
                  onClick: function () { self.deleteCategory(cat.id); } 
                }, [U.createElement('i', { className: 'fas fa-trash-alt' })])
              ])
            ])
          ]);
          tbody.appendChild(row);
        });
      });
    });
  };

  CategoriesController.prototype.showForm = function (cat) {
    this.editingId = cat ? cat.id : null;
    var title = document.getElementById('category-modal-title');
    var nameInput = document.getElementById('cat-name');
    var typeInput = document.getElementById('cat-type');
    var colorInput = document.getElementById('cat-color');
    var budgetInput = document.getElementById('cat-budget');

    if (title) title.textContent = cat ? 'Edit Category' : 'New Category';
    if (nameInput) nameInput.value = cat ? cat.name : '';
    if (typeInput) typeInput.value = cat ? cat.type : 'expense';
    if (colorInput) colorInput.value = cat ? cat.color : '#3b82f6';
    if (budgetInput) budgetInput.value = cat && cat.monthlyBudget ? cat.monthlyBudget : '';

    // Show budget field only if type is 'expense'
    var budgetGroup = document.getElementById('budget-group');
    if (budgetGroup) {
      budgetGroup.style.display = typeInput && typeInput.value === 'expense' ? 'block' : 'none';
      if (typeInput) {
        typeInput.onchange = function() {
          budgetGroup.style.display = this.value === 'expense' ? 'block' : 'none';
        };
      }
    }

    Modal.open('modal-category');
  };

  CategoriesController.prototype.saveCategory = function () {
    var self = this;
    var nameInput = document.getElementById('cat-name');
    var typeInput = document.getElementById('cat-type');
    var colorInput = document.getElementById('cat-color');
    var budgetInput = document.getElementById('cat-budget');

    var name = nameInput.value.trim();
    var type = typeInput.value;
    var color = colorInput.value;
    var budget = budgetInput && type === 'expense' ? budgetInput.value.trim() : 0;

    if (!name) {
      Toast.warning('Category name is required.');
      return;
    }

    var data = { name: name, type: type, color: color, monthlyBudget: parseFloat(budget) || 0 };
    var action = self.editingId ? CDB.update(self.editingId, data) : CDB.add(data);

    action.then(function () {
      Toast.success(self.editingId ? 'Category updated.' : 'Category added.');
      Modal.close('modal-category');
      self.render();
      window.dispatchEvent(new CustomEvent('categories-updated'));
    }).catch(function (err) {
      Toast.error('Failed to save category: ' + err.message);
    });
  };

  CategoriesController.prototype.deleteCategory = function (id) {
    var self = this;
    Modal.confirm('Delete Category', 'Are you sure? Transactions using this category will be un-categorized.', 'danger')
      .then(function (confirmed) {
        if (!confirmed) return;
        return CDB.delete(id).then(function () {
          Toast.success('Category deleted.');
          self.render();
          window.dispatchEvent(new CustomEvent('categories-updated'));
        });
      }).catch(function (err) {
        Toast.error('Failed to delete: ' + err.message);
      });
  };

  CategoriesController.prototype.renderOptions = function (selectEl, selectedId) {
    U.clearChildren(selectEl);
    selectEl.appendChild(U.createElement('option', { value: '' }, ['None']));
    
    return CDB.getAll().then(function (categories) {
      categories.forEach(function (cat) {
        var opt = U.createElement('option', { value: cat.id }, [cat.name + ' (' + cat.type + ')']);
        if (selectedId && selectedId === cat.id) opt.selected = true;
        selectEl.appendChild(opt);
      });
    });
  };

  BK.CategoriesController = CategoriesController;
})();
