// Configuration du packaging macOS.
// Sans certificat Apple : signature « ad-hoc » (obligatoire sur Mac M1/M2/M3…).
// Avec certificat (secrets CSC_LINK + APPLE_ID dans GitHub) : signature Developer ID + notarisation automatiques.
const signing = !!process.env.CSC_LINK;

module.exports = {
  appId: 'fr.questflow.app',
  productName: 'QuestFlow',
  copyright: '© 2026 Stella Augusto',
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist/**', 'src/main/**', 'src/shared/**', 'package.json', '!**/*.map'],
  asar: true,
  mac: {
    category: 'public.app-category.productivity',
    icon: 'build/icon.png',
    target: [
      { target: 'pkg', arch: ['universal'] },
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    identity: signing ? undefined : '-',
    hardenedRuntime: signing,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: signing && !!process.env.APPLE_ID,
    minimumSystemVersion: '12.0',
    artifactName: 'QuestFlow-${version}-mac-${arch}.${ext}',
    extendInfo: {
      NSUserNotificationAlertStyle: 'alert',
      LSMultipleInstancesProhibited: true,
    },
  },
  pkg: {
    artifactName: 'QuestFlow-Setup.${ext}',
    installLocation: '/Applications',
    isRelocatable: false,
    isVersionChecked: false,
    overwriteAction: 'upgrade',
    allowAnywhere: false,
    allowCurrentUserHome: false,
    allowRootDirectory: true,
    mustClose: ['fr.questflow.app'],
    welcome: 'pkg/welcome.html',
    conclusion: 'pkg/conclusion.html',
  },
  dmg: {
    artifactName: 'QuestFlow.${ext}',
    title: 'QuestFlow',
    contents: [
      { x: 150, y: 190, type: 'file' },
      { x: 390, y: 190, type: 'link', path: '/Applications' },
    ],
  },
  publish: null,
};
