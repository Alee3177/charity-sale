/*
 * ui-text.js
 * The single source of every user-visible string (Traditional Chinese).
 * Visible-language rules: no unnecessary English UI wording, no Simplified
 * Chinese. A/B/C/D product codes and unit specs such as 480g are allowed.
 * tests/visible-language.test.js scans this file and index.html.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UI_TEXT = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    pageTitle: '2027 義賣｜銷售操作測試版',
    badge: '測試模式｜不產生正式訂單・不影響庫存',

    stepsTitle: '操作步驟',
    steps: [
      '輸入 A／B／C／D 數量',
      '系統自動套用最佳優惠',
      '確認紅字「應收總額」',
      '按「測試送出」累計統計'
    ],

    stepsCompact: '輸入數量 → 自動優惠 → 確認應收 → 測試送出',

    products: {
      A: { name: '韓式切片泡菜', price: '$250／罐', note: '480g±10g／罐' },
      B: { name: '韓式蘿蔔泡菜', price: '$250／罐', note: '480g±10g／罐' },
      C: { name: '袋裝炒年糕', price: '$125／包', note: '330g／包・冷藏' },
      D: { name: '現場炒年糕', price: '$150／盒', note: '1/16 現場商品' }
    },
    qtyDecrease: '減少數量',
    qtyIncrease: '增加數量',
    qtyInput: '數量',
    qtyMinusSign: '－',
    qtyPlusSign: '＋',

    originalLabel: '商品原價',
    discountLabel: '系統優惠',
    finalLabel: '應收總額',
    noOffer: '目前沒有適用的優惠',
    // Customer-facing names. Keys are internal promotion ids and never shown.
    offerNames: {
      P1: '泡菜任選3罐優惠',
      P2: '3罐泡菜＋3包年糕優惠',
      P3: '7罐泡菜＋7包年糕優惠',
      R3: '袋裝炒年糕3包優惠',
      R4: '韓食雙打1',
      R5: '韓食雙打2'
    },
    offerTimes: ' × {times}',
    offerLine: '{name}{times}｜省 {saving}',
    // Printed bundles that are priced better by the system (explanation only).
    comboNames: {
      R6: '韓食雙打1＋袋裝炒年糕',
      R7: '韓食雙打2＋袋裝炒年糕'
    },
    comboLine: '{name}｜系統最適價 {price}',
    policyNote: '愛心義賣優惠不得併用，系統已自動套用本單最適優惠。',
    shippingHint: '免運提示：低溫商品優惠後滿 $2,500 享免運（不含現場炒年糕；本測試不計運費）',
    shippingEligible: '✔ 符合低溫配送免運門檻（不含現場炒年糕；本測試不計運費）',
    flowNote: '組員流程：輸入數量 → 截圖給客人確認 → 人工回報 A／B／C／D 數量。這不是正式訂單。',

    statsTitle: '本機測試統計（僅供練習）',
    statsExpand: '查看測試統計',
    statsCollapse: '收合測試統計',
    statsOrders: '測試訂單',
    statsA: 'A 累計',
    statsB: 'B 累計',
    statsC: 'C 累計',
    statsD: 'D 累計',

    submitButton: '測試送出',
    clearButton: '清空本單',
    resetButton: '重設統計',

    msgEmpty: '本單沒有商品，請先輸入數量。',
    msgRecorded: '已記錄第 {n} 筆測試紀錄，僅存在本機；這不是正式訂單，不影響庫存。',
    msgCleared: '已清空本單。',
    msgReset: '已重設測試統計。',
    msgNoStorage: '此瀏覽器無法保存統計，重新整理後資料會消失。',
    confirmReset: '確定要重設統計嗎？測試歷史與累計都會被清除，且無法復原。',

    infoButton: '📖 查看商品／優惠資訊',
    infoButtonShort: '📖 商品／優惠資訊',
    infoDialogLabel: '商品與優惠資訊',
    tabProducts: '商品資訊',
    tabOffers: '優惠／組合母版',
    closeButton: '關閉',
    imageAltProducts: '商品資訊母版圖片（已核准）',
    imageAltOffers: '優惠／組合母版圖片（已核准）',
    imageMissing: '找不到母版圖片檔案。',
    offerNotice: '本測試版每單只套用一個最適優惠；母版上愛心組價格若高於系統最適價，以系統最適價為準。'
  };
});
