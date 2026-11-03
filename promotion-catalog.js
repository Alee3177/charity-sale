/*
 * promotion-catalog.js  (Promotion Rule v0.2, FROZEN)
 *
 * Three layers, kept apart on purpose:
 *   PRODUCTS         what is sold (regular price, metadata)
 *   PROMOTIONS       what is offered (requirements, published price, status)
 *   PROMOTION_POLICY how offers may combine for a sales mode
 *
 * A promotion never decides stacking. Only the policy does. These are
 * INTERNAL identifiers; none of them is ever shown to staff or customers
 * (ui-text.js maps them to natural Traditional Chinese).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PromotionCatalog = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RULE_VERSION = '0.2';
  var DEFAULT_MODE = 'CHARITY_BAZAAR';

  // ---------------------------------------------------------------- PRODUCTS
  var PRODUCTS = Object.freeze({
    A: Object.freeze({ code: 'A', regularPrice: 250, shippable: true, spec: Object.freeze({ weightG: 480, toleranceG: 10, storage: 'cold' }) }),
    B: Object.freeze({ code: 'B', regularPrice: 250, shippable: true, spec: Object.freeze({ weightG: 480, toleranceG: 10, storage: 'cold' }) }),
    C: Object.freeze({ code: 'C', regularPrice: 125, shippable: true, spec: Object.freeze({ weightG: 330, storage: 'cold' }) }),
    // On-site cooked product for 2027-01-16: never part of cold-chain shipping.
    D: Object.freeze({ code: 'D', regularPrice: 150, shippable: false, spec: Object.freeze({ onSiteDate: '2027-01-16' }) })
  });

  // ------------------------------------------------------------- PROMOTIONS
  // requirements: ab = units that may be A or B (any mix); a / b = that exact
  // product; c / d likewise. status:
  //   ACTIVE                       published or approved and priced by the engine
  //   PUBLISHED_SUPERSEDED         printed/published, kept for audit, NOT priced
  function promo(def) {
    var r = def.requirements;
    def.units = (r.ab || 0) + (r.a || 0) + (r.b || 0) + (r.c || 0) + (r.d || 0);
    def.originalPrice = (r.ab || 0) * 250 + (r.a || 0) * 250 + (r.b || 0) * 250 + (r.c || 0) * 125 + (r.d || 0) * 150;
    def.discount = def.originalPrice - def.publishedPrice;
    def.activePricingCandidate = def.status === 'ACTIVE';
    return Object.freeze(def);
  }

  var PROMOTIONS = Object.freeze([
    promo({ id: 'P1', requirements: { ab: 3 }, publishedPrice: 700, status: 'ACTIVE', source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'] }),
    promo({ id: 'P2', requirements: { ab: 3, c: 3 }, publishedPrice: 1000, status: 'ACTIVE', source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'] }),
    // Published by DM: MUST HONOR. Not deletable, price not editable. Charity mode only.
    promo({ id: 'P3', requirements: { ab: 7, c: 7 }, publishedPrice: 2500, status: 'ACTIVE', source: 'PUBLISHED_DM', mustHonor: true, modes: ['CHARITY_BAZAAR'] }),
    promo({ id: 'R3', requirements: { c: 3 }, publishedPrice: 350, status: 'ACTIVE', source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'] }),
    promo({ id: 'R4', requirements: { a: 1, d: 1 }, publishedPrice: 350, status: 'ACTIVE', source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'] }),
    promo({ id: 'R5', requirements: { b: 1, d: 1 }, publishedPrice: 350, status: 'ACTIVE', source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'] }),
    // OPTION C: printed at $500 but beaten by (R4|R5) + one C at regular price ($475).
    // That is ONE offer plus a leftover item at regular price, not stacking.
    promo({
      id: 'R6', requirements: { a: 1, c: 1, d: 1 }, publishedPrice: 500, status: 'PUBLISHED_SUPERSEDED',
      source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'],
      supersededBy: Object.freeze({
        promotionId: 'R4', plusRegular: Object.freeze({ C: 1 }),
        reason: 'better legal price from R4/R5 + C1 at regular unit price',
        dependency: 'valid only while R4/R5 price + C1 regular price < published_price; re-audit if R4/R5 or C1 price changes or R4/R5 is removed'
      })
    }),
    promo({
      id: 'R7', requirements: { b: 1, c: 1, d: 1 }, publishedPrice: 500, status: 'PUBLISHED_SUPERSEDED',
      source: 'APPROVED_MASTER', modes: ['CHARITY_BAZAAR'],
      supersededBy: Object.freeze({
        promotionId: 'R5', plusRegular: Object.freeze({ C: 1 }),
        reason: 'better legal price from R4/R5 + C1 at regular unit price',
        dependency: 'valid only while R4/R5 price + C1 regular price < published_price; re-audit if R4/R5 or C1 price changes or R4/R5 is removed'
      })
    })
  ]);

  // -------------------------------------------------------- PROMOTION_POLICY
  var POLICIES = Object.freeze({
    CHARITY_BAZAAR: Object.freeze({
      mode: 'CHARITY_BAZAAR',
      implemented: true,
      allow_same_offer_repeat: false,
      allow_cross_offer_stacking: false,
      shipping: Object.freeze({
        thresholdAmount: 2500,
        // After-discount amount of cold-chain shippable items only (D excluded).
        basis: 'AFTER_DISCOUNT_SHIPPABLE_ITEMS'
      })
    }),
    // Reserved for the future only. No prices or rules are defined here.
    REGULAR_GROUP_BUY: Object.freeze({
      mode: 'REGULAR_GROUP_BUY',
      implemented: false
    })
  });

  // Re-checks the dependency recorded on every superseded promotion.
  function auditSuperseded() {
    return PROMOTIONS.filter(function (p) { return p.status === 'PUBLISHED_SUPERSEDED'; }).map(function (p) {
      var by = PROMOTIONS.filter(function (x) { return x.id === p.supersededBy.promotionId; })[0];
      var extra = 0;
      Object.keys(p.supersededBy.plusRegular).forEach(function (code) {
        extra += PRODUCTS[code].regularPrice * p.supersededBy.plusRegular[code];
      });
      var effective = by.publishedPrice + extra;
      return {
        promotion_id: p.id,
        published_price: p.publishedPrice,
        effective_customer_price: effective,
        superseded_by: by.id,
        reason: p.supersededBy.reason,
        ok: by.status === 'ACTIVE' && effective < p.publishedPrice
      };
    });
  }

  return {
    RULE_VERSION: RULE_VERSION,
    DEFAULT_MODE: DEFAULT_MODE,
    PRODUCTS: PRODUCTS,
    PROMOTIONS: PROMOTIONS,
    POLICIES: POLICIES,
    auditSuperseded: auditSuperseded
  };
});
