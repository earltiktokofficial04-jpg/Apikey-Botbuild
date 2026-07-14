// Auto-detect project framework from an uploaded ZIP buffer.
// Ported from panel_bot_V3's detect_project() so the web upload flow
// behaves the same way as the Telegram bot's uploader — the user never
// has to pick the framework manually.

import AdmZip from 'adm-zip';

const ALL_MARKERS = [
  'pubspec.yaml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'apktool.yml',
  'package.json',
  'config.xml',
  'capacitor.config.json',
  'capacitor.config.ts',
  'AndroidManifest.xml',
];

export type DetectedProjectType =
  | 'Smali'
  | 'Flutter'
  | 'Ionic'
  | 'Capacitor'
  | 'React Native'
  | 'Cordova'
  | 'Android Native';

export function detectProjectType(fileBuffer: Buffer): DetectedProjectType | null {
  let zip: AdmZip;
  try {
    zip = new AdmZip(fileBuffer);
  } catch {
    return null;
  }

  const entries = zip.getEntries();
  const paths = entries.map((e) => e.entryName.replace(/\\/g, '/').replace(/\/$/, ''));

  const norm = (prefix: string, name: string) => (prefix ? `${prefix}/${name}` : name);
  const exists = (prefix: string, name: string) => paths.includes(norm(prefix, name));
  const hasDir = (prefix: string, name: string) => {
    const p = `${norm(prefix, name)}/`;
    return paths.some((x) => (x + '/').startsWith(p));
  };

  const isSmaliDir = (prefix: string) => {
    const hasApktool = exists(prefix, 'apktool.yml');
    const hasManifest = exists(prefix, 'AndroidManifest.xml');
    const hasSmali =
      hasDir(prefix, 'smali') || hasDir(prefix, 'smali_classes2') || hasDir(prefix, 'smali_classes3');
    return hasApktool || (hasManifest && hasSmali);
  };

  const anyMarker = (prefix: string) => ALL_MARKERS.some((m) => exists(prefix, m));

  // Figure out which "directory level" the actual project sits at —
  // some zips have the project at the root, some nest it one or two
  // folders deep (e.g. zips downloaded straight from GitHub).
  let projectPrefix = '';
  if (!anyMarker('') && !isSmaliDir('')) {
    const topLevelDirs = Array.from(
      new Set(paths.filter((p) => p.includes('/')).map((p) => p.split('/')[0]))
    ).sort();

    let found = false;
    for (const d of topLevelDirs) {
      if (isSmaliDir(d) || anyMarker(d)) {
        projectPrefix = d;
        found = true;
        break;
      }
    }

    if (!found) {
      outer: for (const d of topLevelDirs) {
        const subDirs = Array.from(
          new Set(
            paths
              .filter((p) => p.startsWith(`${d}/`) && p.slice(d.length + 1).includes('/'))
              .map((p) => p.slice(d.length + 1).split('/')[0])
          )
        ).sort();

        for (const d2 of subDirs) {
          const prefix2 = `${d}/${d2}`;
          if (isSmaliDir(prefix2) || anyMarker(prefix2)) {
            projectPrefix = prefix2;
            found = true;
            break outer;
          }
        }
      }
    }
  }

  // 1. Smali (APKTool-style decompiled project)
  const hasSmaliFolder =
    hasDir(projectPrefix, 'smali') ||
    hasDir(projectPrefix, 'smali_classes2') ||
    hasDir(projectPrefix, 'smali_classes3');
  if (exists(projectPrefix, 'apktool.yml') || (exists(projectPrefix, 'AndroidManifest.xml') && hasSmaliFolder)) {
    return 'Smali';
  }

  // 2. Flutter
  if (exists(projectPrefix, 'pubspec.yaml')) {
    return 'Flutter';
  }

  // 3. Node-based — read package.json to disambiguate
  if (exists(projectPrefix, 'package.json')) {
    try {
      const pkgPath = norm(projectPrefix, 'package.json');
      const pkgEntry = entries.find((e) => e.entryName.replace(/\\/g, '/') === pkgPath);
      if (pkgEntry) {
        const pkg = JSON.parse(pkgEntry.getData().toString('utf-8'));
        const deps: Record<string, string> = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
        const depStr = Object.keys(deps).join(' ').toLowerCase();
        const pkgName = (pkg.name || '').toLowerCase();

        const hasCapacitor = depStr.includes('@capacitor/core') || depStr.includes('@capacitor/android');
        const hasIonic = depStr.includes('@ionic') || pkgName.includes('ionic');

        if (hasIonic) return 'Ionic';
        if (hasCapacitor) return 'Capacitor';
        if (depStr.includes('react-native')) return 'React Native';
        if (exists(projectPrefix, 'config.xml')) return 'Cordova';
      }
    } catch {
      // fall through to other checks below
    }
  }

  // 4. Capacitor without a clear package.json match
  if (exists(projectPrefix, 'capacitor.config.json') || exists(projectPrefix, 'capacitor.config.ts')) {
    return 'Capacitor';
  }

  // 5. Cordova — config.xml only
  if (exists(projectPrefix, 'config.xml')) {
    return 'Cordova';
  }

  // 6. Native Android
  for (const f of ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts']) {
    if (exists(projectPrefix, f)) return 'Android Native';
  }

  return null;
}
