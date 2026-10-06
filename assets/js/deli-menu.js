/* ツバキ&デリ メニュー描画
 * microCMS未接続時は data/deli-menu.json の20枠を表示する。
 */
(function () {
  var scriptSrc = (document.currentScript && document.currentScript.getAttribute("src")) || "";
  var basePath = scriptSrc.replace(/assets\/js\/deli-menu\.js(?:\?.*)?$/, "");
  var LOCAL_DATA_URL = basePath + "data/deli-menu.json";
  var CMS_CONFIG = window.TSUBAKITEI_DELI_MENU_CMS || {};
  var formatPriceText = window.TsubakiteiPrice.formatPriceText;
  var bodyEl = document.getElementById("deli-menu-body");

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function yen(n) {
    return Number(n).toLocaleString("ja-JP");
  }

  function imageSrc(src) {
    if (!src) return "";
    if (/^(https?:)?\/\//.test(src) || src.charAt(0) === "/") return src;
    return basePath + src;
  }

  function getImageUrl(image) {
    if (!image) return "";
    if (typeof image === "string") return image;
    return image.url || "";
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = Number(value);
    return isNaN(n) ? null : n;
  }

  function priceText(item) {
    if (item.priceText) return formatPriceText(item.priceText);
    if (item.price && item.price > 0) return yen(item.price);
    return "";
  }

  function sortByOrder(a, b) {
    return (numberOrNull(a.sortOrder) || 0) - (numberOrNull(b.sortOrder) || 0);
  }

  function selectedValue(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function normalizeStore(value) {
    value = selectedValue(value);
    var v = String(value || "").trim();
    if (v === "deli" || v === "Deli" || v === "デリ" || v === "ツバキ&デリ") return "deli";
    if (v === "tsubakitei" || v === "ツバキ亭" || v === "洋食ツバキ亭" || v === "本店") return "tsubakitei";
    return "";
  }

  function normalizeItems(data) {
    var rows = data.contents || data.items || [];
    return rows.filter(function (row) {
      var store = row.storeSingle || row.storeSelect || row.store;
      return row.visible !== false && (!store || normalizeStore(store) === "deli");
    }).sort(sortByOrder).map(function (row) {
      return {
        name: row.name || "coming soon...",
        description: row.description || "",
        price: numberOrNull(row.price),
        priceText: row.priceText || "",
        image: getImageUrl(row.image) || row.imagePath || ""
      };
    });
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function microCmsUrl() {
    return microCmsUrlFor(CMS_CONFIG.endpoint);
  }

  function microCmsUrlFor(endpoint) {
    var queries = CMS_CONFIG.queries || "limit=100&orders=sortOrder";
    return "https://" + CMS_CONFIG.serviceDomain + ".microcms.io/api/v1/" + endpoint + "?" + queries;
  }

  function fetchLegacyMenu() {
    return fetchJson(microCmsUrlFor(CMS_CONFIG.fallbackEndpoint), {
      cache: "no-cache",
      headers: { "X-MICROCMS-API-KEY": CMS_CONFIG.apiKey }
    });
  }

  function loadData() {
    if (CMS_CONFIG.enabled && CMS_CONFIG.serviceDomain && CMS_CONFIG.endpoint && CMS_CONFIG.apiKey) {
      return fetchJson(microCmsUrl(), {
        cache: "no-cache",
        headers: { "X-MICROCMS-API-KEY": CMS_CONFIG.apiKey }
      }).then(function (data) {
        if (CMS_CONFIG.fallbackEndpoint && (!data.contents || !data.contents.length)) {
          console.warn("microCMS split deli menu is empty. Fallback to legacy endpoint.");
          return fetchLegacyMenu();
        }
        return data;
      }).catch(function (e) {
        if (!CMS_CONFIG.fallbackEndpoint) throw e;
        console.warn("microCMS split deli menu load failed. Fallback to legacy endpoint.", e);
        return fetchLegacyMenu();
      }).catch(function (e) {
        console.warn("microCMS deli menu load failed. Fallback to local JSON.", e);
        return fetchJson(LOCAL_DATA_URL, { cache: "no-cache" });
      });
    }
    return fetchJson(LOCAL_DATA_URL, { cache: "no-cache" });
  }

  function render(items) {
    if (!items.length) {
      bodyEl.innerHTML = '<p style="text-align:center">Coming soon...</p>';
      return;
    }
    bodyEl.innerHTML = items.map(function (item) {
      var image = item.image
        ? '<img class="deli-thumb-img" src="' + esc(imageSrc(item.image)) + '" alt="' + esc(item.name) + '" loading="lazy">'
        : '<span class="deli-thumb-empty" aria-hidden="true"></span>';
      var p = priceText(item);
      return '<div class="deli-menu-item">' +
        '<div class="deli-thumb">' + image + '</div>' +
        '<div class="deli-body"><div class="deli-name">' + esc(item.name) + '</div>' +
        (item.description ? '<div class="deli-desc">' + esc(item.description) + '</div>' : '') +
        '</div>' +
        '<div class="deli-price">' + esc(p || "...") + '</div>' +
        '</div>';
    }).join("");
  }

  if (!bodyEl) return;
  loadData()
    .then(function (data) { render(normalizeItems(data)); })
    .catch(function (e) {
      bodyEl.innerHTML = '<p style="text-align:center">メニューを読み込めませんでした。</p>';
      console.error(e);
    });
})();
