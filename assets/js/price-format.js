/* Price fields only: keep ordinary text such as 150円 untouched. */
(function (root) {
  function formatPriceText(value) {
    return String(value == null ? "" : value)
      .replace(/[¥￥]/g, "")
      .replace(/各\s*(?=\d)/g, "")
      .replace(/(^|[^\d,])(\d{4,})(?![\d,])/g, function (_, prefix, digits) {
        return prefix + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      });
  }
  function formatDinnerPriceText(value) {
    return formatPriceText(value).replace(/(\d[\d,]*)\s*[（(]\s*(?:税込\s*)?(\d[\d,]*)\s*[）)]/g, "$1 ($2)");
  }
  root.TsubakiteiPrice = { formatPriceText: formatPriceText, formatDinnerPriceText: formatDinnerPriceText };
  if (typeof module !== "undefined" && module.exports) module.exports = { formatPriceText: formatPriceText, formatDinnerPriceText: formatDinnerPriceText };
})(typeof window !== "undefined" ? window : globalThis);
