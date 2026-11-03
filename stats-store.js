/*
 * stats-store.js
 * Local practice statistics (localStorage-backed; storage is injectable so
 * it can be tested in node). Never talks to any backend.
 *
 * Storage schema
 *   v1 (Sales Practice v0.1): { version:1, orders:[record] }
 *   v2 (Promotion Rule v0.2): { version:2, orders:[record], quarantine:[raw] }
 *   record adds: sales_mode, promotion_rule_version
 *
 * Backward compatibility (nothing is silently deleted):
 *   - v1 records load fine and are tagged promotion_rule_version "0.1"
 *     (they were priced with the old free-stacking rules) and sales_mode
 *     "CHARITY_BAZAAR". They are rewritten as v2 on the next save.
 *   - A record that cannot be understood goes to `quarantine` (kept, not
 *     counted) instead of being dropped.
 *   - A whole value that cannot be parsed, or has an unknown version, is
 *     copied to a *_unreadable_backup key before starting fresh.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StatsStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'charity_bazaar_2027_sales_practice_v1'; // key name kept for continuity
  var BACKUP_KEY = STORAGE_KEY + '_unreadable_backup';
  var SCHEMA_VERSION = 2;
  var LEGACY_RULE_VERSION = '0.1';
  var LEGACY_SALES_MODE = 'CHARITY_BAZAAR';

  function emptyState() {
    return { version: SCHEMA_VERSION, orders: [], quarantine: [] };
  }

  function isOrderRecord(o) {
    if (!o || typeof o !== 'object') return false;
    var keys = ['A_qty', 'B_qty', 'C_qty', 'D_qty', 'original_total', 'discount', 'final_total'];
    for (var i = 0; i < keys.length; i++) {
      if (typeof o[keys[i]] !== 'number' || !isFinite(o[keys[i]])) return false;
    }
    return typeof o.timestamp === 'string' && Array.isArray(o.applied_offers);
  }

  function migrateRecord(o) {
    var copy = {};
    Object.keys(o).forEach(function (k) { copy[k] = o[k]; });
    if (typeof copy.sales_mode !== 'string') copy.sales_mode = LEGACY_SALES_MODE;
    if (typeof copy.promotion_rule_version !== 'string') copy.promotion_rule_version = LEGACY_RULE_VERSION;
    return copy;
  }

  function computeTotals(orders) {
    var t = { order_count: orders.length, A: 0, B: 0, C: 0, D: 0 };
    orders.forEach(function (o) {
      t.A += o.A_qty;
      t.B += o.B_qty;
      t.C += o.C_qty;
      t.D += o.D_qty;
    });
    return t;
  }

  function createStatsStore(storage, now) {
    var clock = now || function () { return new Date(); };
    var state = emptyState();
    var persistent = true;
    var recovered = false; // true when an unreadable stored value was backed up

    function backupUnreadable(raw) {
      recovered = true;
      try {
        if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, raw);
      } catch (e) {
        persistent = false;
      }
    }

    function readFromStorage() {
      var raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (e) {
        persistent = false;
        return emptyState();
      }
      if (!raw) return emptyState();
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        backupUnreadable(raw);
        return emptyState();
      }
      if (!parsed || typeof parsed !== 'object' || (parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.orders)) {
        backupUnreadable(raw);
        return emptyState();
      }
      var next = emptyState();
      parsed.orders.forEach(function (o) {
        if (isOrderRecord(o)) next.orders.push(migrateRecord(o));
        else next.quarantine.push(o);
      });
      if (parsed.version === 2 && Array.isArray(parsed.quarantine)) {
        next.quarantine = parsed.quarantine.concat(next.quarantine);
      }
      return next;
    }

    function write() {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        persistent = false;
      }
    }

    state = readFromStorage();

    return {
      recordOrder: function (pricing) {
        var q = pricing.quantities;
        var record = {
          timestamp: clock().toISOString(),
          sales_mode: pricing.sales_mode,
          promotion_rule_version: pricing.promotion_rule_version,
          A_qty: q.A,
          B_qty: q.B,
          C_qty: q.C,
          D_qty: q.D,
          original_total: pricing.original_total,
          discount: pricing.discount,
          final_total: pricing.final_total,
          applied_offers: pricing.applied_offers.map(function (o) {
            return { id: o.id, times: o.times, saving: o.saving };
          })
        };
        state.orders.push(record);
        write();
        return record;
      },
      reset: function () {
        state = emptyState();
        try {
          storage.removeItem(STORAGE_KEY);
        } catch (e) {
          persistent = false;
        }
      },
      getTotals: function () { return computeTotals(state.orders); },
      getOrders: function () { return state.orders.slice(); },
      getQuarantine: function () { return state.quarantine.slice(); },
      wasRecovered: function () { return recovered; },
      isPersistent: function () { return persistent; }
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    BACKUP_KEY: BACKUP_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    createStatsStore: createStatsStore,
    computeTotals: computeTotals
  };
});
