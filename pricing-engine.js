/*
 * pricing-engine.js  (Promotion Rule v0.2)
 * Pure pricing logic: no DOM, no storage, no I/O.
 *
 * The engine knows nothing about any specific promotion or sales mode.
 * It reads PRODUCTS / PROMOTIONS from promotion-catalog.js and lets the
 * PROMOTION_POLICY decide how offers may combine:
 *
 *   allow_same_offer_repeat   allow_cross_offer_stacking   behaviour
 *   false                     false                        CHARITY_BAZAAR: one offer, once
 *   true                      false                        one offer type, repeated (reserved)
 *   false                     true                         each offer at most once, combinable
 *   true                      true                         not implemented (throws)
 *
 * Whatever the policy, the engine compares every legal plan and takes the
 * lowest customer total. Units left over after an offer are charged at the
 * regular unit price (that is NOT stacking). Ties on the total only affect
 * which promotion is shown: the larger published bundle wins the tie, and a
 * higher price is never chosen because of a tie.
 *
 * Shipping eligibility is informational: no shipping fee is added to any
 * total here.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./promotion-catalog.js'));
  } else {
    root.PricingEngine = factory(root.PromotionCatalog);
  }
})(typeof self !== 'undefined' ? self : this, function (Catalog) {
  'use strict';

  var MAX_QTY = 999;
  var CODES = ['A', 'B', 'C', 'D'];

  function normalizeQuantities(input) {
    var out = {};
    CODES.forEach(function (k) {
      var v = input && input[k] !== undefined ? input[k] : 0;
      if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 0 || v > MAX_QTY) {
        throw new RangeError('quantity ' + k + ' must be an integer between 0 and ' + MAX_QTY);
      }
      out[k] = v;
    });
    return out;
  }

  function need(r) {
    return { a: r.a || 0, b: r.b || 0, c: r.c || 0, d: r.d || 0, flex: (r.ab || 0) + (r.a || 0) + (r.b || 0) };
  }

  // Can every (promotion x times) in `uses` be satisfied at the same time
  // from basket q, without any unit serving two offer applications?
  function feasible(uses, q) {
    var t = { a: 0, b: 0, c: 0, d: 0, flex: 0 };
    uses.forEach(function (u) {
      var n = need(u.promo.requirements);
      t.a += n.a * u.times; t.b += n.b * u.times; t.c += n.c * u.times; t.d += n.d * u.times; t.flex += n.flex * u.times;
    });
    return t.a <= q.A && t.b <= q.B && t.c <= q.C && t.d <= q.D && t.flex <= q.A + q.B;
  }

  function maxTimes(promo, q) {
    var n = need(promo.requirements);
    var t = Infinity;
    if (n.a) t = Math.min(t, Math.floor(q.A / n.a));
    if (n.b) t = Math.min(t, Math.floor(q.B / n.b));
    if (n.c) t = Math.min(t, Math.floor(q.C / n.c));
    if (n.d) t = Math.min(t, Math.floor(q.D / n.d));
    if (n.flex) t = Math.min(t, Math.floor((q.A + q.B) / n.flex));
    return t === Infinity ? 0 : t;
  }

  function plansFor(policy, candidates, q) {
    var repeat = !!policy.allow_same_offer_repeat;
    var stack = !!policy.allow_cross_offer_stacking;
    var plans = [[]]; // the all-regular-price plan is always legal
    if (repeat && stack) {
      throw new Error('UNSUPPORTED_POLICY: repeat + cross stacking is not implemented');
    }
    if (!repeat && !stack) {
      candidates.forEach(function (p) { if (maxTimes(p, q) >= 1) plans.push([{ promo: p, times: 1 }]); });
    } else if (repeat && !stack) {
      candidates.forEach(function (p) { var t = maxTimes(p, q); if (t >= 1) plans.push([{ promo: p, times: t }]); });
    } else {
      for (var mask = 1; mask < (1 << candidates.length); mask++) {
        var uses = [];
        for (var i = 0; i < candidates.length; i++) if (mask & (1 << i)) uses.push({ promo: candidates[i], times: 1 });
        if (feasible(uses, q)) plans.push(uses);
      }
    }
    return plans;
  }

  function planSaving(plan) {
    return plan.reduce(function (s, u) { return s + u.promo.discount * u.times; }, 0);
  }

  // Better plan = bigger saving (lower total). Exact ties: larger published
  // bundle first, then more units covered, then catalog order. Deterministic.
  function comparePlans(order) {
    function key(plan) {
      var maxUnits = 0, units = 0, idx = [];
      plan.forEach(function (u) {
        maxUnits = Math.max(maxUnits, u.promo.units);
        units += u.promo.units * u.times;
        idx.push(order.indexOf(u.promo.id));
      });
      return { saving: planSaving(plan), maxUnits: maxUnits, units: units, idx: idx };
    }
    return function (x, y) {
      var a = key(x), b = key(y);
      if (a.saving !== b.saving) return b.saving - a.saving;
      if (a.maxUnits !== b.maxUnits) return b.maxUnits - a.maxUnits;
      if (a.units !== b.units) return b.units - a.units;
      for (var i = 0; i < Math.max(a.idx.length, b.idx.length); i++) {
        var p = a.idx[i] === undefined ? -1 : a.idx[i];
        var r = b.idx[i] === undefined ? -1 : b.idx[i];
        if (p !== r) return p - r;
      }
      return 0;
    };
  }

  function leftoverAfter(plan, q) {
    var left = { A: q.A, B: q.B, C: q.C, D: q.D };
    plan.forEach(function (u) {
      var r = u.promo.requirements;
      left.A -= (r.a || 0) * u.times; left.B -= (r.b || 0) * u.times;
      left.C -= (r.c || 0) * u.times; left.D -= (r.d || 0) * u.times;
      var flex = (r.ab || 0) * u.times; // A-or-B units: take from A first, then B
      var fromA = Math.min(flex, left.A);
      left.A -= fromA; left.B -= flex - fromA;
    });
    return left;
  }

  function sameComposition(r, q) {
    return !r.ab && q.A === (r.a || 0) && q.B === (r.b || 0) && q.C === (r.c || 0) && q.D === (r.d || 0);
  }

  /**
   * @param {{A?:number,B?:number,C?:number,D?:number}} input
   * @param {{mode?:string, policy?:object, catalog?:object}} [opts]
   *        `policy` / `catalog` overrides exist for tests and future modes.
   */
  function computePricing(input, opts) {
    opts = opts || {};
    var cat = opts.catalog || Catalog;
    var mode = opts.mode || cat.DEFAULT_MODE;
    var policy = opts.policy || cat.POLICIES[mode];
    if (!policy) throw new Error('UNKNOWN_SALES_MODE: ' + mode);
    if (policy.implemented === false) throw new Error('SALES_MODE_NOT_IMPLEMENTED: ' + mode);

    var q = normalizeQuantities(input);
    var order = cat.PROMOTIONS.map(function (p) { return p.id; });
    var candidates = cat.PROMOTIONS.filter(function (p) {
      return p.activePricingCandidate && p.modes.indexOf(mode) !== -1;
    });

    var original = 0;
    CODES.forEach(function (c) { original += q[c] * cat.PRODUCTS[c].regularPrice; });

    var plans = plansFor(policy, candidates, q);
    plans.sort(comparePlans(order));
    var plan = plans[0];
    var discount = planSaving(plan);
    var finalTotal = original - discount;

    var applied = plan.map(function (u) {
      return {
        id: u.promo.id,
        times: u.times,
        original_each: u.promo.originalPrice,
        price_each: u.promo.publishedPrice,
        saving_each: u.promo.discount,
        saving: u.promo.discount * u.times
      };
    });

    var left = leftoverAfter(plan, q);
    var leftValue = 0;
    CODES.forEach(function (c) { leftValue += left[c] * cat.PRODUCTS[c].regularPrice; });

    // Audit trace for printed bundles that the engine prices better (e.g. R6/R7).
    var combo = null;
    if (plan.length === 1 && plan[0].times === 1) {
      cat.PROMOTIONS.forEach(function (p) {
        if (p.status === 'PUBLISHED_SUPERSEDED' && p.modes.indexOf(mode) !== -1 &&
            p.supersededBy.promotionId === plan[0].promo.id && sameComposition(p.requirements, q)) {
          combo = {
            bundle_id: p.id,
            promotion_id: plan[0].promo.id,
            published_price: p.publishedPrice,
            effective_customer_price: finalTotal,
            reason: p.supersededBy.reason
          };
        }
      });
    }

    var shipping = null;
    if (policy.shipping) {
      var nonShippable = 0;
      CODES.forEach(function (c) { if (!cat.PRODUCTS[c].shippable) nonShippable += q[c] * cat.PRODUCTS[c].regularPrice; });
      var eligibleAmount = Math.max(0, finalTotal - nonShippable);
      shipping = {
        threshold: policy.shipping.thresholdAmount,
        eligible_amount: eligibleAmount,
        eligible: eligibleAmount >= policy.shipping.thresholdAmount
      };
    }

    return {
      sales_mode: mode,
      promotion_rule_version: cat.RULE_VERSION,
      policy: {
        allow_same_offer_repeat: !!policy.allow_same_offer_repeat,
        allow_cross_offer_stacking: !!policy.allow_cross_offer_stacking
      },
      quantities: q,
      original_total: original,
      discount: discount,
      final_total: finalTotal,
      applied_offers: applied,
      leftover: left,
      leftover_value: leftValue,
      best_price_combo: combo,
      shipping: shipping
    };
  }

  return {
    MAX_QTY: MAX_QTY,
    normalizeQuantities: normalizeQuantities,
    computePricing: computePricing
  };
});
