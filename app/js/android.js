// =====================================================================
// android.js — l'app Android (APK hors Google Play, 23/11 ; voir ANDROID.md et .github/workflows/android.yml)
//
// L'APK ouvre la version web avec « ?source=android&v=<numéro de l'APK> » : on le retient sur le téléphone.
// Le contenu se met à jour tout seul avec le site ; seule l'enveloppe (APK) peut avoir une nouvelle version :
// le site publie son numéro dans /android/version.json et l'app propose alors de la télécharger (une fois par version).
// =====================================================================

B.ANDROID_APK_URL = 'https://github.com/AMAC-BIVOUAC/BIVOUAC-CONNECT/releases/download/android/bivouac-tech.apk';

(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('source') === 'android') store.set('android:shell', Number(q.get('v')) || 1);
})();

/** Tourne dans l'app Android ? */
B.isAndroidApp = () => !!store.get('android:shell') || document.referrer.startsWith('android-app://com.bivouactech.app');

/** Un téléphone Android dans un navigateur (pour mettre le bouton de téléchargement en avant) */
B.isAndroidBrowser = () => /Android/i.test(navigator.userAgent) && !B.isAndroidApp();

/** Nouvelle APK publiée ? On le propose une fois par version */
B.checkAndroidUpdate = async () => {
  const mine = Number(store.get('android:shell')) || 0;
  if (!mine || !window.BIVOUAC_WEB) return;
  const info = await fetch(`${B.SITE}/android/version.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!info || !(Number(info.versionCode) > mine) || store.get('android:offered') === info.versionCode) return;
  store.set('android:offered', info.versionCode);
  B.toast(tr("Nouvelle version de l'app Android ({version}). Téléchargez-la puis ouvrez le fichier pour la mettre à jour : vos données restent.", { version: esc(info.versionName || '') }), {
    timeout: 30000,
    actions: [[tr('Télécharger'), 'primary', () => window.bivouac.openExternal(info.url || B.ANDROID_APK_URL)], [tr('Plus tard'), '', () => {}]]
  });
};
