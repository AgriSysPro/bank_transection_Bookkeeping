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

      categories.forEach(function (cat) {
        var row = U.createElement('tr', {}, [
          U.createElement('td', { style: { fontWeight: '600' } }, [U.escapeHtml(cat.name)]),
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
                borderRadius: '4px', 
                backgroundColor: cat.color,
                border: '1px solid var(--border-color)'
              } 
            })
          ]),
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
  };

  CategoriesController.prototype.showForm = function (cat) {
    this.editingId = cat ? cat.id : null;
    var title = document.getElementById('category-modal-title');
    var nameInput = document.getElementById('cat-name');
    var typeInput = document.getElementById('cat-type');
    var colorInput = document.getElementById('cat-color');

    if (title) title.textContent = cat ? 'Edit Category' : 'New Category';
    if (nameInput) nameInput.value = cat ? cat.name : '';
    if (typeInput) typeInput.value = cat ? cat.type : 'expense';
    if (colorInput) colorInput.value = cat ? cat.color : '#3b82f6';

    Modal.open('modal-category');
  };

  CategoriesController.prototype.saveCategory = function () {
    var self = this;
    var nameInput = document.getElementById('cat-name');
    var typeInput = document.getElementById('cat-type');
    var colorInput = document.getElementById('cat-color');

    var name = nameInput.value.trim();
    var type = typeInput.value;
    var color = colorInput.value;

    if (!name) {
      Toast.warning('Category name is required.');
      return;
    }

    var data = { name: name, type: type, color: color };
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
