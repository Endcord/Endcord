/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css?screen";

import * as DataStore from "@api/DataStore";
import { getIsEndcordHidden } from "@api/EndcordVisibility";
import { Settings } from "@api/Settings";
import { EndcordMark } from "@components/EndcordIcons";
import { EndcordModal } from "@components/EndcordModal";
import ErrorBoundary from "@components/ErrorBoundary";
import { RenderModalProps } from "@endcord/discord-types";
import { classNameFactory, ENDCORD_THEME } from "@utils/css";
import { useI18n } from "@utils/i18n";
import { classes } from "@utils/misc";
import { compareVersions, pickUnseenRelease } from "@utils/releaseNotes";
import { createRoot, openModal, useEffect, useRef, useState } from "@webpack/common";

import { Release, RELEASES } from "./releases";

const cl = classNameFactory("ec-whats-new-");

const LAST_SEEN_KEY = "Endcord_lastSeenRelease";
const PILL_LIFETIME = 20_000;

function ReleaseModal({ release, ...props }: RenderModalProps & { release: Release; }) {
    const { t } = useI18n();

    return (
        <EndcordModal
            {...props}
            size="md"
            title={t("What's new in Endcord {version}", { version: release.version })}
            subtitle={t(release.summary)}
            actions={[{ text: t("Got it"), variant: "primary", onClick: props.onClose }]}
        >
            <ul className={cl("list")}>
                {release.highlights.map(({ Icon, title, description }, index) => (
                    <li key={title} className={cl("item")} style={{ animationDelay: `${index * 50}ms` }}>
                        <span className={cl("icon")}><Icon width={20} height={20} /></span>
                        <div>
                            <h3 className={cl("item-title")}>{t(title)}</h3>
                            <p className={cl("item-description")}>{t(description)}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </EndcordModal>
    );
}

/** The newest announced release this version already includes, or the one given */
export function openWhatsNewModal(release = RELEASES.find(({ version }) => compareVersions(version, VERSION) <= 0)) {
    if (!release) return false;

    openModal(props => <ReleaseModal {...props} release={release} />);
    return true;
}

function WhatsNewPill({ release, onClosed }: { release: Release; onClosed(): void; }) {
    const { t } = useI18n();
    const [leaving, setLeaving] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const stopTimer = () => clearTimeout(timer.current);
    const startTimer = () => {
        stopTimer();
        timer.current = setTimeout(() => setLeaving(true), PILL_LIFETIME);
    };

    useEffect(() => {
        startTimer();
        return stopTimer;
    }, []);

    return (
        <div
            className={classes(cl("pill", { leaving }), ENDCORD_THEME)}
            role="status"
            onMouseEnter={stopTimer}
            onMouseLeave={startTimer}
            onAnimationEnd={() => leaving && onClosed()}
        >
            <button
                className={cl("pill-open")}
                onClick={() => {
                    openWhatsNewModal(release);
                    setLeaving(true);
                }}
            >
                <span className="ec-mark-tile"><EndcordMark /></span>
                <span>{t("Endcord updated to {version}", { version: release.version })}</span>
                <span className={cl("pill-link")}>{t("See what's new")}</span>
            </button>
            <button className={cl("pill-close")} aria-label={t("Close")} onClick={() => setLeaving(true)}>×</button>
        </div>
    );
}

function showPill(release: Release) {
    const container = document.createElement("div");
    document.body.append(container);

    const root = createRoot(container);
    const onClosed = () => {
        root.unmount();
        container.remove();
    };

    root.render(
        <ErrorBoundary noop>
            <WhatsNewPill release={release} onClosed={onClosed} />
        </ErrorBoundary>
    );
}

export async function maybeShowWhatsNew(justUpdated: boolean) {
    const lastSeen = await DataStore.get<string>(LAST_SEEN_KEY);
    if (lastSeen !== VERSION) await DataStore.set(LAST_SEEN_KEY, VERSION);

    if (!Settings.autoUpdateNotification || getIsEndcordHidden()) return;

    const release = pickUnseenRelease(RELEASES, VERSION, lastSeen, justUpdated);
    if (release) showPill(release);
}
