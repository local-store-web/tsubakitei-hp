/* This file is public: never place credentials here.
 * The Xserver proxy is used only on the canonical domain.
 */
(function (root) {
  var canonical = /^(www\.)?tsubakitei\.com$/i.test(root.location && root.location.hostname || "");
  root.TSUBAKITEI_DELI_MENU_CMS = {
    enabled: false,
    proxyUrl: canonical ? "/api/menu.php?store=deli" : "",
    publicSnapshotPath: "data/deli-menus-public.json"
  };
})(window);
