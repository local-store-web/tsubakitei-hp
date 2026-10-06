/* Price fields only: keep ordinary text such as 150円 untouched. */
(function (root) {
  function formatPriceText(value) {
    return String(value == null ? "" : value).replace(/[¥￥]/g, "");
  }
  root.TsubakiteiPrice = { formatPriceText: formatPriceText };
  if (typeof module !== "undefined" && module.exports) module.exports = { formatPriceText: formatPriceText };
})(typeof window !== "undefined" ? window : globalThis);
