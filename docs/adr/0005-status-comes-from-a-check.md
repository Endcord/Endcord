# 5. A status shown to people comes from a check that ran

## Context

Endcord shows a security card and memory numbers inside Discord. A card like that is only worth reading if it can also say something is wrong. A light that is always green says nothing, and a figure nobody measured stops people believing the checks that are real once they notice.

## Decision

- The security card has three lights: release signature, installed files and update recovery. Each can pass, wait or fail, and none starts green. The updater fills them in from what it did: the signature is checked on every manifest it fetches, and the files are hashed against the signed list only while that release is the one running.
- Protections with nothing to check at runtime are listed as built in, without a light.
- Memory figures come from `app.getAppMetrics()` before and after each cleanup, so a cleanup that freed nothing counts as zero. Plugin times come from `performance.now()` around `start()` and each patch.
- What can't be measured isn't shown. That rules out battery savings. Game Mode's frame cap was measured from a Chromium trace before its description said so, and the description says what it leaves alone: video and streams keep their own speed.

## Consequences

- The card often says some checks are waiting, for example on a fresh install, which has no earlier version to go back to yet.
- The figures can look unimpressive. That's accepted: they're the same figures someone would get measuring it themselves.
