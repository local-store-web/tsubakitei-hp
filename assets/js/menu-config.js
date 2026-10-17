/* Public browser settings: no API keys or credentials.
 * GitHub Pages uses a public-data snapshot. The canonical site uses
 * a same-origin Xserver PHP endpoint, with the credential server-side.
 */
(function (root) {
  var canonical = /^(www\.)?tsubakitei\.com$/i.test(root.location && root.location.hostname || "");
  root.TSUBAKITEI_MENU_CMS = {
    enabled: false,
    proxyUrl: canonical ? "/api/menu.php?store=tsubakitei" : "",
    publicSnapshotUrl: "../data/tsubakitei-menus-public.json"
  };
})(window);
