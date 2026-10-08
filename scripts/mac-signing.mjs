// How the Mac app gets signed, and what macOS will make of it.
//
// Three ways it can go, the best one this Mac allows:
//
//   notarized   a "Developer ID Application" certificate is in the keychain and Apple's
//               notary can be reached with saved credentials: the app is signed, sent to
//               Apple, and comes back with a ticket. A downloaded copy opens like any app.
//   signed      the certificate is there but not the credentials: signed, not notarized.
//               macOS still blocks a downloaded copy until the person allows it.
//   ad hoc      no certificate: signed by nobody (electron-builder.adhoc.yml), which is
//               what keeps a Mac with an Apple chip from calling the app "damaged".
//               Blocked the same way.
//
// Nothing secret is read or written here. The certificate lives in the keychain; so do the
// notary's credentials, saved once under a name by `xcrun notarytool store-credentials`.
//
// Every command goes through `exec(command, args) -> { status, text }`, so that this can be
// tried without a Mac.

/** The name the notary's credentials are saved under in the keychain. */
export const KEYCHAIN_PROFILE = 'SillySimple'

/**
 * What the build will do, found out before anything is built.
 * `env`: what to add to the packager's environment.
 */
export function signingPlan(exec, env = process.env) {
  const identities = exec('security', ['find-identity', '-v', '-p', 'codesigning'])
  const certificate = /"(Developer ID Application: [^"]+)"/.exec(identities.text)?.[1] ?? null
  if (!certificate) return { way: 'adhoc', certificate: null, team: null, env: {}, credentials: null, problem: null }
  const team = /\(([A-Z0-9]{10})\)\s*$/.exec(certificate)?.[1] ?? null

  // Credentials given for this run win: an Apple ID with an app-specific password, an API
  // key, or another keychain profile. The packager reads them itself.
  for (const [name, what] of [
    ['APPLE_KEYCHAIN_PROFILE', 'the keychain profile named in APPLE_KEYCHAIN_PROFILE'],
    ['APPLE_API_KEY', 'the API key in APPLE_API_KEY'],
    ['APPLE_ID', 'the Apple ID in APPLE_ID'],
  ]) {
    if (env[name]) return { way: 'notarized', certificate, team, env: {}, credentials: what, problem: null }
  }

  // Otherwise the profile saved in the keychain, tried by asking the notary for anything.
  const asked = exec('xcrun', ['notarytool', 'history', '--keychain-profile', KEYCHAIN_PROFILE])
  if (asked.status === 0) {
    return { way: 'notarized', certificate, team, env: { APPLE_KEYCHAIN_PROFILE: KEYCHAIN_PROFILE }, credentials: `the keychain profile "${KEYCHAIN_PROFILE}"`, problem: null }
  }
  const lines = asked.text.split('\n').map((line) => line.trim()).filter(Boolean)
  const missing = /no keychain password item|not found for profile|could not find/i.test(asked.text)
  return {
    way: 'signed',
    certificate,
    team,
    env: {},
    credentials: null,
    problem: missing ? null : (lines.find((line) => /error/i.test(line)) ?? lines.at(-1) ?? 'the notary did not answer'),
  }
}

/** The plan in words, and what to do to get to the next way. */
export function explainPlan(plan) {
  const lines = []
  if (plan.way === 'notarized') {
    lines.push(`Signed with "${plan.certificate}" and notarized by Apple, with ${plan.credentials}.`, 'A downloaded copy will open like any app.')
    return lines
  }
  if (plan.way === 'signed') {
    lines.push(`Signed with "${plan.certificate}", but NOT notarized: macOS will block a downloaded copy until the person allows it.`)
    if (plan.problem) lines.push(`The notary was asked with the keychain profile "${KEYCHAIN_PROFILE}" and said: ${plan.problem}`)
    lines.push(
      'To notarize, save credentials for the notary once (it asks for an app-specific password, made at account.apple.com > Sign-In and Security):',
      `  xcrun notarytool store-credentials "${KEYCHAIN_PROFILE}" --apple-id YOUR_APPLE_ID_EMAIL --team-id ${plan.team ?? 'YOUR_TEAM_ID'}`,
    )
    return lines
  }
  lines.push(
    'No "Developer ID Application" certificate in the keychain: the app is signed ad hoc (by nobody).',
    'macOS will block a downloaded copy until the person allows it (System Settings > Privacy & Security > Open Anyway).',
    'With an Apple Developer account, make the certificate once: Xcode > Settings > Accounts > your team > Manage Certificates > + > Developer ID Application.',
    '(Only the Account Holder of the team can. "Apple Development" and "Apple Distribution" certificates are for the App Store and do not count.)',
  )
  return lines
}

/**
 * What macOS makes of an app that was built: who signed it, and whether Gatekeeper lets a
 * downloaded copy open (`opens`).
 */
export function inspectApp(exec, app) {
  const told = exec('codesign', ['-dv', '--verbose=2', app]).text
  const verifies = exec('codesign', ['--verify', '--deep', '--strict', app]).status === 0
  const authority = /^Authority=(Developer ID Application: .+)$/m.exec(told)?.[1] ?? null
  const adhoc = /Signature=adhoc/.test(told)
  const stapled = exec('xcrun', ['stapler', 'validate', app]).status === 0
  const gate = exec('spctl', ['--assess', '--type', 'execute', '-vv', app])
  const opens = gate.status === 0 && /accepted/.test(gate.text)
  const signed = authority ? `signed by ${authority.replace('Developer ID Application: ', '')}` : adhoc ? 'signed ad hoc (by nobody)' : 'NOT SIGNED'
  let verdict
  if (!verifies) verdict = 'AND THE SIGNATURE DOES NOT VERIFY: a downloaded copy will be called "damaged"'
  else if (opens) verdict = stapled ? 'notarized: a downloaded copy opens like any app' : 'accepted by Gatekeeper'
  else if (authority) verdict = 'NOT notarized: macOS blocks a downloaded copy until the person allows it'
  else verdict = 'macOS blocks a downloaded copy until the person allows it'
  return { opens, verifies, text: `${signed}, ${verdict}` }
}
