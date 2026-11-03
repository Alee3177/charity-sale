/*
 * sales-ui.js
 * DOM wiring only. Pricing lives in pricing-engine.js, persistence in
 * stats-store.js, every visible string in ui-text.js.
 */
(function () {
  'use strict';

  var T = window.UI_TEXT;
  var Engine = window.PricingEngine;
  var CODES = ['A', 'B', 'C', 'D'];

  // Approved master images, shown as-is (never regenerated or edited).
  var MASTER_DIR = 'assets/';
  var IMG_PRODUCTS = '韓式泡菜義賣海報(A-B-C+單$only)_1102.png';
  var IMG_OFFERS = '韓食雙打愛心義賣菜單(0320版本母版_自改賣)_1102.png';

  var quantities = { A: 0, B: 0, C: 0, D: 0 };
  // Snapshot of the quantities that were last recorded by 測試送出 (null = none).
  // The order stays on screen after submit; this is what blocks a double record.
  var lastRecorded = null;
  var recordedMessageShown = false;
  var inputs = {};
  var storage = null;
  try { storage = window.localStorage; } catch (e) { storage = null; }
  var store = window.StatsStore.createStatsStore(storage || {
    getItem: function () { throw new Error('no storage'); },
    setItem: function () { throw new Error('no storage'); },
    removeItem: function () { throw new Error('no storage'); }
  });

  function $(id) { return document.getElementById(id); }

  function formatMoney(n) {
    var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-$' : '$') + s;
  }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (_, k) { return String(values[k]); });
  }

  function setMessage(text, isWarn) {
    var el = $('message');
    el.textContent = text;
    el.classList.toggle('warn', !!isWarn);
  }

  function quantityKey() {
    return CODES.map(function (c) { return quantities[c]; }).join(',');
  }

  function clampQty(v) {
    var n = parseInt(v, 10);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, Engine.MAX_QTY);
  }

  function hydrateStaticText() {
    document.title = T.pageTitle;
    Array.prototype.forEach.call(document.querySelectorAll('[data-text]'), function (el) {
      el.textContent = T[el.getAttribute('data-text')];
    });
    var list = $('steps-list');
    T.steps.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      list.appendChild(li);
    });
    $('info-dialog').setAttribute('aria-label', T.infoDialogLabel);
    $('info-dialog').removeAttribute('aria-labelledby');
    $('img-products').alt = T.imageAltProducts;
    $('img-offers').alt = T.imageAltOffers;
  }

  function buildProducts() {
    var wrap = $('products');
    CODES.forEach(function (code) {
      var p = T.products[code];
      var card = document.createElement('div');
      card.className = 'product';
      card.setAttribute('data-code', code);

      var badge = document.createElement('span');
      badge.className = 'code';
      badge.textContent = code;
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name;
      var price = document.createElement('span');
      price.className = 'price';
      price.textContent = p.price;
      var note = document.createElement('span');
      note.className = 'note';
      note.textContent = p.note;

      var qty = document.createElement('div');
      qty.className = 'qty';
      var minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = T.qtyMinusSign;
      minus.setAttribute('aria-label', code + ' ' + T.qtyDecrease);
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.value = '0';
      input.setAttribute('aria-label', code + ' ' + T.qtyInput);
      var plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = T.qtyPlusSign;
      plus.setAttribute('aria-label', code + ' ' + T.qtyIncrease);

      minus.addEventListener('click', function () { setQty(code, quantities[code] - 1); });
      plus.addEventListener('click', function () { setQty(code, quantities[code] + 1); });
      input.addEventListener('input', function () {
        var digits = input.value.replace(/[^0-9]/g, '');
        quantities[code] = clampQty(digits === '' ? 0 : digits);
        render(false);
      });
      input.addEventListener('blur', function () { input.value = String(quantities[code]); });
      input.addEventListener('focus', function () { input.select(); });

      inputs[code] = input;
      qty.appendChild(minus);
      qty.appendChild(input);
      qty.appendChild(plus);
      [badge, name, price, note, qty].forEach(function (el) { card.appendChild(el); });
      wrap.appendChild(card);
    });
  }

  function setQty(code, value) {
    quantities[code] = clampQty(value);
    render(true);
  }

  function renderOffers(pricing) {
    var list = $('offer-list');
    list.textContent = '';
    if (pricing.applied_offers.length === 0) {
      var none = document.createElement('li');
      none.className = 'none';
      none.textContent = T.noOffer;
      list.appendChild(none);
      return;
    }
    pricing.applied_offers.forEach(function (o) {
      var li = document.createElement('li');
      var combo = pricing.best_price_combo;
      if (combo && combo.promotion_id === o.id) {
        // A printed bundle that the system prices better: explanation only,
        // the one promotion actually applied is still o.id.
        li.textContent = fill(T.comboLine, {
          name: T.comboNames[combo.bundle_id],
          price: formatMoney(combo.effective_customer_price)
        });
      } else {
        li.textContent = fill(T.offerLine, {
          name: T.offerNames[o.id],
          times: o.times > 1 ? fill(T.offerTimes, { times: o.times }) : '',
          saving: formatMoney(o.saving)
        });
      }
      list.appendChild(li);
    });
  }

  // Informational only: no shipping fee is ever added to a total.
  function renderShipping(pricing) {
    var el = $('shipping-hint');
    var ok = !!(pricing.shipping && pricing.shipping.eligible);
    el.textContent = ok ? T.shippingEligible : T.shippingHint;
    el.classList.toggle('eligible', ok);
  }

  function renderStats() {
    var t = store.getTotals();
    $('stat-orders').textContent = String(t.order_count);
    CODES.forEach(function (c) { $('stat-' + c).textContent = String(t[c]); });
  }

  function render(syncInputs) {
    if (syncInputs) {
      CODES.forEach(function (c) { inputs[c].value = String(quantities[c]); });
    }
    var pricing = Engine.computePricing(quantities);
    $('original-value').textContent = formatMoney(pricing.original_total);
    $('discount-value').textContent = pricing.discount > 0 ? '-' + formatMoney(pricing.discount) : '$0';
    $('final-value').textContent = formatMoney(pricing.final_total);
    renderOffers(pricing);
    renderShipping(pricing);
    var alreadyRecorded = lastRecorded !== null && lastRecorded === quantityKey();
    $('submit-btn').disabled = pricing.original_total === 0 || alreadyRecorded;
    if (recordedMessageShown && !alreadyRecorded) {
      // the order on screen no longer matches what was recorded: do not leave a false claim
      setMessage('', false);
      recordedMessageShown = false;
    }
    renderStats();
    return pricing;
  }

  function onSubmit() {
    var pricing = Engine.computePricing(quantities);
    if (pricing.original_total === 0) {
      setMessage(T.msgEmpty, true);
      return;
    }
    if (lastRecorded !== null && lastRecorded === quantityKey()) return; // already recorded: no duplicate
    store.recordOrder(pricing);
    lastRecorded = quantityKey();
    render(false); // keep every quantity, price, offer and shipping hint on screen for the screenshot
    recordedMessageShown = true;
    if (store.isPersistent()) {
      setMessage(T.msgRecorded, false);
    } else {
      setMessage(T.msgRecorded + T.msgNoStorage, true);
    }
  }

  function onClear() {
    quantities = { A: 0, B: 0, C: 0, D: 0 };
    lastRecorded = null;
    render(true);
    recordedMessageShown = false;
    setMessage(T.msgCleared, false);
  }

  function onReset() {
    if (!window.confirm(T.confirmReset)) return;
    store.reset();
    lastRecorded = null;
    render(false);
    recordedMessageShown = false;
    setMessage(T.msgReset, false);
  }

  // Mobile only: the statistics block is collapsed by default (not persisted).
  // On desktop the toggle is hidden by CSS and the block is always visible.
  function toggleStats() {
    var section = document.querySelector('.stats');
    var open = !section.classList.contains('open');
    section.classList.toggle('open', open);
    $('stats-toggle').setAttribute('aria-expanded', String(open));
    $('stats-toggle').textContent = open ? T.statsCollapse : T.statsExpand;
  }

  // ---- reference image modal ----
  var lastFocus = null;

  function setImage(imgId, missingId, file) {
    var img = $(imgId);
    var missing = $(missingId);
    img.onerror = function () {
      img.hidden = true;
      missing.hidden = false;
      missing.textContent = T.imageMissing;
    };
    img.src = MASTER_DIR + encodeURIComponent(file).replace(/%28/g, '(').replace(/%29/g, ')');
  }

  function selectTab(which) {
    var products = which === 'products';
    $('tab-products').setAttribute('aria-selected', String(products));
    $('tab-offers').setAttribute('aria-selected', String(!products));
    $('panel-products').hidden = !products;
    $('panel-offers').hidden = products;
  }

  function openInfo() {
    lastFocus = document.activeElement;
    if (!$('img-products').getAttribute('src')) {
      setImage('img-products', 'missing-products', IMG_PRODUCTS);
      setImage('img-offers', 'missing-offers', IMG_OFFERS);
    }
    selectTab('products');
    $('info-overlay').hidden = false;
    $('close-btn').focus();
  }

  function closeInfo() {
    $('info-overlay').hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function init() {
    hydrateStaticText();
    buildProducts();
    $('submit-btn').addEventListener('click', onSubmit);
    $('clear-btn').addEventListener('click', onClear);
    $('reset-btn').addEventListener('click', onReset);
    $('stats-toggle').addEventListener('click', toggleStats);
    $('info-btn').addEventListener('click', openInfo);
    $('close-btn').addEventListener('click', closeInfo);
    $('tab-products').addEventListener('click', function () { selectTab('products'); });
    $('tab-offers').addEventListener('click', function () { selectTab('offers'); });
    $('info-overlay').addEventListener('click', function (e) {
      if (e.target === $('info-overlay')) closeInfo();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('info-overlay').hidden) closeInfo();
    });
    render(true);
    if (!store.isPersistent()) setMessage(T.msgNoStorage, true);
  }

  init();
})();
